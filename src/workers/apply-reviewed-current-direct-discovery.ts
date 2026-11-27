/** Exact reviewed operator. Execution requires the matching explicit approval
 * environment gate and a fresh successful populated-copy report. Never invoked by workers. */
import 'dotenv/config';
import {validateCurrentNbaDiscoverySource} from '@/server/current-direct-discovery-sources';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {access,mkdir,open,readFile,rm,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {getDatabase} from '@/lib/db';
import {fingerprint} from '@/ingestion/contracts';
import {reconcileReviewedRosterInTransaction} from '@/server/reviewed-roster-discovery';
import {reconcileReviewedNhlDirectDiscoveryInTransaction,validateNhlDirectDiscoverySource} from '@/server/reviewed-nhl-direct-discovery';

const approved='281641b0d5912b469d8b2153f19399774e28ee6049ae3ad355324a50aa717197';
if(!/^[a-f0-9]{64}$/.test(approved)||process.env.APPROVED_CURRENT_DIRECT_IDENTITIES!==approved)throw Error('Exact reviewed direct_identity approval is required; no database connection opened.');
const url=new URL(process.env.DATABASE_URL!);
if(url.pathname!=='/fantasy_evolution'||!['localhost','127.0.0.1'].includes(url.hostname)||url.searchParams.has('schema'))throw Error('Expected preserved local development database.');
const paused=()=>access('.dev-stack-lock').then(()=>{throw Error('Pause the managed development stack before reviewed application.');},(error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw error;});
await paused();
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const root='data/operational_enrichment/direct_identity_discovery';
const paths=[`${root}/reviewed_nba_manifest.json`,`${root}/reviewed_nhl_manifest.json`];
const load=async()=>{
 const bodies=await Promise.all(paths.map(path=>readFile(path))),nba=await validateCurrentNbaDiscoverySource(JSON.parse(bodies[0].toString())),nhl=await validateNhlDirectDiscoverySource(JSON.parse(bodies[1].toString()));
 const review={version:'reviewed-current-direct-identities-1',nba:fingerprint(nba),nhl:fingerprint(nhl)};
 if(fingerprint(review)!==approved||nba.candidates.length!==6||nba.bridges.length!==0||nhl.candidates.length!==4)throw Error('Frozen exact10 identity target changed.');
 return{nba,nhl,review};
};
const manifest=await load(),validation=JSON.parse(await readFile(`${root}/copy_validation.json`,'utf8'));
if(validation.targetFingerprint!==approved||validation.targetDatabase!=='fantasy_evolution_test'||validation.developmentWrites!==0||validation.originalTablesPreserved!==89||validation.originalRowsUnchanged!==true||validation.atomicRollback!==true||validation.actualTargetDataOnly!==true||validation.controlledFantasyFixtureRows!==0||validation.sourceBytesVerified!==true||validation.replay?.nba?.newPlayers!==0||validation.replay?.nhl?.newPlayers!==0)throw Error('Exact populated-copy proof is required.');
const db=getDatabase(),client=new pg.Client({connectionString:url.href});
const reconcile=(apply=false)=>db.$transaction(async tx=>{
 if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;
 const at=new Date(),nba=await reconcileReviewedRosterInTransaction(tx,manifest.nba,apply?{expectedFingerprint:manifest.review.nba}:undefined,at),nhl=await reconcileReviewedNhlDirectDiscoveryInTransaction(tx,manifest.nhl,apply?{expectedFingerprint:manifest.review.nhl}:undefined,at);
 return{nba,nhl};
},{isolationLevel:'Serializable',timeout:600000});
const run=(command:string,args:string[],options:Parameters<typeof spawnSync>[2]={})=>{const result=spawnSync(command,args,{maxBuffer:8*1024*1024,...options});if(result.status!==0)throw Error(`${command} failed; preserve private logs and backup. No automatic restore.`);return result;};
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
type Snapshot={count:string;fingerprint:string};
const operatorLock='.reviewed-data-application-lock',lock=await open(operatorLock,'wx',0o600);
let connected=false;
try{
 await lock.writeFile(JSON.stringify({pid:process.pid,fingerprint:approved,startedAt:new Date().toISOString()}));
 await client.connect();connected=true;
 if(!(await client.query("SELECT pg_try_advisory_lock(hashtext('m5-reviewed-accelerated-deployment')) acquired")).rows[0].acquired)throw Error('Another reviewed deployment is active.');
 const migrations=(await client.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].n,unfinished=(await client.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows[0].n;
 if(migrations!==28||unfinished)throw Error('Expected clean28-migration baseline.');
 const dry=await reconcile();
 if(dry.nba.alreadyApplied||dry.nhl.alreadyApplied||dry.nba.newPlayers!==6||dry.nhl.newPlayers!==4||dry.nba.newAliases!==6||dry.nhl.newAliases!==4)throw Error('Reviewed identity heads changed or target already applied.');
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row:{tablename:string})=>row.tablename);
 if(tables.length!==90||!tables.includes('_prisma_migrations'))throw Error('Expected89 application tables plus preserved migration table.');
 const appendable=new Set(['Player','PlayerExternalId','ProfessionalDataObservation','ProfessionalDataDecision']);
 const exact:Record<string,number>={Player:10,PlayerExternalId:10,ProfessionalDataObservation:2,ProfessionalDataDecision:2};
 for(const table of tables)if(table!=='_prisma_migrations'&&validation.appendCounts[table]!== (exact[table]??0))throw Error(`Copy append scope differs: ${table}.`);
 for(const table of appendable){await client.query(`CREATE TEMP TABLE ${q('direct_identity_before_'+table)} AS SELECT id FROM public.${q(table)}`);await client.query(`CREATE UNIQUE INDEX ON ${q('direct_identity_before_'+table)}(id)`);await client.query(`ANALYZE ${q('direct_identity_before_'+table)}`);}
 const snapshot=async(table:string,original=false):Promise<Snapshot>=>(await client.query(`SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) fingerprint FROM public.${q(table)} t ${original&&appendable.has(table)?`WHERE EXISTS(SELECT 1 FROM ${q('direct_identity_before_'+table)} old WHERE old.id=t.id)`:''}`)).rows[0];
 const before=new Map<string,Snapshot>();for(const table of tables)before.set(table,await snapshot(table));
 for(const table of tables)if(table!=='_prisma_migrations'&&JSON.stringify(validation.originalTables?.[table])!==JSON.stringify(before.get(table)))throw Error(`Populated-copy baseline is stale: ${table}; rerun fresh copy verification.`);
 await writeFile('/private/tmp/m5-direct_identity-before.json',JSON.stringify(Object.fromEntries(before),null,2),{mode:0o600});
 const backupDirectory='data/private_backups';run('git',['check-ignore',`${backupDirectory}/check.dump`]);run('git',['check-ignore','data/operational_enrichment/direct_identity_discovery/development_application.json']);await mkdir(backupDirectory,{recursive:true,mode:0o700});
 const cluster=(await client.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id,backupCluster=run('docker',['exec','fantasysportssite-postgres-1','psql','-U',process.env.POSTGRES_USER??'fantasy','-d','fantasy_evolution','-Atc','SELECT system_identifier::text FROM pg_control_system()']).stdout?.toString().trim();
 if(!cluster||cluster!==backupCluster)throw Error('Backup container differs from connected cluster.');
 const backupPath=`${backupDirectory}/fantasy_evolution_pre_direct_identity_${new Date().toISOString().replaceAll(/[:.]/g,'-')}.dump`,backupFile=await open(backupPath,'wx',0o600);
 try{run('docker',['exec','fantasysportssite-postgres-1','pg_dump','-U',process.env.POSTGRES_USER??'fantasy','-d','fantasy_evolution','-Fc'],{stdio:['ignore',backupFile.fd,'pipe']});}finally{await backupFile.close();}
 const bytes=await readFile(backupPath);for(const args of [['--list'],['--file=/dev/null']])run('docker',['exec','-i','fantasysportssite-postgres-1','pg_restore',...args],{input:bytes});
 const backup={path:backupPath,bytes:bytes.length,sha256:hash(bytes),archiveListAndFullDecodeVerified:true,clusterVerified:true};await writeFile('/private/tmp/m5-direct_identity-backup.json',JSON.stringify(backup,null,2),{mode:0o600});
 await paused();for(const table of tables)if(JSON.stringify(await snapshot(table))!==JSON.stringify(before.get(table)))throw Error(`Data changed during backup: ${table}.`);await load();
 // The same freshly verified copy must still describe the pre-application data.
 if(fingerprint(JSON.parse(await readFile('data/operational_enrichment/direct_identity_discovery/copy_validation.json','utf8')))!==fingerprint(validation))throw Error('Copy validation report changed during deployment preparation.');
 const applied=await reconcile(true);
 if(applied.nba.newPlayers!==6||applied.nhl.newPlayers!==4||applied.nba.newAliases!==6||applied.nhl.newAliases!==4)throw Error('Unexpected identity application scope; preserve backup.');
 const verify=async()=>{for(const table of tables){if(JSON.stringify(await snapshot(table,true))!==JSON.stringify(before.get(table)))throw Error(`Original data changed: ${table}; preserve backup.`);if(Number((await snapshot(table)).count)!==Number(before.get(table)!.count)+(exact[table]??0))throw Error(`Unexpected append scope: ${table}.`);}};
 await verify();const replay=await reconcile();if(!replay.nhl.alreadyApplied||!replay.nba.alreadyApplied||replay.nhl.newPlayers||replay.nba.newPlayers)throw Error('Read-only replay differs; preserve backup.');await verify();
 const resultingTables:Record<string,Snapshot>={};for(const table of tables)resultingTables[table]=await snapshot(table);
 const report={approvedFingerprint:approved,review:manifest.review,applied,replay,replayChanges:0,originalTablesPreserved:90,originalRowsUnchanged:true,canonicalGamesEligibilityOwnershipFinancialAndFinalizedHistoryUnchanged:true,sourceFilesPreserved:true,backup,migrationCount:migrations,originalTables:Object.fromEntries(before),resultingTables};await writeFile('data/operational_enrichment/direct_identity_discovery/development_application.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));
}finally{if(connected)await client.end();await db.$disconnect();await lock.close();await rm(operatorLock);}
