/** Prepared deployment entry point. Do not run until the exact consolidated review is approved. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { reconcileAcceleratedBatch } from '@/server/accelerated-data-batch';

// Frozen review target. Setting the approval environment variable requires explicit user approval.
const approved: string = '387869154d0a85654c6e86c97877b2ecfdfaa199cd8e149b4ba72c51ca604940';
if (!/^[a-f0-9]{64}$/.test(approved) || process.env.APPROVED_ACCELERATED_BACKFILL !== approved) {
  throw Error('Exact consolidated accelerated backfill approval is required. No database connection was opened.');
}
const url = new URL(process.env.DATABASE_URL!);
if (url.pathname !== '/fantasy_evolution' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.searchParams.has('schema')) {
  throw Error('Expected the preserved local development database.');
}
const root = 'data/stat_enrichment', previewRoot = 'data/provider_previews';
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const run = (command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) => {
  const result = spawnSync(command, args, { maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) throw Error(`${command} failed; inspect the private deployment log. No automatic restoration is attempted.`);
  return result;
};
const assertPaused = async () => access('.dev-stack-lock').then(
  () => { throw Error('Pause the managed development stack before the approved backfill.'); },
  (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; },
);
const count = z.number().int().nonnegative();
const reportSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  nhl: z.object({ changes: count }).passthrough(),
  mlb: z.object({ changes: count }).passthrough(),
  nba: z.object({ newPlayers: count, newAliases: count }).passthrough(),
  nfl: z.object({ newPlayers: count, newAliases: count }).passthrough(),
  nflStatistics: z.object({ changes: count }).passthrough(),
}).passthrough();
const counts = (value: unknown) => {
  const r = reportSchema.parse(value);
  return { nhl: r.nhl.changes, mlb: r.mlb.changes, nbaPlayers: r.nba.newPlayers, nbaAliases: r.nba.newAliases,
    nflPlayers: r.nfl.newPlayers, nflAliases: r.nfl.newAliases, nflStatistics: r.nflStatistics.changes };
};
const batch = z.object({ nhl: z.object({ sourceProofs: z.array(z.object({ sha256: z.string() }).passthrough()).min(1) }).passthrough(),
  mlb: z.unknown(), nba: z.unknown(), nfl: z.unknown(), nflStatistics: z.unknown() }).passthrough().parse(await json(`${root}/m5_accelerated_batch.json`));
if (fingerprint(batch) !== approved) throw Error('Approved consolidated manifest changed.');
const preview = reportSchema.parse(await json(`${root}/m5_accelerated_batch_preview.json`));
if (preview.fingerprint !== approved) throw Error('Dry-run preview belongs to a different target.');
const expected = counts(preview);
const validation = z.object({
  fingerprint: z.literal(approved), targetDatabase: z.literal('fantasy_evolution_test'), developmentWrites: z.literal(0),
  originalRowsUnchanged: z.literal(true), lateComponentAtomicRollback: z.literal(true),
  allGameAndScheduleTimesPreserved: z.literal(true), ownershipAndCurrentEligibilityUnchanged: z.literal(true),
  replayAddedRows: z.literal(0), appendCounts: z.record(z.string(), count),
  originalTablesPreserved: z.literal(89), replayChanges: z.literal(0),
  dryRun: reportSchema, applied: reportSchema,
}).passthrough().parse(await json(`${root}/m5_accelerated_batch_copy_validation.json`));
for (const result of [validation.dryRun, validation.applied]) {
  if (result.fingerprint !== approved || fingerprint(counts(result)) !== fingerprint(expected)) throw Error('Populated-copy result differs from reviewed exact counts.');
}
// Every nested proof is checked against the immutable object, never a mutable current alias.
const proofs = new Map<string, Set<string>>();
function collect(value: unknown) {
  if (Array.isArray(value)) { value.forEach(collect); return; }
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  if (typeof object.sha256 === 'string') {
    if (!/^[a-f0-9]{64}$/.test(object.sha256)) throw Error('Malformed source digest.');
    const references = proofs.get(object.sha256) ?? new Set<string>();
    for (const field of ['sourceReference', 'sourceUrl', 'url']) if (typeof object[field] === 'string') {
      const reference = new URL(object[field]);
      if (reference.protocol !== 'https:' || reference.hostname !== 'github.com' || reference.username || reference.password) throw Error('Unreviewed source reference.');
      references.add(reference.href);
    }
    proofs.set(object.sha256, references);
  }
  Object.values(object).forEach(collect);
}
collect(batch);
// The baseline is an earlier immutable body of the same explicitly reviewed NFL product.
const nflEvidence=z.object({sourceProof:z.object({sourceUrl:z.url()}),baseline:z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/)})}).parse(batch.nflStatistics);
proofs.get(nflEvidence.baseline.sha256)?.add(nflEvidence.sourceProof.sourceUrl);
const nhlProofs = new Set(batch.nhl.sourceProofs.map(proof => proof.sha256));
function validateNhlReferences(value: unknown) {
  if (Array.isArray(value)) { value.forEach(validateNhlReferences); return; }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.sha256 === 'string' && !nhlProofs.has(record.sha256)) throw Error('NHL evidence references an undeclared source.');
  if (Array.isArray(record.validatedWith)) for (const digest of record.validatedWith) {
    if (typeof digest !== 'string' || !nhlProofs.has(digest)) throw Error('NHL completeness proof references an undeclared source.');
  }
  Object.values(record).forEach(validateNhlReferences);
}
validateNhlReferences(batch.nhl);
if (!proofs.size) throw Error('Missing immutable source evidence.');
for (const [digest, references] of proofs) {
  if (!references.size || hash(await readFile(`${previewRoot}/objects/${digest}`)) !== digest) throw Error('Reviewed source object missing, changed or unreferenced.');
}
await assertPaused();
const operatorLock = '.reviewed-data-application-lock';
const lock = await open(operatorLock, 'wx', 0o600);
const client = new pg.Client({ connectionString: url.href }), db = getDatabase();
let connected = false;
try {
  await lock.writeFile(JSON.stringify({ pid: process.pid, approvedFingerprint: approved, startedAt: new Date().toISOString() }));
  await client.connect(); connected = true;
  const acquired = (await client.query("SELECT pg_try_advisory_lock(hashtext('m5-reviewed-accelerated-deployment')) AS acquired")).rows[0].acquired;
  if (!acquired) throw Error('Another reviewed accelerated deployment is active.');
  const migrations = (await client.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].n;
  const unfinished = (await client.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows[0].n;
  if (migrations !== 28 || unfinished) throw Error('Expected the clean reviewed 28-migration baseline.');
  const dry = await reconcileAcceleratedBatch(batch);
  if (fingerprint(counts(dry)) !== fingerprint(expected)) throw Error('Development target heads/counts changed since review.');
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows as { tablename: string }[];
  if (tables.length !== validation.originalTablesPreserved + 1 || !tables.some(row => row.tablename === '_prisma_migrations')) throw Error('Reviewed 89 application tables plus migration baseline changed.');
  const deltas: Record<string, number> = {
    Player: expected.nbaPlayers + expected.nflPlayers, PlayerExternalId: expected.nbaAliases + expected.nflAliases,
    PlayerGameStat: expected.nhl + expected.nflStatistics, ScoreLedger: expected.mlb, ScoreLedgerEntry: expected.mlb,
    ImportBatch: Number(expected.nhl > 0) + Number(expected.nflStatistics > 0),
    ProfessionalDataObservation: Number(expected.nbaPlayers + expected.nbaAliases > 0) + Number(expected.nflPlayers + expected.nflAliases > 0),
    ProfessionalDataDecision: Number(expected.nbaPlayers + expected.nbaAliases > 0) + Number(expected.nflPlayers + expected.nflAliases > 0),
  };
  for (const { tablename } of tables) {
    const reviewedDelta = tablename === '_prisma_migrations' ? 0 : validation.appendCounts[tablename];
    if (reviewedDelta !== (deltas[tablename] ?? 0)) throw Error(`Populated-copy append scope differs: ${tablename}.`);
  }
  for (const table of Object.keys(deltas)) {
    if (!tables.some(row => row.tablename === table)) throw Error(`Missing appendable table: ${table}.`);
    await client.query(`CREATE TEMP TABLE ${q('accelerated_baseline_' + table)} AS SELECT id FROM public.${q(table)}`);
  }
  const snapshot = async (table: string, originalOnly = true) => (await client.query(
    `SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${q(table)} t ${originalOnly && table in deltas ? `WHERE id IN (SELECT id FROM ${q('accelerated_baseline_' + table)})` : ''}`,
  )).rows[0] as {count: string; fingerprint: string};
  const before = new Map<string, {count: string; fingerprint: string}>();
  for (const { tablename } of tables) before.set(tablename, await snapshot(tablename, false));
  await writeFile('/private/tmp/m5-accelerated-backfill-before.json', JSON.stringify(Object.fromEntries(before), null, 2), { mode: 0o600 });
  const directory = 'data/private_backups';
  run('git', ['check-ignore', `${directory}/check.dump`]);
  run('git', ['check-ignore', `${root}/m5_accelerated_development_application.json`]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const databaseCluster = (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
  const containerCluster = run('docker', ['exec', 'fantasysportssite-postgres-1', 'psql', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Atc', 'SELECT system_identifier::text FROM pg_control_system()']).stdout?.toString().trim();
  if (!databaseCluster || containerCluster !== databaseCluster) throw Error('Backup container does not match the connected development cluster.');
  const backupPath = `${directory}/fantasy_evolution_pre_accelerated_enrichment_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.dump`;
  const backupFile = await open(backupPath, 'wx', 0o600);
  try {
    run('docker', ['exec', 'fantasysportssite-postgres-1', 'pg_dump', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Fc'], { stdio: ['ignore', backupFile.fd, 'pipe'] });
  } finally { await backupFile.close(); }
  const bytes = await readFile(backupPath);
  for (const args of [['--list'], ['--file=/dev/null']]) run('docker', ['exec', '-i', 'fantasysportssite-postgres-1', 'pg_restore', ...args], { input: bytes });
  const backup = { path: backupPath, bytes: bytes.length, sha256: hash(bytes), archiveListAndFullDecodeVerified: true, clusterVerified: true };
  await writeFile('/private/tmp/m5-accelerated-backfill-backup.json', JSON.stringify(backup, null, 2), { mode: 0o600 });
  await mkdir(`${root}/approved_manifests`,{recursive:true});
  const approvedPath=`${root}/approved_manifests/${approved}.json`;
  try{await writeFile(approvedPath,JSON.stringify(batch,null,2)+'\n',{flag:'wx',mode:0o600});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(fingerprint(await json(approvedPath))!==approved)throw Error('Preserved approved manifest changed.');}
  await assertPaused();
  // Protect the baseline against drift during backup; targets are also revalidated inside the atomic reconciler.
  for (const { tablename } of tables) {
    if (fingerprint(await snapshot(tablename, false)) !== fingerprint(before.get(tablename)) || fingerprint(await snapshot(tablename)) !== fingerprint(before.get(tablename))) throw Error(`Database changed during backup: ${tablename}.`);
  }
  const applied = await reconcileAcceleratedBatch(batch, { expectedFingerprint: approved });
  if (fingerprint(counts(applied)) !== fingerprint(expected)) throw Error('Unexpected applied component counts. Preserve the private backup and investigate.');
  const verify = async () => {
    for (const { tablename } of tables) {
      if (fingerprint(await snapshot(tablename)) !== fingerprint(before.get(tablename))) throw Error(`Original rows changed: ${tablename}. Preserve the private backup and investigate.`);
      if (Number((await snapshot(tablename, false)).count) !== Number(before.get(tablename)!.count) + (deltas[tablename] ?? 0)) throw Error(`Unexpected append scope: ${tablename}.`);
    }
  };
  await verify();
  // Read-only replay proves no next mutation is proposed; never invoke the approved mutation a second time.
  const replay = await reconcileAcceleratedBatch(batch);
  const replayCounts = counts(replay);
  if (Object.values(replayCounts).some(value => value !== 0)) throw Error('Consolidated replay was not idempotent. Preserve the backup and investigate.');
  await verify();
  const resultingTables: Record<string, {count: string; fingerprint: string}> = {};
  for (const { tablename } of tables) resultingTables[tablename] = await snapshot(tablename, false);
  const report = { approvedFingerprint: approved, applied, replayChanges: 0, replay, expectedAppendCounts: deltas,
    originalTablesPreserved: tables.length, originalRowsUnchanged: true, migrationCount: migrations, sourceObjectCount: proofs.size,
    sourceObjects: [...proofs.keys()], backup, currentEligibilityChanges: 0, competitiveResultChanges: 0,
    originalTables: Object.fromEntries(before), resultingTables, completedAt: new Date().toISOString() };
  await writeFile(`${root}/m5_accelerated_development_application.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (connected) await client.end();
  await db.$disconnect();
  await lock.close();
  await rm(operatorLock);
}
