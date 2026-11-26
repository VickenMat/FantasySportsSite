import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { loadMlbPositionContinuation, mlbPositionContinuationFingerprint as approved } from '@/ingestion/mlb-position-continuation';
import { reconcileHistoricalPositions } from '@/server/historical-position-reconciliation';

assertIsolatedIngestionDatabase();
const { manifest, preview, sourceProofs, directory } = await loadMlbPositionContinuation();
const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema')!;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL }), db = getDatabase();
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
type Snapshot = {count: string; fingerprint: string};
await client.connect();
try {
  await client.query(`SET search_path TO ${q(schema)}`);
  const tables = (await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename', [schema])).rows.map((row: {tablename: string}) => row.tablename);
  if (tables.length !== 89) throw Error('Expected 89 populated application tables.');
  const appendable = new Set(['PlayerGameStat', 'ImportBatch']);
  for (const table of appendable) {
    await client.query(`CREATE TEMP TABLE ${q('mlb_position_before_' + table)} AS SELECT id FROM ${q(table)}`);
    await client.query(`CREATE UNIQUE INDEX ON ${q('mlb_position_before_' + table)} (id)`);
    await client.query(`ANALYZE ${q('mlb_position_before_' + table)}`);
  }
  const snapshot = async (table: string, originalOnly = false): Promise<Snapshot> => (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${q(table)} t ${originalOnly && appendable.has(table) ? `WHERE id IN(SELECT id FROM ${q('mlb_position_before_' + table)})` : ''}`)).rows[0];
  const capture = async () => { const rows = new Map<string, Snapshot>(); for (const table of tables) rows.set(table, await snapshot(table)); return rows; };
  const coverage = async () => (await client.query(`WITH latest AS (
    SELECT DISTINCT ON(s."gameId",s."playerId",s.role) s."gameId",s."playerId",s.role,s."observedPositions"
    FROM "PlayerGameStat" s JOIN "Game" g ON g.id=s."gameId" JOIN "Season" season ON season.id=g."seasonId"
    WHERE s.provider='v9-historical' AND season.sport='MLB' AND season."startYear"=2026
    ORDER BY s."gameId",s."playerId",s.role,s.revision DESC,s."recordedAt" DESC
  ) SELECT count(DISTINCT "playerId")::int AS "totalPlayers",count(DISTINCT ("playerId","gameId"))::int AS "totalAppearances",count(*)::int AS "totalRoleRows",
    (count(DISTINCT "playerId") FILTER(WHERE cardinality("observedPositions")>0))::int AS "coveredPlayers",
    (count(DISTINCT ("playerId","gameId")) FILTER(WHERE cardinality("observedPositions")>0))::int AS "coveredAppearances",
    (count(*) FILTER(WHERE cardinality("observedPositions")>0))::int AS "coveredRoleRows" FROM latest`)).rows[0] as Record<string,number>;
  const coverageBefore = await coverage();
  const before = await capture();
  const unchanged = async (expected: Map<string, Snapshot>, originalOnly = false) => {
    for (const table of tables) if (JSON.stringify(await snapshot(table, originalOnly)) !== JSON.stringify(expected.get(table))) throw Error(`Existing data changed: ${table}.`);
  };
  const dryRun = await reconcileHistoricalPositions(manifest);
  if (dryRun.fingerprint !== approved || dryRun.changes !== 251 || dryRun.players !== 9) throw Error('Exact canonical head binding differs from reviewed preview.');
  await unchanged(before);
  for (const target of preview.targets) {
    const row = await db.playerGameStat.findUniqueOrThrow({ where: { id: target.priorStatId } });
    if (row.contentHash !== target.priorHash || row.observedPositions.length) throw Error('Reviewed original target changed.');
  }
  const applied = await reconcileHistoricalPositions(manifest, { expectedFingerprint: approved });
  if (applied.changes !== 251 || applied.players !== 9) throw Error('Expected exactly 251 new historical position revisions.');
  await unchanged(before, true);
  const appendCounts: Record<string, number> = {};
  for (const table of tables) {
    appendCounts[table] = Number((await snapshot(table)).count) - Number(before.get(table)!.count);
    if (appendCounts[table] !== (table === 'PlayerGameStat' ? 251 : table === 'ImportBatch' ? 1 : 0)) throw Error(`Unexpected append scope: ${table}.`);
  }
  const preserved = (await client.query(`SELECT count(*)::int AS n FROM "PlayerGameStat" n JOIN "PlayerGameStat" p ON p.id=n."priorRevisionId" WHERE NOT EXISTS(SELECT 1 FROM "mlb_position_before_PlayerGameStat" baseline WHERE baseline.id=n.id) AND n.normalized=p.normalized AND n."sourceKnownAt" IS NOT DISTINCT FROM p."sourceKnownAt" AND n."gameId"=p."gameId" AND n."playerId"=p."playerId" AND n."teamId"=p."teamId" AND n.role=p.role AND n.provider=p.provider AND n."sourceLine" IS NOT DISTINCT FROM p."sourceLine" AND n.revision=p.revision+1 AND cardinality(p."observedPositions")=0 AND n.raw->'original'=p.raw AND n.raw->'historicalPositionRepair'->>'sourceProvider'='recovered-mlb-game-role-evidence' AND to_jsonb(n."observedPositions")=n.raw->'historicalPositionRepair'->'positions'`)).rows[0].n;
  if (preserved !== 251) throw Error('Historical revisions changed statistical/publication identity or lost provenance.');
  const coverageAfter = await coverage();
  if (coverageAfter.coveredPlayers !== coverageBefore.coveredPlayers + 9 || coverageAfter.coveredRoleRows !== coverageBefore.coveredRoleRows + 251 || ['totalPlayers','totalAppearances','totalRoleRows'].some(key=>coverageAfter[key]!==coverageBefore[key])) throw Error('Unexpected historical position coverage change.');
  const after = await capture(), replay = await reconcileHistoricalPositions(manifest), approvedReplay = await reconcileHistoricalPositions(manifest, { expectedFingerprint: approved });
  if (replay.changes || approvedReplay.changes) throw Error('Position continuation replay added rows.');
  await unchanged(after); await unchanged(before, true);
  const report = { fingerprint: approved, sourceHash: preview.sourceHash, targetDatabase: 'fantasy_evolution_test', developmentWrites: 0,
    dryRun, applied, originalTablesPreserved: tables.length, originalRowsUnchanged: true, appendCounts, replayChanges: 0,
    originalPublicationAndNormalizedPreserved: preserved, currentEligibilityChanges: 0, scoreLedgerChanges: 0, sourceProofs,
    historicalPositionCoverage: {seasonStartYear: 2026, before: coverageBefore, after: coverageAfter, distinctAppearanceDelta: coverageAfter.coveredAppearances-coverageBefore.coveredAppearances, semantics: 'Historical observed positions; player/game appearances deduplicate roles; no eligible-position promotion.'},
    priorTargets: preview.targets, replay, approvedReplay };
  await writeFile(`${directory}/mlb_nine_role_historical_copy_validation.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ fingerprint: approved, changes: applied.changes, players: applied.players, preservedTables: tables.length, replayChanges: 0, sourceProofs, historicalPositionCoverage: report.historicalPositionCoverage }, null, 2));
} finally { await client.end(); await db.$disconnect(); }
