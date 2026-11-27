/** Exact current-eligibility follow-up deployment. Disabled until separately explicitly approved. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { validateOperationalPromotionSources,reconcileOperationalPromotionInTransaction } from '@/server/operational-data-promotion';
const approved='81c8099d2816afb7a5606a8e5264807236dd3e1189e2ba5172f306232f562da2';


if (process.env.APPROVED_CURRENT_ELIGIBILITY_FOLLOWUP !== approved) throw Error('Exact reviewed operational promotion approval is required. No database connection was opened.');
const url = new URL(process.env.DATABASE_URL!);
if (url.pathname !== '/fantasy_evolution' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.searchParams.has('schema')) throw Error('Expected the preserved local development database.');
const paused = () => access('.dev-stack-lock').then(() => { throw Error('Pause the managed development stack before the approved backfill.'); }, (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
await paused();
const directory='data/operational_enrichment/current_eligibility_followup';
const manifest=await validateOperationalPromotionSources(JSON.parse(await readFile(`${directory}/reviewed_manifest.json`,'utf8')));
if(fingerprint(manifest)!==approved)throw Error('Frozen approved operational target changed; separate review required.');
const validation=z.object({fingerprint:z.literal(approved),targetDatabase:z.literal('fantasy_evolution_test'),developmentWrites:z.literal(0),originalTablesPreserved:z.literal(89),originalRowsUnchanged:z.literal(true),lateSemanticAtomicRollback:z.literal(true),replayChanges:z.literal(0),sourceProofsVerified:z.literal(true),ownershipAndFinancialHistoryPreserved:z.literal(true),finalizedCompetitionUnchanged:z.literal(true),appendCounts:z.record(z.string(),z.number().int().nonnegative().max(100000))}).parse(JSON.parse(await readFile(`${directory}/populated_copy_validation.json`,'utf8')));
const reconcile=(apply=false)=>getDatabase().$transaction(async tx=>{if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileOperationalPromotionInTransaction(tx,manifest,apply?{expectedFingerprint:approved}:undefined,new Date());},{isolationLevel:'Serializable',timeout:600000});
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
  const dry = await reconcile();
  if (dry.fingerprint !== approved || dry.changes !== 18 || dry.availabilityAppends!==0 || dry.rookieAppends!==0 || dry.seasonAppends!==0) throw Error('Reviewed canonical heads changed or this target was already applied.');
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: {tablename: string}) => row.tablename);
  if (tables.length !== 90 || !tables.includes('_prisma_migrations')) throw Error('Expected 89 application tables plus the preserved migration table.');
  const appendable = new Set(['ProfessionalDataObservation','ProfessionalDataDecision']);
  for (const table of tables) {
    const expected=table==='_prisma_migrations'?0:validation.appendCounts[table];
    if(expected===undefined||!appendable.has(table)&&expected!==0)throw Error('Unreviewed table append scope.');
    if (table !== '_prisma_migrations' && validation.appendCounts[table] !== expected) throw Error(`Copy append scope changed: ${table}.`);
  }
  for (const table of appendable) {
    await client.query(`CREATE TEMP TABLE ${q('operational_before_' + table)} AS SELECT id FROM public.${q(table)}`);
    await client.query(`CREATE UNIQUE INDEX ON ${q('operational_before_' + table)} (id)`);
    await client.query(`ANALYZE ${q('operational_before_' + table)}`);
  }
  const snapshot = async (table: string, originalOnly = false): Promise<Snapshot> => (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${q(table)} t ${originalOnly && appendable.has(table) ? `WHERE EXISTS(SELECT 1 FROM ${q('operational_before_' + table)} old WHERE old.id=t.id)` : ''}`)).rows[0];
  const before = new Map<string, Snapshot>();
  for (const table of tables) before.set(table, await snapshot(table));
  await writeFile('/private/tmp/m5-current-eligibility-before.json', JSON.stringify(Object.fromEntries(before), null, 2), { mode: 0o600 });
  const backupDirectory = 'data/private_backups';
  run('git', ['check-ignore', `${backupDirectory}/check.dump`]);
  run('git', ['check-ignore', `${directory}/development_application.json`]);
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const cluster = (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
  const backupCluster = run('docker', ['exec', 'fantasysportssite-postgres-1', 'psql', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Atc', 'SELECT system_identifier::text FROM pg_control_system()']).stdout?.toString().trim();
  if (!cluster || cluster !== backupCluster) throw Error('Backup container does not match the connected development cluster.');
  const backupPath = `${backupDirectory}/fantasy_evolution_pre_current_eligibility_followup_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.dump`;
  const backupFile = await open(backupPath, 'wx', 0o600);
  try { run('docker', ['exec', 'fantasysportssite-postgres-1', 'pg_dump', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Fc'], { stdio: ['ignore', backupFile.fd, 'pipe'] }); }
  finally { await backupFile.close(); }
  const bytes = await readFile(backupPath);
  for (const args of [['--list'], ['--file=/dev/null']]) run('docker', ['exec', '-i', 'fantasysportssite-postgres-1', 'pg_restore', ...args], { input: bytes });
  const backup = { path: backupPath, bytes: bytes.length, sha256: hash(bytes), archiveListAndFullDecodeVerified: true, clusterVerified: true };
  await writeFile('/private/tmp/m5-current-eligibility-backup.json', JSON.stringify(backup, null, 2), { mode: 0o600 });
  await paused();
  for (const table of tables) if (JSON.stringify(await snapshot(table)) !== JSON.stringify(before.get(table)) || JSON.stringify(await snapshot(table, true)) !== JSON.stringify(before.get(table))) throw Error(`Data changed during backup: ${table}.`);
  await validateOperationalPromotionSources(manifest);
  const applied = await reconcile(true);
  if (applied.changes !== 18 || applied.availabilityAppends!==0 || applied.rookieAppends!==0 || applied.seasonAppends!==0) throw Error('Unexpected approved operational append count. Preserve the backup and investigate.');
  const verify = async () => {
    for (const table of tables) {
      if (JSON.stringify(await snapshot(table, true)) !== JSON.stringify(before.get(table))) throw Error(`Original rows changed: ${table}. Preserve the backup and investigate.`);
      if (Number((await snapshot(table)).count) !== Number(before.get(table)!.count) + (validation.appendCounts[table]??0)) throw Error(`Unexpected append scope: ${table}.`);
    }
  };
  await verify();
  const replay=await reconcile();
  if(replay.changes||replay.competitive?.newStatistics||replay.competitive?.newScoreEntries)throw Error('Operational replay is not idempotent; preserve private backup and investigate.');
  await verify();
  const resultingTables: Record<string, Snapshot> = {};
  for (const table of tables) resultingTables[table] = await snapshot(table);
  const report = { approvedFingerprint: approved, applied, replayChanges: 0, originalTablesPreserved: tables.length,
    originalRowsUnchanged:true,currentEligibilityChanges:"EXACT_REVIEWED_PROSPECTIVE_POLICY_ONLY",competitiveResultsChanged:false,sourceFilesPreserved:true,backup, migrationCount: migrations, originalTables: Object.fromEntries(before), resultingTables };
  await writeFile(`${directory}/development_application.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally { if (connected) await client.end(); await db.$disconnect(); await lock.close(); await rm(operatorLock); }
