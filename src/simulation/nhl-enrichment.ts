import {fingerprint} from '@/ingestion/contracts';
import {reconcileNhlEvents} from '@/ingestion/open-data/nhl-evidence';
import {reconcileNhlFaceoffs} from '@/ingestion/open-data/nhl-faceoff-evidence';
import {proveNhlGoalieDecisions} from '@/ingestion/open-data/nhl-goalie-decisions';
import {integer,type SourceRow} from '@/ingestion/open-data/read';
import {normalizeNhlSourceBox} from '@/ingestion/open-data/nhl-source-statistics';
import {calculateScore} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';

export type NhlHistoricalProof={kind:string;sourceSha256:string;sourceUrl:string;schemaProfile:string;physicalRows:number;missingColumns:string[];license:string;licenseReference:string;receivedAt:string;decodedPath:string;decodedSha256:string};
export type NhlHistoricalOverlay={sport:'NHL';seasonStartYear:number;sourceGameId:string;sourcePlayerId:string;role:'SKATER'|'GOALIE';fields:Record<string,number>;proof:Record<string,unknown>;sourceKnownAt:null;historicalOnly:true};
const transformVersion='m6-nhl-exact-historical-overlay-1';
// Reviewed historical formats only. A changed body or another season must be
// inspected independently; this never broadens runtime ingestion policy.
const omittedDeciderProfiles:Record<number,{scoring:string;events:string}>={
 2019:{scoring:'9204fe8ab211c2ab4889178278ada73cdc37fe0c066825b261368798c234bd80',events:'8fb3ef053fa589ff0a615415971e46138949c54daafa957be3b041d0b2843fb8'},
 2022:{scoring:'98d7ab4072641f7b426e1704856a61c5df252bc739be3c43df7b2943785f4378',events:'2745e2198d09969a96eeecbef265a589ce6f3543e44db5c2057849f8a7d643df'},
};
/** Offline evidence overlay. It neither grants historical eligibility nor claims
 * the source was known at the professional game date. Old schemas fail closed. */
export function enrichNhlHistoricalSeason(input:{seasonStartYear:number;skaters:SourceRow[];goalies:SourceRow[];info:SourceRow[];events:SourceRow[];scoring:SourceRow[];profiles:NhlHistoricalProof[]}){
 const sourceProofs=input.profiles.map(row=>({kind:row.kind,sha256:row.sourceSha256,schemaProfile:row.schemaProfile})).sort((a,b)=>a.kind.localeCompare(b.kind));
 if(input.profiles.length!==5||input.profiles.some(profile=>profile.missingColumns.length||profile.schemaProfile!=='NHL_OFFICIAL_DERIVED_NAMED_FIELDS_V1'))throw Error('Historical NHL source format requires independent schema review.');
 const season=`${input.seasonStartYear}${input.seasonStartYear+1}`,infoCounts=new Map<string,number>();for(const row of input.info)infoCounts.set(row.game_id,(infoCounts.get(row.game_id)??0)+1);
 const badGames=new Set(input.info.filter(row=>row.season!==season||!row.game_id.startsWith(String(input.seasonStartYear))||!['R','P'].includes(row.game_type)||infoCounts.get(row.game_id)!==1).map(row=>row.game_id));
 for(const row of [...input.skaters,...input.goalies])if(row.season!==season||!/^\d{5,10}$/.test(row.player_id))badGames.add(row.game_id);
 const profile=omittedDeciderProfiles[input.seasonStartYear],allowOmission=profile&&Object.entries(profile).every(([kind,sha])=>input.profiles.some(row=>row.kind===kind&&row.sourceSha256===sha));
 const events=reconcileNhlEvents(input.skaters,input.events,input.scoring,input.info,input.goalies,allowOmission?{allowSourceOmittedShootoutDecider:true}:undefined),faceoffs=reconcileNhlFaceoffs(input.skaters,input.events,input.info);
 const scoringShootoutGames=new Set(input.scoring.filter(row=>row.period_type==='SO'||row.period_type==='SHOOTOUT').map(row=>row.game_id)),sourceOmittedDeciderGames=new Set(input.events.filter(row=>row.event_type==='GAME_END'&&row.period_type==='SHOOTOUT'&&!scoringShootoutGames.has(row.game_id)).map(row=>row.game_id));
 const infos=new Map(input.info.map(row=>[row.game_id,row])),goalieGames=new Map<string,SourceRow[]>(),ends=new Map<string,SourceRow[]>();
 for(const row of input.goalies)goalieGames.set(row.game_id,[...(goalieGames.get(row.game_id)??[]),row]);for(const row of input.events.filter(row=>row.event_type==='GAME_END'))ends.set(row.game_id,[...(ends.get(row.game_id)??[]),row]);
 const goalieDecisionProof=new Map<string,ReturnType<typeof proveNhlGoalieDecisions>>();for(const[gameId,rows]of goalieGames){const info=infos.get(gameId),end=ends.get(gameId);if(info&&end?.length===1&&!badGames.has(gameId))goalieDecisionProof.set(gameId,proveNhlGoalieDecisions(rows,info,end[0]));}
 const overlays:NhlHistoricalOverlay[]=[],metrics={skaterRows:input.skaters.length,goalieRows:input.goalies.length,exactFaceoffRows:0,exactShorthandedRows:0,goalieWinRows:0,shutoutRows:0,explicitShutoutCredits:0,unknownShutoutRows:0,goalieGoalCreditRows:0,sourceRowsCompleteV9Before:0,sourceRowsCompleteV9After:0};
 const fullyValidatedGames=new Set([...events.accepted.keys()].map(key=>key.split(':')[0]));
 for(const[role,rows]of [['SKATER',input.skaters],['GOALIE',input.goalies]] as const)for(const row of rows){
  if(badGames.has(row.game_id))continue;
  const fields:Record<string,number>={},proof:Record<string,unknown>={transformVersion,sourceProofs};
  if(role==='SKATER'){
   const exactFaceoffs=faceoffs.accepted.get(`${row.game_id}:${row.player_id}`),scoring=events.accepted.get(`${row.game_id}:${row.player_id}`);
   if(exactFaceoffs){fields.faceoff_wins=exactFaceoffs.faceoff_wins;proof.faceoff_wins={basis:'COMPLETE_EXACT_FACEOFF_ACTORS_AND_BOX_PERCENT_CROSSCHECK',eventIds:exactFaceoffs.faceoffEvents};metrics.exactFaceoffRows++;}
   if(scoring){fields.shorthanded_points_bonus=scoring.shorthanded_points_bonus;proof.shorthanded_points_bonus={basis:'COMPLETE_EXPLICIT_SCORING_STRENGTH_AND_CREDITS_WITH_BOX_RECONCILIATION',goalEventIds:scoring.shortGoalEvents,...(sourceOmittedDeciderGames.has(row.game_id)?{shootoutProfile:'HISTORICAL_SOURCE_OMITS_DECIDER; explicit final SO period, final team adjustment and all ordinary scoring credits validated; no individual shootout credit or synthetic scoring row'}:{})};metrics.exactShorthandedRows++;}
  }else{
   const decisions=goalieDecisionProof.get(row.game_id),zeroTime=/^0{1,3}:00$/.test(row.toi),positiveTime=/^\d+:[0-5]\d$/.test(row.toi)&&!zeroTime;
   const info=infos.get(row.game_id),home=integer(info?.home_score),away=integer(info?.away_score),winningTeam=home!==null&&away!==null&&home!==away?home>away?info?.home_team_abbr:info?.away_team_abbr:null;
   if(info?.game_state==='OFF'&&winningTeam&&['W','L','O'].includes(row.decision)&&((row.decision==='W')===(row.team_abbrev===winningTeam))){fields.goalie_win=Number(row.decision==='W');proof.goalie_win={basis:'EXPLICIT_SOURCE_DECISION_AND_FINAL_TEAM_RESULT',decision:row.decision,winningTeam};}
   else if(decisions?.accepted){fields.goalie_win=decisions.decisions.get(row.player_id)!;proof.goalie_win={basis:'UNIQUE_EXPLICIT_WINNER_COMPLETE_NATIVE_GOALIE_INVENTORY',...decisions.evidence};}
   else if(zeroTime){fields.goalie_win=0;proof.goalie_win={basis:'EXPLICIT_ZERO_ICE_TIME_NONPARTICIPANT',toi:row.toi};}
   if(fields.goalie_win!==undefined)metrics.goalieWinRows++;
   // Explicit credit is accepted only if the versioned source actually has it.
   // Zero GA with positive playing time remains unknown.
   const explicit=integer(row.shutout);
   if(explicit!==null&&explicit<=1&&!(explicit===1&&Number(row.goals_against)>0)){fields.shutout=explicit;proof.shutout={basis:'EXPLICIT_SOURCE_SHUTOUT_CREDIT',sourceField:'shutout'};metrics.explicitShutoutCredits++;}
   else if(integer(row.goals_against)!>0||zeroTime){fields.shutout=0;proof.shutout={basis:zeroTime?'EXPLICIT_ZERO_ICE_TIME_NONPARTICIPANT':'POSITIVE_GOALS_AGAINST_EXCLUDES_SHUTOUT',goalsAgainst:row.goals_against,toi:row.toi};}
   if(fields.shutout!==undefined)metrics.shutoutRows++;else metrics.unknownShutoutRows++;
   if(fullyValidatedGames.has(row.game_id)&&positiveTime){const credit=events.goalieScoringCredits.get(`${row.game_id}:${row.player_id}`);fields.goals=credit?.goals??0;proof.goals={basis:'COMPLETE_FINAL_SCORING_CREDITS_WITH_CANONICAL_GOALIE_ACTOR',goalEventIds:credit?.goalEvents??[]};metrics.goalieGoalCreditRows++;}
  }
  const base=normalizeNhlSourceBox(row,role).stats;
  if(calculateScore(ubpV9Rules,{role,stats:base}).missingStats.length===0)metrics.sourceRowsCompleteV9Before++;
  if(calculateScore(ubpV9Rules,{role,stats:{...base,...fields}}).missingStats.length===0)metrics.sourceRowsCompleteV9After++;
  if(Object.keys(fields).length)overlays.push({sport:'NHL',seasonStartYear:input.seasonStartYear,sourceGameId:row.game_id,sourcePlayerId:row.player_id,role,fields,proof,sourceKnownAt:null,historicalOnly:true});
 }
 overlays.sort((a,b)=>a.sourceGameId.localeCompare(b.sourceGameId)||a.sourcePlayerId.localeCompare(b.sourcePlayerId)||a.role.localeCompare(b.role));
 const keys=overlays.map(row=>`${row.sourceGameId}:${row.sourcePlayerId}:${row.role}`);if(new Set(keys).size!==keys.length)throw Error('Duplicate NHL historical overlay key requires quarantine.');
 return{overlays,report:{transformVersion,seasonStartYear:input.seasonStartYear,metrics,sourceProofs,sourceGames:infos.size,invalidIdentityOrSeasonGames:[...badGames].sort(),faceoffConflicts:faceoffs.rejected,scoringConflicts:events.rejected,goalieDecisionConflicts:[...goalieDecisionProof].filter(([,value])=>!value.accepted).map(([gameId,value])=>({gameId,reasons:!value.accepted?value.reasons:[]})),overlayFingerprint:fingerprint(overlays),simulationReady:false,knownAtLimitation:'Retrospective licensed evidence; exact historical publication remains unknown. Never usable as pregame knowledge.'}};
}
