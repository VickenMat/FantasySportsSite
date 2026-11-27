import 'dotenv/config';
import pg from 'pg';
import {mkdir,writeFile} from 'node:fs/promises';
import {Prisma} from '@/generated/prisma/client';
import {assertIsolatedIngestionDatabase} from '@/ingestion/persist';
import {pendingGameCompletionHold,waiverHoldUntil} from '@/server/waiver-holds';
const tag=process.argv.find(value=>value.startsWith('--tag='))?.slice(6);if(tag&&!/^[a-z0-9-]{1,50}$/.test(tag))throw Error('Invalid diagnostic tag.');
const analyze=process.argv.includes('--analyze');if(analyze)assertIsolatedIngestionDatabase();
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
try{
 await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");
 const player=(await client.query(`SELECT id,"displayName" FROM "Player" WHERE sport='NHL' AND "isSynthetic"=false AND "isDemo"=false AND "displayName" ILIKE '%Akhtyamov%' ORDER BY "displayName" LIMIT 1`)).rows[0];if(!player)throw Error('No accepted read-only sample.');
 const statements:Prisma.Sql[]=[];const tx={$queryRaw:async(strings:TemplateStringsArray,...values:Prisma.Sql['values'])=>{statements.push(Prisma.sql(strings,...values));return[];},rosterEntry:{findFirst:async()=>null}} as unknown as Prisma.TransactionClient;
 const at=new Date();await pendingGameCompletionHold(tx,player.id,at);await waiverHoldUntil(tx,'00000000-0000-4000-8000-000000000000',player.id,at);
 type PlanEnvelope={Plan:Record<string,unknown>;'Execution Time'?:number};
 const plans:PlanEnvelope[][]=[],estimates:PlanEnvelope[][]=[],settings=(await client.query("SELECT current_schema() AS schema,current_setting('jit') AS jit,current_setting('jit_above_cost') AS jit_above_cost,current_setting('jit_inline_above_cost') AS jit_inline_above_cost,current_setting('jit_optimize_above_cost') AS jit_optimize_above_cost")).rows[0];
 const tableStatistics=(await client.query(`SELECT c.relname,c.reltuples,c.relpages,s.last_analyze,s.last_autoanalyze FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid WHERE n.nspname=current_schema() AND c.relkind='r' ORDER BY c.relname`)).rows;
 const output=`data/provider_previews/query_audits/waiver-holds-${tag??(process.argv.includes('--after')?'after':'before')}.json`;await mkdir('data/provider_previews/query_audits',{recursive:true});
 const progress={readOnly:true,analyzeExecuted:analyze,at:at.toISOString(),sample:player,settings,tableStatistics,estimates,plans,failedQuery:null as number|null};
 const save=()=>writeFile(output,JSON.stringify(progress,null,2)+'\n');
 for(const[index,statement]of statements.entries()){
  const estimated=await client.query('EXPLAIN (FORMAT JSON) '+statement.text,statement.values);estimates.push(estimated.rows[0]['QUERY PLAN']);await save();
  if(analyze){try{const executed=await client.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statement.text,statement.values);plans.push(executed.rows[0]['QUERY PLAN']);await save();}catch(error){progress.failedQuery=index;await save();throw error;}}
  else plans.push(estimated.rows[0]['QUERY PLAN']);
 }
 const nba=(await client.query(`SELECT DISTINCT native."externalId" AS nba_id,CASE participant.side WHEN 'HOME' THEN observation."sourceRecord"->>'home_team_id' ELSE observation."sourceRecord"->>'away_team_id' END AS espn_id
 FROM "GameScheduleObservation" observation JOIN "ScheduleImportBatch" batch ON batch.id=observation."importBatchId" AND batch.status='COMPLETE' AND batch."importerVersion"='schedule-v5-1'
 JOIN "Game" archive ON archive.id=observation."gameId" AND archive.provider='v9-historical' JOIN "Season" season ON season.id=archive."seasonId" AND season."startYear"=2026
 JOIN "GameTeam" participant ON participant."gameId"=archive.id AND participant.side IN('HOME','AWAY') JOIN "ProTeam" native ON native.id=participant."teamId" AND native.provider='v9-historical'
 WHERE observation.sport='NBA' AND observation."scheduleProvider"='schedule-v5' AND observation."retrievedAt"<=now()
 AND EXISTS(SELECT 1 FROM "HistoricalGameCrosswalk" crosswalk JOIN "ScheduleImportBatch" accepted ON accepted.id=crosswalk."importBatchId" AND accepted.status='COMPLETE' AND accepted."importerVersion"='schedule-v5-1'
 WHERE crosswalk.sport='NBA' AND crosswalk.status='MATCHED' AND crosswalk."canonicalGameId"=archive.id AND crosswalk."archiveGameId"=archive."externalId") ORDER BY nba_id,espn_id`)).rows;
 const report={...progress,nbaAcceptedNativeSideBridges:nba};await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sample:player,estimatedTotalCosts:plans.map(plan=>plan[0].Plan['Total Cost']),executionTimesMs:plans.map(plan=>plan[0]['Execution Time']??null),nbaAcceptedNativeSideBridges:nba.length,pairs:nba}));
 await client.query('ROLLBACK');
}finally{await client.end();}
