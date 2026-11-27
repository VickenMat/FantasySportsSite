import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {getDatabase} from '@/lib/db';
import {assertIsolatedIngestionDatabase} from '@/ingestion/persist';
import {fingerprint} from '@/ingestion/contracts';
import {applyCompetitiveStages,type ReviewedCompetitiveStages} from '@/ingestion/open-data/apply-competitive-stages';
import {applyReviewedMlbHistoricalBox,type MlbHistoryBoxManifest} from '@/ingestion/open-data/mlb-historical-box';
import {validateFinalCompletionBootstrapSources,reconcileFinalCompletionBootstrapInTransaction} from '@/server/final-completion-bootstrap';

// Actual supplemental targets only. Controlled fantasy ownership, eligibility and
// clock fixtures belong to the separate real-competitive acceptance workers.
assertIsolatedIngestionDatabase();
const db=getDatabase(),schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,client=new pg.Client({connectionString:process.env.DATABASE_URL});
const nhl=JSON.parse(await readFile('data/stat_enrichment/nhl_future_source/reviewed_future_game_manifest.json','utf8')) as ReviewedCompetitiveStages;
const mlb=JSON.parse(await readFile('data/stat_enrichment/mlb_source_supplement/reviewed_mlb_history_box_manifest.json','utf8')) as MlbHistoryBoxManifest;
const bootstrap=await validateFinalCompletionBootstrapSources(JSON.parse(await readFile('data/operational_enrichment/final_completion_bootstrap/reviewed_manifest.json','utf8')));
const nhlFingerprint=fingerprint(nhl),mlbFingerprint=fingerprint(mlb),bootstrapFingerprint=fingerprint(bootstrap);
const manifestFiles=await Promise.all(['data/stat_enrichment/nhl_future_source/reviewed_future_game_manifest.json','data/stat_enrichment/mlb_source_supplement/reviewed_mlb_history_box_manifest.json','data/operational_enrichment/final_completion_bootstrap/reviewed_manifest.json'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
const review={version:'reviewed-supplemental-source-promotion-1',componentFingerprints:{nhl:nhlFingerprint,mlb:mlbFingerprint,bootstrap:bootstrapFingerprint},targetCounts:{nhlNewStatistics:40,mlbExistingStatistics:26,finalOnlyBootstrap:bootstrap.targets.length},manifestFiles},targetFingerprint=fingerprint(review);
const insist=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
insist(nhlFingerprint==='9fdd552390aaacbc84d3bc5b425401f35b55599eb29e4bd621aa2c3a1f5acf41'&&mlbFingerprint==='0bb7222f88118b9b9b890cfb82d6c5fba6325877102b4fa742eb193f05d54502','Frozen supplemental target fingerprint changed.');
insist(nhl.stages.length===1&&nhl.stages[0].game.externalId==='2026020374'&&nhl.stages[0].records.filter(row=>row.normalized.kind==='STAT').length===40&&mlb.targets.length===26&&mlb.canonicalGame.externalId==='823244','Supplemental game scope changed.');
insist(!bootstrap.targets.some(target=>target.game.id===mlb.gameId||nhl.stages.some(stage=>stage.game.id===target.game.id)),'Completion bootstrap must exclude both supplemental games.');
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
type Snapshot={count:string;fingerprint:string};
await client.connect();
try{
 await client.query(`SET search_path TO ${q(schema)}`);
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map((row:{tablename:string})=>row.tablename);
 insist(tables.length===89,'Expected89 populated application tables.');
 const appendable=new Set(['ProfessionalDataObservation','ProfessionalDataDecision','GameCompletionEvidence','ImportBatch','PlayerGameStat','ScoreLedger','ScoreLedgerEntry']);
 for(const table of appendable){await client.query(`CREATE TEMP TABLE ${q('supplement_before_'+table)} AS SELECT id FROM ${q(table)}`);await client.query(`CREATE UNIQUE INDEX ON ${q('supplement_before_'+table)}(id)`);await client.query(`ANALYZE ${q('supplement_before_'+table)}`);}
 const snapshot=async(table:string,originalOnly=false):Promise<Snapshot>=>(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${q(table)} t ${originalOnly&&appendable.has(table)?`WHERE EXISTS(SELECT 1 FROM ${q('supplement_before_'+table)} baseline WHERE baseline.id=t.id)`:''}`)).rows[0];
 const capture=async()=>{const result=new Map<string,Snapshot>();for(const table of tables)result.set(table,await snapshot(table));return result;};
 const unchanged=async(expected:Map<string,Snapshot>,originalOnly=false)=>{for(const table of tables)insist(JSON.stringify(await snapshot(table,originalOnly))===JSON.stringify(expected.get(table)),`Original data changed: ${table}.`);};
 const before=await capture();
 const run=(apply=false,lateReject=false)=>db.$transaction(async tx=>{
  if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const at=new Date(),nhlReport=await applyCompetitiveStages(tx,nhl,apply?{expectedFingerprint:nhlFingerprint}:undefined,at);
  const mlbReport=await applyReviewedMlbHistoricalBox(tx,mlb,apply?{expectedFingerprint:mlbFingerprint}:undefined,at);
  // A stale last bootstrap head rejects only after both scoring components and
  // the preceding FINAL-only targets have written, proving whole-batch rollback.
  const final=lateReject?structuredClone(bootstrap):bootstrap;
  if(lateReject){const target=final.targets.at(-1)!;target.expectedStateHeads=[{id:target.game.id,contentHash:'intentionally-stale-isolated-head',decisionId:null,outcome:null,targetsFingerprint:fingerprint(null)}];}
  const bootstrapReport=await reconcileFinalCompletionBootstrapInTransaction(tx,final,apply?{expectedFingerprint:fingerprint(final)}:undefined,at);
  return{nhl:nhlReport,mlb:mlbReport,bootstrap:bootstrapReport};
 },{isolationLevel:'Serializable',timeout:600000});
 const dryRun=await run();insist(!dryRun.nhl.alreadyApplied&&!dryRun.mlb.alreadyApplied,'Actual supplemental proof requires an unapplied populated copy.');
 insist(dryRun.nhl.newStatistics===40&&dryRun.mlb.newStatistics===0&&dryRun.bootstrap.changes===bootstrap.targets.length,'Unexpected proposed statistical scope.');await unchanged(before);
 let lateComponentAtomicRollback=false;try{await run(true,true);}catch(error){if(!(error instanceof Error)||error.message!=='Completion/source head changed since review.')throw error;lateComponentAtomicRollback=true;}
 insist(lateComponentAtomicRollback,'The late bootstrap component was not rejected.');await unchanged(before);
 const applied=await run(true);
 insist(applied.nhl.newStatistics===40&&applied.nhl.newScoreEntries===40&&applied.nhl.completeBoxes===1&&applied.mlb.newStatistics===0&&applied.mlb.scoreEntries===26&&applied.mlb.completeBoxes===1,'Actual supplemental materialization differs from the reviewed40new/26existing scope.');
 await unchanged(before,true);
 const expected:Record<string,number>={ProfessionalDataObservation:48+bootstrap.targets.length,ProfessionalDataDecision:48+bootstrap.targets.length,GameCompletionEvidence:2+bootstrap.targets.length,ImportBatch:40,PlayerGameStat:40,ScoreLedger:66,ScoreLedgerEntry:66},appendCounts:Record<string,number>={};
 for(const table of tables){appendCounts[table]=Number((await snapshot(table)).count)-Number(before.get(table)!.count);insist(appendCounts[table]===(expected[table]??0),`Unexpected append scope ${table}: ${appendCounts[table]} vs ${expected[table]??0}.`);}
 const newUnknownStatClocks=(await client.query('SELECT count(*)::int AS n FROM "PlayerGameStat" t WHERE NOT EXISTS(SELECT 1 FROM "supplement_before_PlayerGameStat" b WHERE b.id=t.id) AND t."sourceKnownAt" IS NULL')).rows[0].n;
 insist(newUnknownStatClocks===40,'Supplemental statistics manufactured a source-publication clock.');
 const categories=(await client.query('SELECT t.category,count(*)::int AS n FROM "ProfessionalDataObservation" t WHERE NOT EXISTS(SELECT 1 FROM "supplement_before_ProfessionalDataObservation" b WHERE b.id=t.id) GROUP BY t.category ORDER BY t.category')).rows as {category:string;n:number}[];
 for(const category of ['GAME_STATE','COMPLETE_FINAL_BOX','BOX_CLOCK']){const expected=category==='GAME_STATE'?2+bootstrap.targets.length:2;insist(categories.find(row=>row.category===category)?.n===expected,`Expected${expected} ${category} observations.`);}
 const unknownEventClocks=(await client.query('SELECT count(*)::int AS n FROM "ProfessionalDataObservation" t WHERE NOT EXISTS(SELECT 1 FROM "supplement_before_ProfessionalDataObservation" b WHERE b.id=t.id) AND t.category=\'GAME_STATE\' AND t."publishedAt" IS NULL AND t."effectiveAt" IS NULL AND t.normalized->>\'actualStartsAt\' IS NULL AND t.normalized->>\'completedAt\' IS NULL')).rows[0].n;
 insist(unknownEventClocks===2+bootstrap.targets.length,'Observed game state fabricated an exact physical event time.');
 const after=await capture(),repeatedDry=await run(),replayed=await run(true);
 insist(repeatedDry.nhl.alreadyApplied&&repeatedDry.mlb.alreadyApplied&&replayed.nhl.alreadyApplied&&replayed.mlb.alreadyApplied&&replayed.bootstrap.changes===0&&replayed.bootstrap.alreadyApplied===bootstrap.targets.length,'Supplemental replay receipt missing.');
 insist(replayed.nhl.newStatistics===0&&replayed.nhl.newScoreEntries===0&&replayed.mlb.scoreEntries===0,'Supplemental replay appended scores or statistics.');await unchanged(after);await unchanged(before,true);
 const report={fingerprint:targetFingerprint,review,componentFingerprints:review.componentFingerprints,targetCounts:review.targetCounts,manifestFiles,targetDatabase:'fantasy_evolution_test',schema,developmentWrites:0,actualTargetDataOnly:true,controlledFantasyFixtureRows:0,originalTablesPreserved:tables.length,originalRowsUnchanged:true,originalTables:Object.fromEntries(before),resultingTables:Object.fromEntries(after),lateComponentAtomicRollback,dryRun,applied,appendCounts,replayChanges:0,repeatedDry,replayed,observationCategories:categories,sourceKnownAtRemainsNull:newUnknownStatClocks,actualEventTimestampsRemainUnknown:unknownEventClocks,canonicalGameTimesAndPhaseUnchanged:true,currentEligibilityOwnershipFinancialAndFinalizedCompetitionUnchanged:true,finalOnlyBootstrapTargets:bootstrap.targets.length,preservedFirstFinalHeads:bootstrap.preservedCompletionHeads.length,scope:'FINAL-only completion bootstrap plus NHL40 fresh licensed source rows; MLB26 existing accepted historical rows scored with independent licensed final/role evidence; no production chronology or live episode claimed'};
 await writeFile('data/stat_enrichment/m5_supplemental_source_copy_validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await client.end();await db.$disconnect();}
