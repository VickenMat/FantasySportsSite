import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { fingerprint } from '@/ingestion/contracts';
import { reconcileAcceleratedBatch } from '@/server/accelerated-data-batch';

assertIsolatedIngestionDatabase();
const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,client=new pg.Client({connectionString:process.env.DATABASE_URL}),db=getDatabase();
const q=(value:string)=>'"'+value.replaceAll('"','""')+'"';
type Snapshot={count:string;fingerprint:string};
await client.connect();await client.query(`SET search_path TO ${q(schema)}`);
try{
 const raw=JSON.parse(await readFile('data/stat_enrichment/m5_accelerated_batch.json','utf8'));
 if(!raw.nflStatistics)throw Error('Expected the final five-component accelerated batch with NFL statistics.');
 const rosterReview=JSON.parse(await readFile('data/provider_previews/capability_review/nfl_roster_review.json','utf8'));
 if(raw.nflStatistics.identityDependencyFingerprint!==rosterReview.targetFingerprint)throw Error('NFL statistics dependency must match the final reviewed roster report.');
 const manifestFingerprint=fingerprint(raw);
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map((row:{tablename:string})=>row.tablename);
 const idTables=new Set<string>((await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema=$1 AND column_name='id'",[schema])).rows.map(row=>row.table_name));
 const snapshot=async(table:string,originalOnly=false):Promise<Snapshot> =>(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${q(table)} t ${originalOnly&&idTables.has(table)?`WHERE to_jsonb(t)->>'id' IN(SELECT id FROM ${q('accelerated_baseline_'+table)})`:''}`)).rows[0];
 const capture=async()=>{const result=new Map<string,Snapshot>();for(const table of tables)result.set(table,await snapshot(table));return result;};
 const unchanged=async(expected:Map<string,Snapshot>,originalOnly=false)=>{for(const table of tables)if(JSON.stringify(await snapshot(table,originalOnly))!==JSON.stringify(expected.get(table)))throw Error(`Populated original rows changed: ${table}`);};
 const before=await capture();
 for(const table of tables)if(idTables.has(table)){await client.query(`CREATE TEMP TABLE ${q('accelerated_baseline_'+table)} AS SELECT to_jsonb(t)->>'id' AS id FROM ${q(table)} t`);await client.query(`CREATE UNIQUE INDEX ON ${q('accelerated_baseline_'+table)} (id)`);await client.query(`ANALYZE ${q('accelerated_baseline_'+table)}`);}
 const dry=await reconcileAcceleratedBatch(raw);
 await unchanged(before);
 const expectedParts={nhl:{changes:1660},mlb:{changes:16},nba:{newPlayers:58,newAliases:538},nfl:{newPlayers:1248,newAliases:3402},nflStatistics:{changes:162}};
 const checkParts=(value:unknown,replay=false)=>{const result=value as Record<string,Record<string,unknown>>;for(const[part,counts]of Object.entries(expectedParts))for(const[key,count]of Object.entries(counts))if(result[part]?.[key]!== (replay?0:count))throw Error(`Unexpected ${replay?'replay ':''}target count ${part}.${key}: ${result[part]?.[key]}`);};
 checkParts(dry);
 // Bypass only the outer review mismatch: the deliberately bad final component
 // must reject after the earlier four components have executed inside one Tx.
 const rejected=structuredClone(raw);rejected.nflStatistics.rows[0].teamId=rejected.nflStatistics.gameBridges.find((game:{canonicalGameId:string})=>game.canonicalGameId===rejected.nflStatistics.rows[0].gameId).participants.find((team:{teamId:string})=>team.teamId!==rejected.nflStatistics.rows[0].teamId).teamId;
 let lateRejection=false;
 try{await reconcileAcceleratedBatch(rejected,{expectedFingerprint:fingerprint(rejected)});}catch(error){if(!(error instanceof Error)||!/participant changed/.test(error.message))throw error;lateRejection=true;}
 if(!lateRejection)throw Error('Deliberate late-component rejection was not enforced.');
 await unchanged(before);
 const applied=await reconcileAcceleratedBatch(raw,{expectedFingerprint:manifestFingerprint});checkParts(applied);
 await unchanged(before,true);
 const expectedAppends:Record<string,number>={Player:1306,PlayerExternalId:3940,PlayerGameStat:1822,ScoreLedger:16,ScoreLedgerEntry:16,ImportBatch:2,ProfessionalDataObservation:2,ProfessionalDataDecision:2};
 const appendCounts:Record<string,number>={};
 for(const table of tables){const delta=Number((await snapshot(table)).count)-Number(before.get(table)!.count);appendCounts[table]=delta;if(delta!==(expectedAppends[table]??0))throw Error(`Unexpected appended records ${table}: ${delta}`);}
 for(const[sport,players,aliases]of[['NBA',58,538],['NFL',1248,3402]] as const){
  const actual=(await client.query(`SELECT (SELECT count(*)::int FROM "Player" t WHERE sport=$1 AND t.id::text NOT IN(SELECT id FROM "accelerated_baseline_Player")) AS players,(SELECT count(*)::int FROM "PlayerExternalId" t WHERE sport=$1 AND t.id::text NOT IN(SELECT id FROM "accelerated_baseline_PlayerExternalId")) AS aliases`,[sport])).rows[0];
  if(actual.players!==players||actual.aliases!==aliases)throw Error(`Sport-specific identity append mismatch: ${sport}`);
 }
 const nhl=(await client.query(`SELECT count(*)::int AS n FROM "PlayerGameStat" n JOIN "PlayerGameStat" p ON p.id=n."priorRevisionId" WHERE NOT EXISTS(SELECT 1 FROM "accelerated_baseline_PlayerGameStat" b WHERE b.id=n.id::text) AND n.raw ? 'historicalStatEnrichment' AND n."sourceKnownAt" IS NOT DISTINCT FROM p."sourceKnownAt" AND n."observedPositions"=p."observedPositions" AND n."gameId"=p."gameId" AND n."playerId"=p."playerId" AND n."teamId"=p."teamId" AND n.role=p.role`)).rows[0].n;
 const nfl=(await client.query(`SELECT count(*)::int AS n FROM "PlayerGameStat" s JOIN "GameTeam" gt ON gt."gameId"=s."gameId" AND gt."teamId"=s."teamId" WHERE NOT EXISTS(SELECT 1 FROM "accelerated_baseline_PlayerGameStat" b WHERE b.id=s.id::text) AND s.raw ? 'reviewedNflStatistics' AND s."sourceKnownAt" IS NULL AND s.revision=1 AND s."priorRevisionId" IS NULL AND s.role='FOOTBALL'`)).rows[0].n;
 const mlb=(await client.query(`SELECT count(*)::int AS n FROM "ScoreLedgerEntry" e JOIN "ScoreLedger" l ON l.id=e."ledgerId" JOIN "Game" g ON g.id=l."gameId" JOIN "ScoringPreset" p ON p.id=l."presetId" WHERE e.id::text NOT IN(SELECT id FROM "accelerated_baseline_ScoreLedgerEntry") AND g.sport='MLB' AND p.version='ubp-v9-experimental' AND cardinality(e."missingStats")=0`)).rows[0].n;
 if(nhl!==1660||nfl!==162||mlb!==16)throw Error('Historical publication/position preservation or complete-global-ledger validation failed.');
 const after=await capture(),repeatedDry=await reconcileAcceleratedBatch(raw),replayed=await reconcileAcceleratedBatch(raw,{expectedFingerprint:manifestFingerprint});
 checkParts(repeatedDry,true);checkParts(replayed,true);await unchanged(after);await unchanged(before,true);
 const report={schema,targetDatabase:'fantasy_evolution_test',developmentWrites:0,fingerprint:manifestFingerprint,manifestFingerprint,dryRun:dry,dry,applied,originalTablesPreserved:tables.length,replayChanges:0,repeatedDry,replayed,lateComponentAtomicRollback:lateRejection,originalPopulatedTablesPreserved:tables.length,originalRowsUnchanged:true,allGameAndScheduleTimesPreserved:true,ownershipAndCurrentEligibilityUnchanged:true,appendCounts,nhlPublicationAndHistoricalPositionsPreserved:nhl,nflNullPublicationExistingParticipants:nfl,completeNewGlobalMlbEntries:mlb,replayAddedRows:0};
 await writeFile('data/stat_enrichment/m5_accelerated_batch_copy_validation.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({manifestFingerprint,preservedTables:tables.length,appendCounts:Object.fromEntries(Object.entries(appendCounts).filter(([,count])=>count)),lateComponentAtomicRollback:true,replayAddedRows:0}));
}finally{await client.end();await db.$disconnect();}
