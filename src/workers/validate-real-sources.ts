import{readFile,writeFile}from'node:fs/promises';
import{spawnSync}from'node:child_process';
import pg from'pg';
import{getDatabase}from'@/lib/db';
import{assertIsolatedIngestionDatabase}from'@/ingestion/persist';
import{reconcileHistoricalStatistics}from'@/server/historical-stat-enrichment';
assertIsolatedIngestionDatabase();
const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,client=new pg.Client({connectionString:process.env.DATABASE_URL}),db=getDatabase(),q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
await client.connect();await client.query(`SET search_path TO ${q(schema)}`);
try{
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows as {tablename:string}[];
 const idTables=new Set((await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema=$1 AND column_name='id'",[schema])).rows.map(r=>r.table_name));
 const snapshot=async(table:string)=>(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${q(table)} t ${idTables.has(table)?`WHERE to_jsonb(t)->>'id' IN (SELECT id FROM ${q('real_baseline_'+table)})`:""}`)).rows[0];
 const before=new Map();
 for(const {tablename}of tables){await client.query(`CREATE TEMP TABLE ${q('real_baseline_'+tablename)} AS SELECT to_jsonb(t)->>'id' AS id FROM ${q(tablename)} t`);before.set(tablename,await snapshot(tablename));}
 const manifest=JSON.parse(await readFile('data/stat_enrichment/nhl_real_manifest.json','utf8'));
 const dry=await reconcileHistoricalStatistics(manifest),applied=await reconcileHistoricalStatistics(manifest,{expectedFingerprint:dry.fingerprint}),repeat=await reconcileHistoricalStatistics(manifest);
 if(repeat.changes!==0)throw Error('NHL enrichment replay is not idempotent.');
 const runNfl=()=>{const result=spawnSync(process.execPath,['--import','tsx','src/workers/ingest-open-nfl.ts'],{env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});process.stdout.write(result.stdout);if(result.status!==0)throw Error(result.stderr||'NFL real-source pipeline failed.');return JSON.parse(result.stdout);};
 const firstNfl=runNfl();
 const evidenceBefore=await db.professionalDataObservation.count(),statsBefore=await db.playerGameStat.count(),entriesBefore=await db.scoreLedgerEntry.count();
 const repeatedNfl=runNfl();
 const replay={newObservations:await db.professionalDataObservation.count()-evidenceBefore,newStatistics:await db.playerGameStat.count()-statsBefore,newLedgerEntries:await db.scoreLedgerEntry.count()-entriesBefore};
 if(Object.values(replay).some(v=>v!==0))throw Error('Real source replay created duplicate evidence/statistics/scores.');
 const runOtherSports=()=>{const result=spawnSync(process.execPath,['--import','tsx','src/workers/ingest-open-enrichment.ts'],{env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});if(result.status!==0)throw Error(result.stderr||'Multi-sport real-source validation failed.');return JSON.parse(result.stdout);};
 const otherSports=runOtherSports();
 const otherBefore={observations:await db.professionalDataObservation.count(),statistics:await db.playerGameStat.count(),entries:await db.scoreLedgerEntry.count()};
 const otherSportsRepeat=runOtherSports();
 const otherReplay={observations:await db.professionalDataObservation.count()-otherBefore.observations,statistics:await db.playerGameStat.count()-otherBefore.statistics,entries:await db.scoreLedgerEntry.count()-otherBefore.entries};
 if(Object.values(otherReplay).some(value=>value!==0))throw Error('Multi-sport real-source replay created duplicates.');
 for(const {tablename}of tables)if(JSON.stringify(await snapshot(tablename))!==JSON.stringify(before.get(tablename)))throw Error(`Original populated rows changed: ${tablename}`);
 const nhlRevisions=(await client.query(`SELECT count(*)::int AS n FROM "PlayerGameStat" n JOIN "PlayerGameStat" p ON p.id=n."priorRevisionId" WHERE n.raw ? 'historicalStatEnrichment' AND n.id::text NOT IN (SELECT id FROM "real_baseline_PlayerGameStat") AND n."sourceKnownAt" IS NOT DISTINCT FROM p."sourceKnownAt" AND n."observedPositions"=p."observedPositions" AND n."gameId"=p."gameId" AND n."playerId"=p."playerId" AND n.role=p.role`)).rows[0].n;
 if(nhlRevisions!==applied.changes)throw Error('NHL identity/publication/position preservation failed.');
 const report={schema,targetDatabase:'fantasy_evolution_test',developmentWrites:0,nhl:{dry,applied,repeatChanges:repeat.changes,sourcePublicationPreserved:true,positionsPreserved:true},nfl:firstNfl,nflRepeated:repeatedNfl,nflReplay:replay,otherSports,otherSportsRepeat,otherReplay,originalPopulatedTablesPreserved:tables.length,originalRowsUnchanged:true};
 await writeFile('data/stat_enrichment/real_disposable_validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({nhlChanges:applied.changes,nflReplay:replay,preservedTables:tables.length}));
}finally{await client.end();await db.$disconnect();}
