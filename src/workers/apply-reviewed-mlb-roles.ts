import 'dotenv/config';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { recalculateInTransaction } from '@/server/score-ledger';
import { lockSport } from '@/server/sport-lock';
import type { GameStatRole } from '@/generated/prisma/enums';

const approved = 'c0efa541b199b0cd7d65c4b58377f848f4d3b052cef602f1cd3eccbc9c175460';
if (process.env.APPROVED_MLB_ROLE_BACKFILL !== approved) throw Error('Exact MLB backfill approval is required.');
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
  const manifest = JSON.parse(await readFile('data/stat_enrichment/mlb_validated_role_manifest.json', 'utf8'));
  if (fingerprint(manifest.rows) !== approved) throw Error('Approved MLB role target changed.');
  const rows = manifest.rows.filter((row: {role:string|null;status:string}) => row.role && row.status.startsWith('VALIDATED_')) as {role:GameStatRole;gameId:string;playerId:string;source:{sha256:string};statTargets:{id:string;contentHash:string;role:GameStatRole}[]}[];
  if (rows.length !== 197 || new Set(rows.map(row => row.playerId)).size !== 128) throw Error('Approved MLB scope changed.');
  for (const proof of new Map(rows.map(row => [row.source.sha256, row.source])).values()) if (hash(await readFile(`data/provider_previews/objects/${proof.sha256}`)) !== proof.sha256) throw Error('Approved MLB source changed.');
  const assertTargets = async () => {
    if (await db.scoreLedger.count({where:{OR:rows.map(row=>({gameId:row.gameId,playerId:row.playerId}))}})) throw Error('An existing target ledger requires separate review.');
    for (const row of rows) for (const target of row.statTargets) {
      const current=await db.playerGameStat.findFirstOrThrow({where:{gameId:row.gameId,playerId:row.playerId,provider:'v9-historical',role:target.role,game:{sport:'MLB'}},orderBy:{revision:'desc'}});
      if(current.id!==target.id||current.contentHash!==target.contentHash)throw Error('Approved MLB stat target changed.');
    }
  };
  await assertTargets();
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows as { tablename: string }[];
  for (const table of ['ScoreLedger', 'ScoreLedgerEntry']) await client.query(`CREATE TEMP TABLE ${q('mlb_role_baseline_' + table)} AS SELECT id FROM ${q(table)}`);
  const snapshot = async (table: string) => (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${q(table)} t ${['ScoreLedger','ScoreLedgerEntry'].includes(table) ? `WHERE id IN (SELECT id FROM ${q('mlb_role_baseline_' + table)})` : ''}`)).rows[0];
  const before = new Map(); for (const { tablename } of tables) before.set(tablename, await snapshot(tablename));
  await writeFile('/private/tmp/m5-mlb_role-backfill-before.json', JSON.stringify(Object.fromEntries(before), null, 2), { mode: 0o600 });
  const directory = 'data/private_backups'; run('git', ['check-ignore', `${directory}/check.dump`]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backupPath = `${directory}/fantasy_evolution_pre_mlb_role_enrichment_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.dump`;
  const backupFile = await open(backupPath, 'wx', 0o600);
  try { run('docker', ['exec', 'fantasysportssite-postgres-1', 'pg_dump', '-U', process.env.POSTGRES_USER ?? 'fantasy', '-d', 'fantasy_evolution', '-Fc'], { stdio: ['ignore', backupFile.fd, 'pipe'] }); } finally { await backupFile.close(); }
  const bytes = await readFile(backupPath);
  for (const args of [['--list'], ['--file=/dev/null']]) run('docker', ['exec', '-i', 'fantasysportssite-postgres-1', 'pg_restore', ...args], { input: bytes });
  const backup = { path: backupPath, bytes: bytes.length, sha256: hash(bytes), archiveListAndFullDecodeVerified: true };
  await writeFile('/private/tmp/m5-mlb_role-backfill-backup.json', JSON.stringify(backup, null, 2), { mode: 0o600 });
  await assertTargets();
  const applied = await db.$transaction(async tx => {
    await lockSport(tx,'MLB');
    let changes=0;
    for(const row of rows){
      if(await tx.scoreLedger.findFirst({where:{gameId:row.gameId,playerId:row.playerId}}))throw Error('Target ledger appeared during deployment.');
      for(const target of row.statTargets){
        const current=await tx.playerGameStat.findFirstOrThrow({where:{gameId:row.gameId,playerId:row.playerId,provider:'v9-historical',role:target.role},orderBy:{revision:'desc'}});
        if(current.id!==target.id||current.contentHash!==target.contentHash)throw Error('MLB target changed before the atomic batch.');
      }
      const result=await recalculateInTransaction(tx,'MLB',{gameId:row.gameId,playerId:row.playerId,role:row.role,sourceProvider:'v9-historical',reason:`Confirmed starting-pitcher/batting policy; source ${row.source.sha256}; exact reviewed manifest ${approved}`});
      if(!result.changed||result.entry.missingStats.length)throw Error('Expected one complete new V9 score for each approved MLB target.');
      changes++;
    }
    return {changes,players:new Set(rows.map(row=>row.playerId)).size};
  },{isolationLevel:'Serializable',timeout:120000});
  for (const { tablename } of tables) if (JSON.stringify(await snapshot(tablename)) !== JSON.stringify(before.get(tablename))) throw Error(`Original rows changed: ${tablename}. Preserve the backup and inspect.`);
  if(await db.scoreLedger.count()!==Number(before.get('ScoreLedger').count)+197||await db.scoreLedgerEntry.count()!==Number(before.get('ScoreLedgerEntry').count)+197)throw Error('Unexpected MLB ledger append scope.');
  const replay=await db.$transaction(async tx=>{
    await lockSport(tx,'MLB');let changed=0;
    for(const row of rows)if((await recalculateInTransaction(tx,'MLB',{gameId:row.gameId,playerId:row.playerId,role:row.role,sourceProvider:'v9-historical',reason:'Approved MLB role replay verification'})).changed)changed++;
    if(changed)throw Error('MLB materialization replay was not idempotent.');return changed;
  },{timeout:120000});
  const report={approvedFingerprint:approved,applied,replayChanges:replay,originalTablesPreserved:tables.length,originalRowsUnchanged:true,sourceStatChanges:0,currentEligibilityChanges:0,competitiveResultChanges:0,backup,migrationCount:migrations,resultingGlobalScoreEntries:await db.scoreLedgerEntry.count()};
  await writeFile('data/stat_enrichment/mlb_role_development_application.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await client.end(); await db.$disconnect(); }
