import 'dotenv/config';
import {writeFile,mkdir} from 'node:fs/promises';
import {getDatabase} from '@/lib/db';
import {fingerprint} from '@/ingestion/contracts';
import {collectReadOnlyCompetitiveStages} from '@/ingestion/open-data/collect-competitive';
import {buildReviewedCompetitiveStages} from '@/ingestion/open-data/apply-competitive-stages';
import type {CompetitiveGameStage} from '@/ingestion/open-data/competitive-records';
const extendedNba=process.argv.includes('--extended-nba');
const db=getDatabase(),root=extendedNba?'data/stat_enrichment/competitive_processing_extended_nba':'data/stat_enrichment/competitive_processing';
try{
 await mkdir(root,{recursive:true});
 const {stages,holds,proofs,sourceFiles,sourceBundleFingerprint,validatedAt,nhlAcceptedCanonicalUnknownShutoutRows}=await collectReadOnlyCompetitiveStages(db,{extendedNba,currentRegisteredSources:extendedNba,futureNhl:extendedNba,receiptDirectory:root});
 const selected=['NFL','NBA','NHL'].map(sport=>stages.find(stage=>stage.game.sport===sport&&stage.completeBoxBindingReady&&stage.game.scheduledStartsAt));
 if(selected.some(stage=>!stage))throw Error('No complete source stage exists for one of the three supported sports.');
 const threeGameManifest=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return buildReviewedCompetitiveStages(tx,selected as CompetitiveGameStage[],sourceFiles);},{isolationLevel:'RepeatableRead',timeout:120000});
 await writeFile(`${root}/reviewed_three_game_manifest.json`,JSON.stringify(threeGameManifest,null,2)+'\n');
 const report={sourceBundleFingerprint,validatedAt,threeGameFingerprint:fingerprint(threeGameManifest),threeGameTargets:threeGameManifest.stages.map(stage=>({sport:stage.game.sport,gameId:stage.game.id,sourceGameId:stage.game.externalId,sourceStatRows:stage.records.length-1})),targetFingerprint:fingerprint(stages),developmentWrites:0,canonicalDataMutations:0,productionPromotionEnabled:false,liveFeedActivated:false,nhlAcceptedCanonicalUnknownShutoutRows:nhlAcceptedCanonicalUnknownShutoutRows,sports:['NFL','NBA','NHL'].map(sport=>({sport,games:stages.filter(stage=>stage.game.sport===sport).length,statCandidates:stages.filter(stage=>stage.game.sport===sport).reduce((sum,stage)=>sum+stage.records.filter(record=>record.normalized.kind==='STAT').length,0),completeBoxBindingCandidates:stages.filter(stage=>stage.game.sport===sport&&stage.completeBoxBindingReady).length,heldStatRows:stages.filter(stage=>stage.game.sport===sport).reduce((sum,stage)=>sum+stage.holds.length,0),heldGames:holds.filter(hold=>hold.sport===sport).length})),mlbHold:'Retained MLB PBP has no explicit final-state field; no final state inferred from last play, source age or complete PA counts.',productionChronologyHold:'Historical real source records do not establish prospective pre-lock eligibility/availability or ownership; controlled synthetic competition evidence must be separately labeled.',holds};
 await writeFile(`${root}/queue.json`,JSON.stringify({report,proofs,stages},null,2)+'\n');await writeFile(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,holds:undefined}));
}finally{await db.$disconnect();}
