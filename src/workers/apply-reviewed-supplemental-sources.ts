/** Exact reviewed operator. Execution requires the matching explicit approval
 * environment gate and a fresh successful populated-copy report. Never invoked by workers. */
import 'dotenv/config';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {access,mkdir,open,readFile,rm,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {getDatabase} from '@/lib/db';
import {fingerprint} from '@/ingestion/contracts';
import {applyCompetitiveStages,type ReviewedCompetitiveStages} from '@/ingestion/open-data/apply-competitive-stages';
import {applyReviewedMlbHistoricalBox,type MlbHistoryBoxManifest} from '@/ingestion/open-data/mlb-historical-box';
import {validateFinalCompletionBootstrapSources,reconcileFinalCompletionBootstrapInTransaction} from '@/server/final-completion-bootstrap';

const approved='0413f205bf71b0369108b58d998745caf04641c360546842febdcdea6cb660d1';
if(!/^[a-f0-9]{64}$/.test(approved)||process.env.APPROVED_SUPPLEMENTAL_SOURCES!==approved)throw Error('Exact reviewed supplemental approval is required; no database connection opened.');
const url=new URL(process.env.DATABASE_URL!);
if(url.pathname!=='/fantasy_evolution'||!['localhost','127.0.0.1'].includes(url.hostname)||url.searchParams.has('schema'))throw Error('Expected preserved local development database.');
const paused=()=>access('.dev-stack-lock').then(()=>{throw Error('Pause the managed development stack before reviewed application.');},(error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw error;});
await paused();
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const paths=['data/stat_enrichment/nhl_future_source/reviewed_future_game_manifest.json','data/stat_enrichment/mlb_source_supplement/reviewed_mlb_history_box_manifest.json','data/operational_enrichment/final_completion_bootstrap/reviewed_manifest.json'];
const load=async()=>{
 const bodies=await Promise.all(paths.map(path=>readFile(path))),nhl=JSON.parse(bodies[0].toString()) as ReviewedCompetitiveStages,mlb=JSON.parse(bodies[1].toString()) as MlbHistoryBoxManifest,bootstrap=await validateFinalCompletionBootstrapSources(JSON.parse(bodies[2].toString()));
 const review={version:'reviewed-supplemental-source-promotion-1',componentFingerprints:{nhl:fingerprint(nhl),mlb:fingerprint(mlb),bootstrap:fingerprint(bootstrap)},targetCounts:{nhlNewStatistics:40,mlbExistingStatistics:26,finalOnlyBootstrap:bootstrap.targets.length},manifestFiles:paths.map((path,index)=>({path,sha256:hash(bodies[index])}))};
 if(fingerprint(review)!==approved)throw Error('Frozen composite manifests/target counts changed; separate review required.');
 return{nhl,mlb,bootstrap,review};
};
const manifest=await load(),validation=JSON.parse(await readFile('data/stat_enrichment/m5_supplemental_source_copy_validation.json','utf8'));
if(validation.fingerprint!==approved||fingerprint(validation.review)!==approved||validation.targetDatabase!=='fantasy_evolution_test'||validation.developmentWrites!==0||validation.originalTablesPreserved!==89||validation.originalRowsUnchanged!==true||validation.lateComponentAtomicRollback!==true||validation.replayChanges!==0||validation.actualTargetDataOnly!==true||validation.controlledFantasyFixtureRows!==0)throw Error('Exact fresh populated-copy proof is required.');
const db=getDatabase(),client=new pg.Client({connectionString:url.href});
const reconcile=(apply=false)=>db.$transaction(async tx=>{
 if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;
 const at=new Date(),nhl=await applyCompetitiveStages(tx,manifest.nhl,apply?{expectedFingerprint:manifest.review.componentFingerprints.nhl}:undefined,at),mlb=await applyReviewedMlbHistoricalBox(tx,manifest.mlb,apply?{expectedFingerprint:manifest.review.componentFingerprints.mlb}:undefined,at),bootstrap=await reconcileFinalCompletionBootstrapInTransaction(tx,manifest.bootstrap,apply?{expectedFingerprint:manifest.review.componentFingerprints.bootstrap}:undefined,at);
 return{nhl,mlb,bootstrap};
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
 if(dry.nhl.alreadyApplied||dry.mlb.alreadyApplied||dry.nhl.newStatistics!==40||dry.mlb.newStatistics!==0||dry.bootstrap.changes!==manifest.bootstrap.targets.length||dry.bootstrap.alreadyApplied)throw Error('Reviewed canonical heads changed or target already applied.');
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row:{tablename:string})=>row.tablename);
 if(tables.length!==90||!tables.includes('_prisma_migrations'))throw Error('Expected89 application tables plus preserved migration table.');
 const appendable=new Set(['ProfessionalDataObservation','ProfessionalDataDecision','GameCompletionEvidence','ImportBatch','PlayerGameStat','ScoreLedger','ScoreLedgerEntry']);
 const exact:Record<string,number>={ProfessionalDataObservation:48+manifest.bootstrap.targets.length,ProfessionalDataDecision:48+manifest.bootstrap.targets.length,GameCompletionEvidence:2+manifest.bootstrap.targets.length,ImportBatch:40,PlayerGameStat:40,ScoreLedger:66,ScoreLedgerEntry:66};
 for(const table of tables)if(table!=='_prisma_migrations'&&validation.appendCounts[table]!== (exact[table]??0))throw Error(`Copy append scope differs: ${table}.`);
 for(const table of appendable){await client.query(`CREATE TEMP TABLE ${q('supplement_before_'+table)} AS SELECT id FROM public.${q(table)}`);await client.query(`CREATE UNIQUE INDEX ON ${q('supplement_before_'+table)}(id)`);await client.query(`ANALYZE ${q('supplement_before_'+table)}`);}
 const snapshot=async(table:string,original=false):Promise<Snapshot>=>(await client.query(`SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) fingerprint FROM public.${q(table)} t ${original&&appendable.has(table)?`WHERE EXISTS(SELECT 1 FROM ${q('supplement_before_'+table)} old WHERE old.id=t.id)`:''}`)).rows[0];
 const before=new Map<string,Snapshot>();for(const table of tables)before.set(table,await snapshot(table));
 for(const table of tables)if(table!=='_prisma_migrations'&&JSON.stringify(validation.originalTables?.[table])!==JSON.stringify(before.get(table)))throw Error(`Populated-copy baseline is stale: ${table}; rerun fresh copy verification.`);
 await writeFile('/private/tmp/m5-supplemental-before.json',JSON.stringify(Object.fromEntries(before),null,2),{mode:0o600});
 const backupDirectory='data/private_backups';run('git',['check-ignore',`${backupDirectory}/check.dump`]);run('git',['check-ignore','data/stat_enrichment/m5_supplemental_development_application.json']);await mkdir(backupDirectory,{recursive:true,mode:0o700});
 const cluster=(await client.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id,backupCluster=run('docker',['exec','fantasysportssite-postgres-1','psql','-U',process.env.POSTGRES_USER??'fantasy','-d','fantasy_evolution','-Atc','SELECT system_identifier::text FROM pg_control_system()']).stdout?.toString().trim();
 if(!cluster||cluster!==backupCluster)throw Error('Backup container differs from connected cluster.');
 const backupPath=`${backupDirectory}/fantasy_evolution_pre_supplemental_${new Date().toISOString().replaceAll(/[:.]/g,'-')}.dump`,backupFile=await open(backupPath,'wx',0o600);
 try{run('docker',['exec','fantasysportssite-postgres-1','pg_dump','-U',process.env.POSTGRES_USER??'fantasy','-d','fantasy_evolution','-Fc'],{stdio:['ignore',backupFile.fd,'pipe']});}finally{await backupFile.close();}
 const bytes=await readFile(backupPath);for(const args of [['--list'],['--file=/dev/null']])run('docker',['exec','-i','fantasysportssite-postgres-1','pg_restore',...args],{input:bytes});
 const backup={path:backupPath,bytes:bytes.length,sha256:hash(bytes),archiveListAndFullDecodeVerified:true,clusterVerified:true};await writeFile('/private/tmp/m5-supplemental-backup.json',JSON.stringify(backup,null,2),{mode:0o600});
 await paused();for(const table of tables)if(JSON.stringify(await snapshot(table))!==JSON.stringify(before.get(table)))throw Error(`Data changed during backup: ${table}.`);await load();
 // The same freshly verified copy must still describe the pre-application data.
 if(fingerprint(JSON.parse(await readFile('data/stat_enrichment/m5_supplemental_source_copy_validation.json','utf8')))!==fingerprint(validation))throw Error('Copy validation report changed during deployment preparation.');
 const applied=await reconcile(true);
 if(applied.nhl.newStatistics!==40||applied.nhl.newScoreEntries!==40||applied.nhl.completeBoxes!==1||applied.mlb.newStatistics!==0||applied.mlb.scoreEntries!==26||applied.mlb.completeBoxes!==1||applied.bootstrap.changes!==manifest.bootstrap.targets.length)throw Error('Unexpected application scope; preserve backup and investigate.');
 const verify=async()=>{for(const table of tables){if(JSON.stringify(await snapshot(table,true))!==JSON.stringify(before.get(table)))throw Error(`Original data changed: ${table}; preserve backup.`);if(Number((await snapshot(table)).count)!==Number(before.get(table)!.count)+(exact[table]??0))throw Error(`Unexpected append scope: ${table}.`);}};
 await verify();const replay=await reconcile();if(!replay.nhl.alreadyApplied||!replay.mlb.alreadyApplied||replay.bootstrap.changes||replay.bootstrap.alreadyApplied!==manifest.bootstrap.targets.length)throw Error('Read-only replay differs; preserve backup.');await verify();
 const resultingTables:Record<string,Snapshot>={};for(const table of tables)resultingTables[table]=await snapshot(table);
 const report={approvedFingerprint:approved,review:manifest.review,applied,replay,replayChanges:0,originalTablesPreserved:90,originalRowsUnchanged:true,canonicalGamesEligibilityOwnershipFinancialAndFinalizedHistoryUnchanged:true,sourceFilesPreserved:true,backup,migrationCount:migrations,originalTables:Object.fromEntries(before),resultingTables};await writeFile('data/stat_enrichment/m5_supplemental_development_application.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));
}finally{if(connected)await client.end();await db.$disconnect();await lock.close();await rm(operatorLock);}
