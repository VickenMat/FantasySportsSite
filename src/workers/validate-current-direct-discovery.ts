import 'dotenv/config';
import {validateCurrentNbaDiscoverySource} from '@/server/current-direct-discovery-sources';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {getDatabase} from '@/lib/db';
import {fingerprint} from '@/ingestion/contracts';
import {assertIsolatedIngestionDatabase} from '@/ingestion/persist';
import {reconcileReviewedRosterInTransaction} from '@/server/reviewed-roster-discovery';
import {reconcileReviewedNhlDirectDiscoveryInTransaction,validateNhlDirectDiscoverySource} from '@/server/reviewed-nhl-direct-discovery';
assertIsolatedIngestionDatabase();
const root='data/operational_enrichment/direct_identity_discovery',nba=await validateCurrentNbaDiscoverySource(JSON.parse(await readFile(`${root}/reviewed_nba_manifest.json`,'utf8'))),nhl=await validateNhlDirectDiscoverySource(JSON.parse(await readFile(`${root}/reviewed_nhl_manifest.json`,'utf8'))),nbaFingerprint=fingerprint(nba),nhlFingerprint=fingerprint(nhl),db=getDatabase(),schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,client=new pg.Client({connectionString:process.env.DATABASE_URL});
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"',insist=(value:unknown,message:string)=>{if(!value)throw Error(message);};
insist(nba.candidates.length===6&&nba.bridges.length===0&&nhl.candidates.length===4,'Exact6NBA+4NHL identity-only scope changed.');
await client.connect();try{
 await client.query(`SET search_path TO ${q(schema)}`);
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map((row:{tablename:string})=>row.tablename),appendable=new Set(['Player','PlayerExternalId','ProfessionalDataObservation','ProfessionalDataDecision']);
 for(const table of appendable)await client.query(`CREATE TEMP TABLE ${q('discovery_before_'+table)} AS SELECT id FROM ${q(table)}`);
 const snap=async(table:string,original=false)=>(await client.query(`SELECT count(*)::text n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) hash FROM ${q(table)} t ${original&&appendable.has(table)?`WHERE EXISTS(SELECT 1 FROM ${q('discovery_before_'+table)} old WHERE old.id=t.id)`:''}`)).rows[0];
 const capture=async()=>{const result=new Map<string,unknown>();for(const table of tables)result.set(table,await snap(table));return result;},before=await capture();
 const unchanged=async(expected:Map<string,unknown>,original=false)=>{for(const table of tables)insist(JSON.stringify(await snap(table,original))===JSON.stringify(expected.get(table)),`Identity proposal altered original data: ${table}`);};
 const run=(apply=false,failLast=false)=>db.$transaction(async tx=>{if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;const at=new Date(),nbaResult=await reconcileReviewedRosterInTransaction(tx,nba,apply?{expectedFingerprint:nbaFingerprint}:undefined,at),nhlResult=await reconcileReviewedNhlDirectDiscoveryInTransaction(tx,nhl,apply?{expectedFingerprint:failLast?'deliberately-stale-last-component':nhlFingerprint}:undefined,at);return{nba:nbaResult,nhl:nhlResult};},{isolationLevel:'Serializable',timeout:600000});
 const dry=await run();insist(dry.nba.newPlayers===6&&dry.nhl.newPlayers===4,'Identity proof requires exact unapplied targets.');await unchanged(before);
 let atomicRollback=false;try{await run(true,true);}catch(error){if(!(error instanceof Error)||error.message!=='NHL direct identity proposal differs from approval.')throw error;atomicRollback=true;}insist(atomicRollback,'Late identity component rollback missing.');await unchanged(before);
 const applied=await run(true);await unchanged(before,true);
 const expected:Record<string,number>={Player:10,PlayerExternalId:10,ProfessionalDataObservation:2,ProfessionalDataDecision:2},appendCounts:Record<string,number>={};
 for(const table of tables){appendCounts[table]=Number((await snap(table)).n)-Number((before.get(table) as {n:string}).n);insist(appendCounts[table]===(expected[table]??0),`Unexpected identity append scope: ${table}`);}
 const after=await capture(),replay=await run(true);insist(replay.nba.newPlayers===0&&replay.nhl.newPlayers===0&&replay.nba.alreadyApplied&&replay.nhl.alreadyApplied,'Identity replay added rows.');await unchanged(after);await unchanged(before,true);
 const report={targetFingerprint:fingerprint({version:'reviewed-current-direct-identities-1',nba:nbaFingerprint,nhl:nhlFingerprint}),nbaFingerprint,nhlFingerprint,targetDatabase:'fantasy_evolution_test',schema,developmentWrites:0,originalTablesPreserved:tables.length,originalRowsUnchanged:true,originalTables:Object.fromEntries([...before].map(([table,value])=>[table,{count:(value as {n:string}).n,fingerprint:(value as {hash:string}).hash}])),actualTargetDataOnly:true,controlledFantasyFixtureRows:0,sourceBytesVerified:true,atomicRollback,dry,applied,replay,appendCounts,eligibilityStatisticsScoresOwnershipAndTeamChanges:0};
 await writeFile(`${root}/copy_validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await client.end();await db.$disconnect();}
