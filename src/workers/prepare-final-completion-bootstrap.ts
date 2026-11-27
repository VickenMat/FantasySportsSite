import 'dotenv/config';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {parse} from 'csv-parse/sync';
import {getDatabase} from '@/lib/db';
import {fingerprint,observationSchema} from '@/ingestion/contracts';
import {bodyHash} from '@/ingestion/open-data/storage';
import {sourceProduct,type SourceRow} from '@/ingestion/open-data/read';
import {canonicalBootstrapGame,completionBootstrapStateHeads,proveFinalBootstrapBinding,validateFinalCompletionBootstrapSources,type FinalCompletionBootstrap,type BootstrapSource} from '@/server/final-completion-bootstrap';
const db=getDatabase(),root='data/operational_enrichment/final_completion_bootstrap';
const supplemental=new Map([['681d9e71-56ef-447a-8b40-a2500ab7a081','reviewed supplemental NHL40 component'],['d5166dfa-092a-4aa9-aca9-36c3cd332e48','reviewed supplemental MLB26 component']]);
try{
 const products=await Promise.all(['nfl-results-2026','nhl-game-info-2027','nhl-goalies-2027','nba-schedule-results-2027','mlb-schedules-2026'].map(sourceProduct));
 const crossPath='data/provider_previews/sportsdataverse/schedule-crosswalks/nba_schedule_crosswalk_2027.csv',crossBytes=await readFile(crossPath),crossMeta=JSON.parse(await readFile(crossPath+'.source.json','utf8'));
 if(bodyHash(crossBytes)!==crossMeta.sha256)throw Error('Retained crosswalk changed.');
 const rows=new Map<string,SourceRow[]>(products.map(product=>[product.source.id,product.rows]));rows.set('nba-crosswalk-2027',parse(crossBytes,{columns:true,skip_empty_lines:true,bom:true}));
 const sourceFiles:BootstrapSource[]=[...products.map(product=>({id:product.source.id,path:product.path,sha256:product.proof.sha256,sourceUrl:product.proof.sourceUrl,receivedAt:product.proof.receivedAt,artifactModifiedAt:product.proof.artifactModifiedAt})),{id:'nba-crosswalk-2027',path:crossPath,sha256:crossMeta.sha256,sourceUrl:crossMeta.sourceUrl,receivedAt:crossMeta.receivedAt,artifactModifiedAt:crossMeta.lastModified??null}];
 await mkdir(root,{recursive:true});
 let preparedAt=new Date().toISOString();const clockPath=`${root}/first-validation-${fingerprint({sourceFiles,bindingPolicy:'explicit-native-and-official-crosswalk-2'})}.json`;
 try{await writeFile(clockPath,JSON.stringify({preparedAt,semantics:'FIRST_LOCAL_FINAL_ONLY_VALIDATION; not actual completion/publication time'})+'\n',{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;preparedAt=JSON.parse(await readFile(clockPath,'utf8')).preparedAt;}
 const holds:{sport:string;gameId:string;externalId:string;reason:string}[]=[],exclusions:{gameId:string;reason:string;completionIds?:string[]}[]=[];
 const manifest=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const games=await tx.game.findMany({where:{phase:{in:['REGULAR','UNKNOWN']},season:{startYear:2026},scheduleObservations:{some:{phase:'REGULAR',scheduleProvider:'schedule-v5',importBatch:{status:'COMPLETE',importerVersion:'schedule-v5-1'}}}},include:{season:true,teams:{include:{team:true}},scheduleObservations:{include:{importBatch:true}},completionEvidence:true},orderBy:{id:'asc'}});
  const existing=await tx.gameCompletionEvidence.findMany({orderBy:{id:'asc'}});
  const targets:FinalCompletionBootstrap['targets']=[];
  for(const raw of games){
   if(raw.completionEvidence.length||supplemental.has(raw.id)){exclusions.push({gameId:raw.id,reason:raw.completionEvidence.length?'Preserve immutable existing first-final boundary':supplemental.get(raw.id)!,completionIds:raw.completionEvidence.map(row=>row.id)});continue;}
   try{
    const game=canonicalBootstrapGame(raw),proofs=raw.scheduleObservations.filter(value=>value.phase==='REGULAR'&&value.scheduleProvider==='schedule-v5'&&value.importBatch.status==='COMPLETE'&&value.importBatch.importerVersion==='schedule-v5-1');
    if(!proofs.length)throw Error('No accepted V5 import proof.');
    if(new Set(proofs.map(proof=>fingerprint(proof.sourceRecord))).size!==1)throw Error('Conflicting accepted V5 records require separate review.');
    const chosen=proofs[0],v5={id:chosen.id,contentHash:chosen.contentHash,sourceRecord:chosen.sourceRecord as Record<string,never>};
    const sourceId={NFL:'nfl-results-2026',NHL:'nhl-game-info-2027',NBA:'nba-schedule-results-2027',MLB:'mlb-schedules-2026'}[game.sport];
    let sourceGameId=game.externalId;
    if(game.sport==='NBA'){const matches=rows.get('nba-crosswalk-2027')!.filter(row=>row.espn_game_id===String(v5.sourceRecord.game_id));if(matches.length!==1)throw Error('No unique explicit NBA crosswalk.');sourceGameId=matches[0].nba_game_id;}
    const binding=proveFinalBootstrapBinding(game,v5,sourceId,sourceGameId,rows,preparedAt),proof=sourceFiles.find(value=>value.id===sourceId)!;
    const revisionToken=fingerprint({version:'final-only-bootstrap-1',gameId:game.id,sourceFiles:sourceFiles.map(value=>({id:value.id,sha256:value.sha256})),binding});
    const observation=observationSchema.parse({provider:game.sport==='NFL'?'nflverse-open-data':'sportsdataverse-open-data',sport:game.sport,entityKey:`game-state:${game.id}`,revisionToken,revisionOrdinal:Date.parse(preparedAt),sourceReference:proof.sourceUrl,observedAt:preparedAt,effectiveAt:null,publishedAt:null,raw:{finalBinding:binding,sourceProofs:sourceFiles,validationSemantics:'FIRST_LOCAL_FINAL_ONLY_VALIDATION; NOT ACTUAL COMPLETION OR OFFICIAL PUBLICATION',acceptedV5ObservationId:v5.id},normalized:{kind:'GAME_STATE',evidencePolicy:'CONSERVATIVE_OBSERVED_V1',game:{provider:game.provider,externalId:game.externalId},status:'FINAL',scheduledStartsAt:game.startsAt,actualStartsAt:null,completedAt:null}});
    targets.push({game,v5,sourceId,sourceGameId,expectedStateHeads:await completionBootstrapStateHeads(tx,game.id),observation});
   }catch(error){holds.push({sport:raw.sport,gameId:raw.id,externalId:raw.externalId,reason:error instanceof Error?error.message:'Unknown final-only hold'});}
  }
  return{version:'reviewed-final-only-completion-bootstrap-1' as const,preparedAt,sourceFiles,targets,preservedCompletionHeads:existing.map(row=>({id:row.id,gameId:row.gameId,fingerprint:fingerprint(JSON.parse(JSON.stringify(row)))}))};
 },{isolationLevel:'RepeatableRead',timeout:600000});
 await validateFinalCompletionBootstrapSources(manifest);
 const report={targetFingerprint:fingerprint(manifest),preparedAt,targets:manifest.targets.length,bySport:Object.fromEntries(['NFL','NHL','NBA','MLB'].map(sport=>[sport,manifest.targets.filter(value=>value.game.sport===sport).length])),preservedCompletionHeads:manifest.preservedCompletionHeads.length,exclusions,holds,developmentWrites:0,scope:'FINAL-only operational first-observation completion evidence; no statistics, score, calendar, eligibility or actual event timestamps',approvalRequired:true};
 await writeFile(`${root}/reviewed_manifest.json`,JSON.stringify(manifest,null,2)+'\n');await writeFile(`${root}/preview.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,holds:holds.length},null,2));
}finally{await db.$disconnect();}
