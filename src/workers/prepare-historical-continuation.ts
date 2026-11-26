import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { nhlEvents, sourceProduct, integer } from '@/ingestion/open-data/read';
import { reconcileNhlEvents } from '@/ingestion/open-data/nhl-evidence';
import { reconcileNhlFaceoffs } from '@/ingestion/open-data/nhl-faceoff-evidence';
import { proveNhlGoalieDecisions } from '@/ingestion/open-data/nhl-goalie-decisions';
import { mlbPlayCompleteness } from '@/ingestion/open-data/mlb-play-completeness';
import { provenMlbRole } from '@/ingestion/open-data/mlb-role';
import { fingerprint } from '@/ingestion/contracts';
import { calculateScore, type StatValues } from '@/scoring/engine';
import { historicalStatsForScoring } from '@/scoring/historical-evidence';
import { ubpV9Rules } from '@/scoring/ubp-v9';
import type { HistoricalStatEnrichmentRow } from '@/server/historical-stat-enrichment';

const db = getDatabase();
const original = (raw: unknown) => { let row = raw as Record<string, unknown>; for (let i=0;i<10 && row?.original && typeof row.original==='object';i++) row=row.original as Record<string,unknown>; return row; };
try {
  const [skaters, events, scoring, info, goalies, mlb] = await Promise.all([sourceProduct('nhl-skaters-2027'), nhlEvents(), sourceProduct('nhl-scoring-2027'), sourceProduct('nhl-game-info-2027'), sourceProduct('nhl-goalies-2027'), sourceProduct('mlb-plays-2026')]);
  const full = reconcileNhlEvents(skaters.rows,events.rows,scoring.rows,info.rows,goalies.rows);
  const faceoffs = reconcileNhlFaceoffs(skaters.rows,events.rows,info.rows);
  const previous = JSON.parse(await readFile('data/stat_enrichment/nhl_real_reconciliation.json','utf8'));
  const oldMlb = JSON.parse(await readFile('data/stat_enrichment/approved_manifests/c0efa541b199b0cd7d65c4b58377f848f4d3b052cef602f1cd3eccbc9c175460.json','utf8'));
  const remainingMlb = oldMlb.rows.filter((row: {role:string|null})=>!row.role) as {gameId:string;playerId:string;sourceGameId:string;sourcePlayerId:string;statTargets:{id:string;role:string;contentHash:string}[]}[];
  const nhlWhere = { provider:'v9-historical', game:{sport:'NHL' as const,season:{startYear:2026}}, player:{isSynthetic:false,isDemo:false} };
  const nhlSelect = { id:true,gameId:true,playerId:true,role:true,provider:true,revision:true,contentHash:true,normalized:true,observedPositions:true,game:{select:{externalId:true,seasonId:true}},player:{select:{displayName:true,externalIds:{where:{provider:'v9-historical',sport:'NHL' as const},select:{externalId:true}}}} } as const;
  const [skaterStats, goalieStats, mlbStats, batting] = await db.$transaction(async tx=>{
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const skater = await tx.playerGameStat.findMany({where:{...nhlWhere,role:'SKATER'},orderBy:[{revision:'desc'},{recordedAt:'desc'}],distinct:['gameId','playerId','role'],select:nhlSelect});
    const goalie = await tx.playerGameStat.findMany({where:{...nhlWhere,role:'GOALIE'},orderBy:[{revision:'desc'},{recordedAt:'desc'}],distinct:['gameId','playerId','role'],select:{...nhlSelect,raw:true}});
    const target = await tx.playerGameStat.findMany({where:{id:{in:remainingMlb.flatMap(row=>row.statTargets.map(stat=>stat.id))}},include:{player:true}});
    const box = await tx.playerGameStat.findMany({where:{provider:'v9-historical',role:'HITTER',gameId:{in:[...new Set(remainingMlb.map(row=>row.gameId))]}},orderBy:[{revision:'desc'},{recordedAt:'desc'}],distinct:['gameId','playerId','role'],include:{player:{include:{externalIds:{where:{provider:'v9-historical',sport:'MLB'}}}}}});
    return [skater,goalie,target,box] as const;
  },{isolationLevel:'RepeatableRead',timeout:120000});
  const infoMap = new Map(info.rows.map(row=>[row.game_id,row])), goaliesByGame=new Map<string,typeof goalies.rows>(), ends=new Map<string,typeof events.rows>();
  for (const row of goalies.rows) goaliesByGame.set(row.game_id,[...(goaliesByGame.get(row.game_id)??[]),row]);
  for (const row of events.rows.filter(row=>row.event_type==='GAME_END')) ends.set(row.game_id,[...(ends.get(row.game_id)??[]),row]);
  const goalieDecisions = new Map<string,ReturnType<typeof proveNhlGoalieDecisions>>();
  for (const [gameId,rows] of goaliesByGame) if(infoMap.has(gameId)&&ends.get(gameId)?.length===1&&faceoffs.accepted.has(`${gameId}:${skaters.rows.find(row=>row.game_id===gameId)?.player_id}`)) goalieDecisions.set(gameId,proveNhlGoalieDecisions(rows,infoMap.get(gameId)!,ends.get(gameId)![0]));
  const rows:HistoricalStatEnrichmentRow[]=[], changesById=new Map<string,Record<string,number>>();
  const canonicalGoalies=new Map(goalieStats.map(stat=>[`${stat.game.externalId}:${stat.player.externalIds[0]?.externalId}`,stat]));
  const allStats=[...skaterStats,...goalieStats].sort((a,b)=>a.id.localeCompare(b.id));
  const unresolved=[];
  for(const stat of allStats){
    const externalId=stat.player.externalIds[0]?.externalId, key=`${stat.game.externalId}:${externalId}`, normalized=stat.normalized as StatValues;
    const fields:HistoricalStatEnrichmentRow['fields']={},evidence:HistoricalStatEnrichmentRow['evidence']={};
    if(stat.role==='SKATER'){
      const found=full.accepted.get(key),fo=faceoffs.accepted.get(key);
      if(normalized.faceoff_wins==null&&fo){fields.faceoff_wins=fo.faceoff_wins;evidence.faceoff_wins={source:events.proof,events:fo.faceoffEvents,completeGame:true,validatedWith:[skaters.proof.sha256,info.proof.sha256],shootoutScoreSemantics:'NHL Rule 84.4'};}
      if(normalized.shorthanded_points_bonus==null&&found){fields.shorthanded_points_bonus=found.shorthanded_points_bonus;evidence.shorthanded_points_bonus={sources:[events.proof,scoring.proof,skaters.proof,goalies.proof,info.proof],events:found.shortGoalEvents,completeGame:true,goalieActorsRecognized:true,shootoutPersonalGoalsExcluded:true};}
    }
    if(stat.role==='GOALIE'&&normalized.goalie_win==null){const decision=goalieDecisions.get(stat.game.externalId);if(decision?.accepted&&externalId&&decision.decisions.has(externalId)&&decision.evidence.inventory.every(actor=>canonicalGoalies.has(`${stat.game.externalId}:${actor.playerId}`))){fields.goalie_win=decision.decisions.get(externalId)!;evidence.goalie_win={sources:[goalies.proof,info.proof,events.proof],...decision.evidence,method:externalId===decision.winnerId?'EXPLICIT_WINNER':'EXPLICIT_OTHER_WINNER_COMPLETE_INVENTORY',unknownDecisionNeverDefaultedToZero:true};}}
    if(Object.keys(fields).length){rows.push({priorStatId:stat.id,priorContentHash:stat.contentHash,playerId:stat.playerId,gameId:stat.gameId,role:stat.role as 'SKATER'|'GOALIE',fields,evidence});changesById.set(stat.id,fields);}
    if(stat.role==='GOALIE'){const value=historicalStatsForScoring({...stat,normalized,raw:'raw'in stat?stat.raw:undefined});if(value.shutout==null)unresolved.push({playerId:stat.playerId,playerName:stat.player.displayName,gameId:stat.gameId,sourceGameId:stat.game.externalId,sourcePlayerId:externalId,reason:normalized.shutout===1?'UNSUPPORTED_LEGACY_POSITIVE_SHUTOUT':'EXPLICIT_SHUTOUT_CREDIT_MISSING'});}
  }
  const before=new Map<string,boolean>(),after=new Map<string,boolean>();
  for(const stat of allStats){const base=historicalStatsForScoring({...stat,normalized:stat.normalized as StatValues,raw:'raw'in stat?stat.raw:undefined});for(const[map,values]of[[before,base],[after,{...base,...changesById.get(stat.id)}]]as const){const complete=calculateScore(ubpV9Rules,{role:stat.role,stats:values}).missingStats.length===0;map.set(stat.playerId,(map.get(stat.playerId)??true)&&complete);}}
  const manifest={version:'real-nhl-missing-fields-1',sourceProofs:[skaters.proof,events.proof,scoring.proof,info.proof,goalies.proof],rows};
  const report={sourceGames:full.games,completeScoringGames:full.games-full.rejected.length,rejectedGames:full.rejected,previouslyWithheldGames:previous.rejectedGames.length,newlyReconciledGames:previous.rejectedGames.filter((row:{gameId:string})=>!full.rejected.some(game=>game.gameId===row.gameId)).length,fieldCounts:Object.fromEntries(['faceoff_wins','shorthanded_points_bonus','goalie_win'].map(key=>[key,rows.filter(row=>key in row.fields).length])),proposedRevisions:rows.length,playersEnriched:new Set(rows.map(row=>row.playerId)).size,beforeIncompletePlayers:[...before.values()].filter(value=>!value).length,afterIncompletePlayers:[...after.values()].filter(value=>!value).length,newlyCompletePlayers:[...after].filter(([id,complete])=>complete&&!before.get(id)).length,explicitShutoutValuesRecovered:0,goalieDecisionGamesValidated:[...goalieDecisions.values()].filter(value=>value.accepted).length,targetFingerprint:fingerprint(manifest),developmentWrites:0};
  await writeFile('data/stat_enrichment/nhl_accelerated_missing_manifest.json',JSON.stringify(manifest,null,2)+'\n');
  const goalieGoalReview=[...full.goalieScoringCredits].map(([key,credit])=>{const stat=goalieStats.find(row=>`${row.game.externalId}:${row.player.externalIds[0]?.externalId}`===key);return{sourceKey:key,credit,canonicalStatId:stat?.id,playerId:stat?.playerId,gameId:stat?.gameId,priorContentHash:stat?.contentHash,appliesToV9GoalieRole:false,storedV9GoalInputAbsentByDesign:true,requiresKnownValueCorrection:false,sources:[events.proof,scoring.proof,goalies.proof]};});
  await writeFile('data/stat_enrichment/nhl_accelerated_report.json',JSON.stringify({report,unresolvedShutouts:unresolved,goalieGoalReview},null,2)+'\n');
  const mlbGames=new Map<string,typeof mlb.rows>();for(const row of mlb.rows)mlbGames.set(row.game_pk,[...(mlbGames.get(row.game_pk)??[]),row]);
  const mlbRows=remainingMlb.map(target=>{
    const targetStats=mlbStats.filter(stat=>target.statTargets.some(prior=>prior.id===stat.id)),hitter=targetStats.find(stat=>stat.role==='HITTER'),pitcher=targetStats.find(stat=>stat.role==='PITCHER');
    const expected=new Map<string,number>(),unknownPA:string[]=[];
    for(const row of batting.filter(row=>row.gameId===target.gameId)){const id=row.player.externalIds[0]?.externalId,count=integer(original(row.raw).plateAppearances);if(!id||count===null)unknownPA.push(row.id);else expected.set(id,count);}
    const proof=mlbPlayCompleteness(mlbGames.get(target.sourceGameId)??[],expected),complete=proof.complete&&!unknownPA.length;
    const battingPA=integer(hitter?original(hitter.raw).plateAppearances:null),pitchingGames=integer(pitcher?original(pitcher.raw).gamesPitched:null),pitchingStarts=integer(pitcher?original(pitcher.raw).gamesStarted:null);
    const role=provenMlbRole({bats:proof.batters.has(target.sourcePlayerId),pitches:proof.pitchers.has(target.sourcePlayerId),plateAppearances:battingPA,pitchingGames,pitchingStarts,complete});
    return{...target,playerName:hitter?.player.displayName??pitcher?.player.displayName,role,status:role?'VALIDATED_CORRECTED_PA_COMPLETENESS':'PARTICIPATION_UNRESOLVED',battingPA,pitchingGames,pitchingStarts,boxHitter:original(hitter?.raw),boxPitcher:original(pitcher?.raw),completeness:{...proof,batters:[...proof.batters],pitchers:[...proof.pitchers],counts:Object.fromEntries(proof.counts),unknownPA},source:mlb.proof};
  }).sort((a,b)=>a.gameId.localeCompare(b.gameId)||a.playerId.localeCompare(b.playerId));
  const mlbReport={beforeUnresolvedAppearances:remainingMlb.length,validatedNewRoles:mlbRows.filter(row=>row.role).length,remainingUnresolved:mlbRows.filter(row=>!row.role).length,players:new Set(mlbRows.filter(row=>row.role).map(row=>row.playerId)).size,targetFingerprint:fingerprint(mlbRows),developmentWrites:0};
  await writeFile('data/stat_enrichment/mlb_accelerated_role_manifest.json',JSON.stringify({report:mlbReport,rows:mlbRows},null,2)+'\n');
  console.log(JSON.stringify({nhl:report,goalieGoalReview,mlb:mlbReport,mlbUnresolved:mlbRows.filter(row=>!row.role).map(row=>({playerName:row.playerName,sourceGameId:row.sourceGameId,battingPA:row.battingPA,pitchingGames:row.pitchingGames,completeness:row.completeness.reasons,hitterGamesPlayed:row.boxHitter.gamesPlayed,pitcherGamesPlayed:row.boxPitcher.gamesPlayed}))},null,2));
}finally{await db.$disconnect();}
