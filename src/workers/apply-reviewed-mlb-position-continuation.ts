/** Prepared separate historical-only deployment. Requires explicit approval; never grants current eligibility. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { loadMlbPositionContinuation, mlbPositionContinuationFingerprint as approved } from '@/ingestion/mlb-position-continuation';
import { reconcileHistoricalPositions } from '@/server/historical-position-reconciliation';

if (process.env.APPROVED_MLB_POSITION_CONTINUATION !== approved) throw Error('Exact separate MLB historical position approval is required. No database connection was opened.');
const url = new URL(process.env.DATABASE_URL!);
if (url.pathname !== '/fantasy_evolution' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.searchParams.has('schema')) throw Error('Expected the preserved local development database.');
const paused = () => access('.dev-stack-lock').then(() => { throw Error('Pause the managed development stack before the approved backfill.'); }, (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
await paused();
const { manifest, preview, sourceProofs, directory } = await loadMlbPositionContinuation();
const validation = z.object({ fingerprint: z.literal(approved), targetDatabase: z.literal('fantasy_evolution_test'), developmentWrites: z.literal(0),
  originalTablesPreserved: z.literal(89), originalRowsUnchanged: z.literal(true), replayChanges: z.literal(0),
  originalPublicationAndNormalizedPreserved: z.literal(251), currentEligibilityChanges: z.literal(0), scoreLedgerChanges: z.literal(0),
  appendCounts: z.record(z.string(), z.number().int().nonnegative()),
  dryRun: z.object({ changes: z.literal(251), players: z.literal(9), fingerprint: z.literal(approved) }),
  applied: z.object({ changes: z.literal(251), players: z.literal(9), fingerprint: z.literal(approved) }),
  priorTargets: z.array(z.unknown()), sourceProofs: z.unknown(),
}).parse(JSON.parse(await readFile(`${directory}/mlb_nine_role_historical_copy_validation.json`, 'utf8')));
if (JSON.stringify(validation.priorTargets) !== JSON.stringify(preview.targets) || JSON.stringify(validation.sourceProofs) !== JSON.stringify(sourceProofs)) throw Error('Copy validation source/target bindings changed.');
const run = (command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) => {
  const result = spawnSync(command, args, { maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) throw Error(`${command} failed; inspect the private deployment log. No automatic restoration is attempted.`);
  return result;
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
type Snapshot = {count: string; fingerprint: string};
const operatorLock = '.reviewed-data-application-lock', lock = await open(operatorLock, 'wx', 0o600);
const client = new pg.Client({ connectionString: url.href }), db = getDatabase();
let connected = false;
try {
  await lock.writeFile(JSON.stringify({ pid: process.pid, fingerprint: approved, startedAt: new Date().toISOString() }));
  await client.connect(); connected = true;
  if (!(await client.query("SELECT pg_try_advisory_lock(hashtext('m5-reviewed-accelerated-deployment')) AS acquired")).rows[0].acquired) throw Error('Another reviewed deployment is active.');
  const migrations = (await client.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].n;
  const unfinished = (await client.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows[0].n;
  if (migrations !== 28 || unfinished) throw Error('Expected the clean reviewed 28-migration baseline.');
  const dry = await reconcileHistoricalPositions(manifest);
  if (dry.fingerprint !== approved || dry.changes !== 251 || dry.players !== 9) throw Error('Reviewed canonical heads changed or this target was already applied.');
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: {tablename: string}) => row.tablename);
  if (tables.length !== 90 || !tables.includes('_prisma_migrations')) throw Error('Expected 89 application tables plus the preserved migration table.');
  const appendable = new Set(['PlayerGameStat', 'ImportBatch']);
  for (const table of tables) {
    const expected = table === 'PlayerGameStat' ? 251 : table === 'ImportBatch' ? 1 : 0;
    if (table !== '_prisma_migrations' && validation.appendCounts[table] !== expected) throw Error(`Copy append scope changed: ${table}.`);
  }
  for (const table of appendable) {
    await client.query(`CREATE TEMP TABLE ${q('mlb_position_before_' + table)} AS SELECT id FROM public.${q(table)}`);
    await client.query(`CREATE UNIQUE INDEX ON ${q('mlb_position_before_' + table)} (id)`);
    await client.query(`ANALYZE ${q('mlb_position_before_' + table)}`);
  }
  const snapshot = async (table: string, originalOnly = false): Promise<Snapshot> => (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${q(table)} t ${originalOnly && appendable.has(table) ? `WHERE id IN(SELECT id FROM ${q('mlb_position_before_' + table)})` : ''}`)).rows[0];
  const before = new Map<string, Snapshot>();
  for (const table of tables) before.set(table, await snapshot(table));
  await writeFile('/private/tmp/m5-mlb-position-continuation-before.json', JSON.stringify(Object.fromEntries(before), null, 2), { mode: 0o600 });
  const backupDirectory = 'data/private_backups';
  run('git', ['check-ignore', `${backupDirectory}/check.dump`]);
  run('git', ['check-ignore', `${directory}/mlb_nine_role_historical_development_application.json`]);
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const cluster = (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
  const backupCluster = run('docker', ['exec', 'fantasysportssite-postgres-1', 'psql', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Atc', 'SELECT system_identifier::text FROM pg_control_system()']).stdout?.toString().trim();
  if (!cluster || cluster !== backupCluster) throw Error('Backup container does not match the connected development cluster.');
  const backupPath = `${backupDirectory}/fantasy_evolution_pre_mlb_position_continuation_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.dump`;
  const backupFile = await open(backupPath, 'wx', 0o600);
  try { run('docker', ['exec', 'fantasysportssite-postgres-1', 'pg_dump', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Fc'], { stdio: ['ignore', backupFile.fd, 'pipe'] }); }
  finally { await backupFile.close(); }
  const bytes = await readFile(backupPath);
  for (const args of [['--list'], ['--file=/dev/null']]) run('docker', ['exec', '-i', 'fantasysportssite-postgres-1', 'pg_restore', ...args], { input: bytes });
  const backup = { path: backupPath, bytes: bytes.length, sha256: hash(bytes), archiveListAndFullDecodeVerified: true, clusterVerified: true };
  await writeFile('/private/tmp/m5-mlb-position-continuation-backup.json', JSON.stringify(backup, null, 2), { mode: 0o600 });
  await paused();
  for (const table of tables) if (JSON.stringify(await snapshot(table)) !== JSON.stringify(before.get(table)) || JSON.stringify(await snapshot(table, true)) !== JSON.stringify(before.get(table))) throw Error(`Data changed during backup: ${table}.`);
  const applied = await reconcileHistoricalPositions(manifest, { expectedFingerprint: approved });
  if (applied.changes !== 251 || applied.players !== 9) throw Error('Unexpected approved position append count. Preserve the backup and investigate.');
  const verify = async () => {
    for (const table of tables) {
      if (JSON.stringify(await snapshot(table, true)) !== JSON.stringify(before.get(table))) throw Error(`Original rows changed: ${table}. Preserve the backup and investigate.`);
      if (Number((await snapshot(table)).count) !== Number(before.get(table)!.count) + (table === 'PlayerGameStat' ? 251 : table === 'ImportBatch' ? 1 : 0)) throw Error(`Unexpected append scope: ${table}.`);
    }
  };
  await verify();
  const preserved = (await client.query(`SELECT count(*)::int AS n FROM "PlayerGameStat" n JOIN "PlayerGameStat" p ON p.id=n."priorRevisionId" WHERE NOT EXISTS(SELECT 1 FROM "mlb_position_before_PlayerGameStat" baseline WHERE baseline.id=n.id) AND n.normalized=p.normalized AND n."sourceKnownAt" IS NOT DISTINCT FROM p."sourceKnownAt" AND n."gameId"=p."gameId" AND n."playerId"=p."playerId" AND n."teamId"=p."teamId" AND n.role=p.role AND n.provider=p.provider AND n."sourceLine" IS NOT DISTINCT FROM p."sourceLine" AND n.revision=p.revision+1 AND cardinality(p."observedPositions")=0 AND n.raw->'original'=p.raw AND n.raw->'historicalPositionRepair'->>'sourceProvider'='recovered-mlb-game-role-evidence' AND to_jsonb(n."observedPositions")=n.raw->'historicalPositionRepair'->'positions'`)).rows[0].n;
  if (preserved !== 251) throw Error('Publication/statistical preservation failed. Preserve the backup and investigate.');
  const replay = await reconcileHistoricalPositions(manifest);
  if (replay.changes) throw Error('Historical position replay was not idempotent.');
  await verify();
  const resultingTables: Record<string, Snapshot> = {};
  for (const table of tables) resultingTables[table] = await snapshot(table);
  const report = { approvedFingerprint: approved, applied, replayChanges: 0, originalTablesPreserved: tables.length,
    originalRowsUnchanged: true, originalPublicationAndNormalizedPreserved: preserved, currentEligibilityChanges: 0,
    scoreLedgerChanges: 0, sourceProofs, backup, migrationCount: migrations, originalTables: Object.fromEntries(before), resultingTables };
  await writeFile(`${directory}/mlb_nine_role_historical_development_application.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally { if (connected) await client.end(); await db.$disconnect(); await lock.close(); await rm(operatorLock); }
