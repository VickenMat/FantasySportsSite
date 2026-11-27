import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {getDatabase} from '@/lib/db';
import {assertIsolatedIngestionDatabase} from '@/ingestion/persist';
import {fingerprint} from '@/ingestion/contracts';
import {validateFinalCompletionBootstrapSources,reconcileFinalCompletionBootstrapInTransaction} from '@/server/final-completion-bootstrap';
assertIsolatedIngestionDatabase();
const root='data/operational_enrichment/final_completion_bootstrap',manifest=await validateFinalCompletionBootstrapSources(JSON.parse(await readFile(`${root}/reviewed_manifest.json`,'utf8'))),targetFingerprint=fingerprint(manifest),db=getDatabase(),schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,client=new pg.Client({connectionString:process.env.DATABASE_URL});
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"',insist=(value:unknown,message:string)=>{if(!value)throw Error(message);};
await client.connect();try{
 await client.query(`SET search_path TO ${q(schema)}`);
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map((row:{tablename:string})=>row.tablename),appendable=new Set(['ProfessionalDataObservation','ProfessionalDataDecision','GameCompletionEvidence']);
 for(const table of appendable)await client.query(`CREATE TEMP TABLE ${q('final_before_'+table)} AS SELECT id FROM ${q(table)}`);
 const snap=async(table:string,original=false)=>(await client.query(`SELECT count(*)::text n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) hash FROM ${q(table)} t ${original&&appendable.has(table)?`WHERE EXISTS(SELECT 1 FROM ${q('final_before_'+table)} old WHERE old.id=t.id)`:''}`)).rows[0];
 const capture=async()=>{const result=new Map<string,unknown>();for(const table of tables)result.set(table,await snap(table));return result;},before=await capture();
 const unchanged=async(expected:Map<string,unknown>,original=false)=>{for(const table of tables)insist(JSON.stringify(await snap(table,original))===JSON.stringify(expected.get(table)),`Completion bootstrap altered original data: ${table}`);};
 const run=(apply=false,rollback=false)=>db.$transaction(async tx=>{if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;const result=await reconcileFinalCompletionBootstrapInTransaction(tx,manifest,apply?{expectedFingerprint:targetFingerprint}:undefined,new Date());if(rollback)throw Error('deliberate-final-bootstrap-rollback');return result;},{isolationLevel:'Serializable',timeout:600000});
 const dry=await run();insist(dry.changes===manifest.targets.length,'Copy must contain all exact unapplied FINAL-only targets.');await unchanged(before);
 let atomicRollback=false;try{await run(true,true);}catch(error){if(!(error instanceof Error)||error.message!=='deliberate-final-bootstrap-rollback')throw error;atomicRollback=true;}insist(atomicRollback,'Rollback proof missing.');await unchanged(before);
 const applied=await run(true);await unchanged(before,true);
 const appendCounts:Record<string,number>={};for(const table of tables){appendCounts[table]=Number((await snap(table)).n)-Number((before.get(table) as {n:string}).n);insist(appendCounts[table]===(appendable.has(table)?manifest.targets.length:0),`Unexpected FINAL-only append count: ${table}`);}
 const after=await capture(),replay=await run(true);insist(replay.changes===0&&replay.alreadyApplied===manifest.targets.length,'FINAL-only replay was not empty.');await unchanged(after);await unchanged(before,true);
 const report={targetFingerprint,targetDatabase:'fantasy_evolution_test',schema,originalTablesPreserved:tables.length,originalRowsUnchanged:true,atomicRollback,developmentWrites:0,dry,applied,replay,appendCounts,actualCompletionAndPublicationTimestampsRemainUnknown:true,firstFinalHeadsPreserved:manifest.preservedCompletionHeads.length};
 await writeFile(`${root}/copy_validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await client.end();await db.$disconnect();}
