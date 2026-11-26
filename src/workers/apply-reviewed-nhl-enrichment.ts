import 'dotenv/config';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabase } from '@/lib/db';
import { reconcileHistoricalStatistics } from '@/server/historical-stat-enrichment';

const approved = 'ebef6aa292e8cebc466f9b6f12fdd1ce15e21b99bcca6730690ccda70ce30f61';
if (process.env.APPROVED_NHL_BACKFILL !== approved) throw Error('Exact NHL backfill approval is required.');
const url = new URL(process.env.DATABASE_URL!);
if (url.pathname !== '/fantasy_evolution' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.searchParams.has('schema')) throw Error('Expected the preserved local development database.');
await access('.dev-stack-lock').then(() => { throw Error('Pause the managed development stack before the approved backfill.'); }, (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
const run = (command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) => {
  const result = spawnSync(command, args, { maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) throw Error(`${command} failed; inspect the private deployment log.`);
  return result;
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const client = new pg.Client({ connectionString: url.href }), db = getDatabase();
await client.connect();
try {
  const migrations = (await client.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].n;
  if (migrations !== 28) throw Error('Expected the reviewed 28-migration baseline.');
  const manifest = JSON.parse(await readFile('data/stat_enrichment/nhl_real_manifest.json', 'utf8'));
  for (const proof of manifest.sourceProofs) if (hash(await readFile(`data/provider_previews/objects/${proof.sha256}`)) !== proof.sha256) throw Error('Approved source object changed.');
  const dry = await reconcileHistoricalStatistics(manifest);
  if (dry.fingerprint !== approved || dry.changes !== 11808 || dry.players !== 785) throw Error('Approved exact NHL target changed or has already been applied.');
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows as { tablename: string }[];
  for (const table of ['PlayerGameStat', 'ImportBatch']) await client.query(`CREATE TEMP TABLE ${q('nhl_baseline_' + table)} AS SELECT id FROM ${q(table)}`);
  const snapshot = async (table: string) => (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${q(table)} t ${['PlayerGameStat','ImportBatch'].includes(table) ? `WHERE id IN (SELECT id FROM ${q('nhl_baseline_' + table)})` : ''}`)).rows[0];
  const before = new Map(); for (const { tablename } of tables) before.set(tablename, await snapshot(tablename));
  await writeFile('/private/tmp/m5-nhl-backfill-before.json', JSON.stringify(Object.fromEntries(before), null, 2), { mode: 0o600 });
  const directory = 'data/private_backups'; run('git', ['check-ignore', `${directory}/check.dump`]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backupPath = `${directory}/fantasy_evolution_pre_nhl_enrichment_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.dump`;
  const backupFile = await open(backupPath, 'wx', 0o600);
  try { run('docker', ['exec', 'fantasysportssite-postgres-1', 'pg_dump', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Fc'], { stdio: ['ignore', backupFile.fd, 'pipe'] }); } finally { await backupFile.close(); }
  const bytes = await readFile(backupPath);
  for (const args of [['--list'], ['--file=/dev/null']]) run('docker', ['exec', '-i', 'fantasysportssite-postgres-1', 'pg_restore', ...args], { input: bytes });
  const backup = { path: backupPath, bytes: bytes.length, sha256: hash(bytes), archiveListAndFullDecodeVerified: true };
  await writeFile('/private/tmp/m5-nhl-backfill-backup.json', JSON.stringify(backup, null, 2), { mode: 0o600 });
  const applied = await reconcileHistoricalStatistics(manifest, { expectedFingerprint: approved });
  for (const { tablename } of tables) if (JSON.stringify(await snapshot(tablename)) !== JSON.stringify(before.get(tablename))) throw Error(`Original rows changed: ${tablename}. Preserve the backup and inspect.`);
  const appended = (await client.query(`SELECT count(*)::int AS n FROM "PlayerGameStat" n JOIN "PlayerGameStat" p ON p.id=n."priorRevisionId" WHERE n.id NOT IN (SELECT id FROM "nhl_baseline_PlayerGameStat") AND n."gameId"=p."gameId" AND n."playerId"=p."playerId" AND n.role=p.role AND n."sourceKnownAt" IS NOT DISTINCT FROM p."sourceKnownAt" AND n."observedPositions"=p."observedPositions" AND (n.normalized-'faceoff_wins'-'shorthanded_points_bonus')=(p.normalized-'faceoff_wins'-'shorthanded_points_bonus')`)).rows[0].n;
  if (appended !== 11808 || await db.importBatch.count() !== Number(before.get('ImportBatch').count) + 1) throw Error('Unexpected NHL append scope.');
  const replay = await reconcileHistoricalStatistics(manifest);
  if (replay.changes !== 0 || replay.alreadyApplied !== 11808) throw Error('NHL backfill replay failed.');
  const report = { approvedFingerprint: approved, applied, replayChanges: replay.changes, originalTablesPreserved: tables.length, originalRowsUnchanged: true, publicationAndPositionsPreserved: true, competitiveLedgerChanges: 0, backup, migrationCount: migrations, resultingStatRevisions: await db.playerGameStat.count() };
  await writeFile('data/stat_enrichment/nhl_development_application.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await client.end(); await db.$disconnect(); }
