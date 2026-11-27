import 'dotenv/config';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { sourceProduct,nhlEvents } from '@/ingestion/open-data/read';
import { reconcileNhlEvents } from '@/ingestion/open-data/nhl-evidence';
import { proveNhlGoalieDecisions } from '@/ingestion/open-data/nhl-goalie-decisions';
import { buildFutureNhlCompetitiveRecords } from '@/ingestion/open-data/nhl-source-statistics';
import { buildReviewedCompetitiveStages } from '@/ingestion/open-data/apply-competitive-stages';
import type { CanonicalCompetitiveGame } from '@/ingestion/open-data/competitive-records';
const db=getDatabase(),directory='data/stat_enrichment/nhl_future_source';
try{
 const [skaters,goalies,info,scoring,events]=await Promise.all([sourceProduct('nhl-skaters-2027'),sourceProduct('nhl-goalies-2027'),sourceProduct('nhl-game-info-2027'),sourceProduct('nhl-scoring-2027'),nhlEvents()]);
 const exact=reconcileNhlEvents(skaters.rows,events.rows,scoring.rows,info.rows,goalies.rows);
 const data=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;const games=await tx.game.findMany({where:{provider:'schedule-v5',sport:'NHL',season:{startYear:2026},externalId:{in:info.rows.map(row=>row.game_id)},gameStats:{none:{provider:'v9-historical'}}},include:{season:true,teams:{include:{team:true}}},orderBy:{externalId:'asc'}});const aliases=await tx.playerExternalId.findMany({where:{sport:'NHL',provider:'v9-historical',player:{isDemo:false,isSynthetic:false}},select:{externalId:true,playerId:true}});return{games,aliases};},{isolationLevel:'RepeatableRead',timeout:120000});
 const sourceProofs=[skaters.proof,goalies.proof,info.proof,scoring.proof,events.proof],key=fingerprint({version:'direct-nhl-source-v9-1',sourceShas:sourceProofs.map(proof=>proof.sha256),canonicalGames:data.games.map(game=>game.id),canonicalAliases:[...data.aliases].sort((a,b)=>a.externalId.localeCompare(b.externalId))});
 await mkdir(directory,{recursive:true});let validatedAt=new Date().toISOString();const receipt=`${directory}/first-validation-${key}.json`;try{await writeFile(receipt,JSON.stringify({validatedAt,key,scope:'ACTUAL_LOCAL_SOURCE_VALIDATION; no exact physical event/publication time'},null,2)+'\n',{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;validatedAt=JSON.parse(await readFile(receipt,'utf8')).validatedAt;}
 const players=new Map(data.aliases.map(row=>[row.externalId,row.playerId])),stages=[],holds=[];
 for(const game of data.games){const state=info.rows.find(row=>row.game_id===game.externalId)!,boxGoalies=goalies.rows.filter(box=>box.game_id===game.externalId),ends=events.rows.filter(event=>event.game_id===game.externalId&&event.event_type==='GAME_END');
  if(exact.rejected.some(row=>row.gameId===game.externalId)||ends.length!==1){holds.push({gameId:game.id,sourceGameId:game.externalId,reason:'UNRESOLVED_COMPLETE_EVENT_SOURCE'});continue;}
  const decision=proveNhlGoalieDecisions(boxGoalies,state,ends[0]);
  const canonical:CanonicalCompetitiveGame={id:game.id,provider:game.provider,externalId:game.externalId,sport:'NHL',seasonYear:game.season.startYear,phase:game.phase,week:game.week,gameDate:game.gameDate?.toISOString().slice(0,10)??null,scheduledStartsAt:game.startsAt?.toISOString()??null,teams:game.teams.map(link=>({id:link.teamId,provider:link.team.provider,externalId:link.team.externalId,code:link.team.code??'',side:link.side})).sort((a,b)=>a.side.localeCompare(b.side))};
  try{stages.push(buildFutureNhlCompetitiveRecords({game:canonical,info:state,skaters:skaters.rows.filter(box=>box.game_id===game.externalId),goalies:boxGoalies,players,eventFields:exact.accepted,goalieDecisions:decision.accepted?decision.decisions:undefined,proofs:sourceProofs,validatedAt}));}catch(error){holds.push({gameId:game.id,sourceGameId:game.externalId,reason:error instanceof Error?error.message:'SOURCE_BUILD_FAILED'});}
 }
 const complete=stages.find(stage=>stage.completeBoxBindingReady);if(!complete)throw Error('No complete fresh NHL game is available; all actual holds retained.');
 const sourceFiles=[skaters,goalies,info,scoring,events].map(source=>({path:source.path,sha256:source.proof.sha256}));
 const manifest=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return buildReviewedCompetitiveStages(tx,[complete],sourceFiles);},{isolationLevel:'RepeatableRead',timeout:120000});
 const statHolds=stages.flatMap(stage=>stage.holds),unknownIds=[...new Set(statHolds.filter(hold=>hold.reason==='MISSING_CANONICAL_PLAYER').map(hold=>hold.sourcePlayerId))].sort();
 const report={developmentWrites:0,earlierFrozenManifestChanges:0,sourceValidationGames:exact.games,rejectedSourceGames:exact.rejected.length,futureCanonicalGames:data.games.length,stagedGames:stages.length,actualNewStatCandidates:stages.reduce((sum,stage)=>sum+stage.records.filter(record=>record.normalized.kind==='STAT').length,0),completeBoxBindingCandidates:stages.filter(stage=>stage.completeBoxBindingReady).length,heldRows:statHolds.length,unknownCanonicalPlayerIds:unknownIds,heldByReason:Object.fromEntries([...new Set(statHolds.map(hold=>hold.reason))].map(reason=>[reason,statHolds.filter(hold=>hold.reason===reason).length])),gameHolds:holds,selectedGameId:complete.game.id,sourceGameId:complete.game.externalId,selectedStatRows:complete.records.length-1,targetFingerprint:fingerprint(manifest),queueFingerprint:fingerprint(stages),actualHistoricalStatDependency:false,sourceSchema:'Actual skater/goalie box base fields + complete event/scoring FOW/SHP + explicit goalie decision inventory; unsupported shutouts remain null/held',validationKnownAt:validatedAt,productionPromotionEnabled:false,genuineLiveFeed:false};
 await writeFile(`${directory}/queue.json`,JSON.stringify({report,stages},null,2)+'\n');await writeFile(`${directory}/reviewed_future_game_manifest.json`,JSON.stringify(manifest,null,2)+'\n');await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await db.$disconnect();}
