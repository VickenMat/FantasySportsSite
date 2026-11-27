import type { GameStatRole, Sport } from '@/generated/prisma/enums';
import { normalizeHistoricalRow } from '@/imports/normalize';
import { calculateScore, applicableRules, type StatValues } from '@/scoring/engine';
import { ubpV9Rules } from '@/scoring/ubp-v9';
import { observationSchema, fingerprint, type Observation } from '../contracts';
import { observedEvidencePolicy, observedPolicyAdoptedAt } from '../evidence-policy';
import { statEntityKey } from '../statistics';
import { nflCompletedScheduleResult } from './nfl-schedule-result';
import type { SourceRow } from './read';
import {validNbaGameBridge,type NbaGameIdentityEvidence} from './nba-game-binding';

export type CompetitiveSourceProof={sha256:string;sourceUrl:string;receivedAt:string;artifactModifiedAt?:string|null;id?:string};
export type CanonicalCompetitiveGame={id:string;provider:string;externalId:string;sport:Sport;seasonYear:number;phase:string;week:number|null;gameDate:string|null;scheduledStartsAt:string|null;gameIdentityEvidence?:NbaGameIdentityEvidence;participantSideEvidence?:{observationId:string;contentHash:string;home:string;away:string};teams:{id:string;provider:string;externalId:string;code:string;side:'HOME'|'AWAY'|'UNKNOWN'}[]};
export type CanonicalCompetitiveStat={id:string;contentHash:string;sourcePlayerId:string;playerId:string;teamId:string;role:GameStatRole;stats:StatValues;raw:unknown};
export type CompetitiveHold={sourcePlayerId?:string;role?:GameStatRole;reason:string;details?:Record<string,unknown>};
type Fact={sourcePlayerId:string;playerId:string;teamId:string;role:GameStatRole;stats:StatValues;raw:SourceRow;historicalStat?:{id:string;contentHash:string};historicalObservedPositions:string[]};
export type CompetitiveGameStage={game:CanonicalCompetitiveGame;sourceFingerprint:string;observedAt:string;expectedSourcePlayers:number;records:Observation[];holds:CompetitiveHold[];historicalV9CompletePlayers:number;completeBoxBindingReady:boolean;productionCompetitiveReady:false;productionHolds:string[]};
const whole=(value:string|undefined)=>value!==undefined&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
function stage(input:{provider:string;game:CanonicalCompetitiveGame;proofs:CompetitiveSourceProof[];validatedAt:string;facts:Fact[];expectedPlayers:number;holds:CompetitiveHold[];finalSourceRecord:SourceRow}):CompetitiveGameStage{
 if(Date.parse(input.validatedAt)<+observedPolicyAdoptedAt||!Number.isFinite(Date.parse(input.validatedAt)))throw Error('Prospective processing must follow policy adoption.');
 if(!input.proofs.length||input.proofs.some(proof=>! /^[a-f0-9]{64}$/.test(proof.sha256)))throw Error('Immutable source fingerprints are required.');
 const stableProofs=input.proofs.map(({receivedAt,...content})=>{void receivedAt;return content;});
 const sourceFingerprint=fingerprint({sourceProofs:stableProofs,gameBinding:input.game,canonicalFacts:input.facts.map(fact=>({sourcePlayerId:fact.sourcePlayerId,playerId:fact.playerId,role:fact.role,stats:fact.stats,historicalStat:fact.historicalStat??null})).sort((a,b)=>`${a.playerId}:${a.role}`.localeCompare(`${b.playerId}:${b.role}`))}),base={provider:input.provider,sport:input.game.sport,revisionToken:sourceFingerprint,revisionOrdinal:Date.parse(input.validatedAt),sourceReference:input.proofs[0].sourceUrl,observedAt:input.validatedAt,effectiveAt:null,publishedAt:null};
 const records:Observation[]=[],holds=[...input.holds];let historicalV9CompletePlayers=0;
 const keys=new Set<string>();
 for(const fact of input.facts){
  const key=`${fact.playerId}:${fact.role}`;if(keys.has(key))throw Error('Duplicate canonical player/role source fact.');keys.add(key);
  const team=input.game.teams.find(team=>team.id===fact.teamId);if(!team)throw Error('Source athlete is not linked to an existing game participant.');
  const allowed=new Set(applicableRules(ubpV9Rules,fact.role).map(rule=>rule.statKey==='tight_end_reception_bonus'?'receptions':rule.statKey==='pitching_innings'?'pitching_outs':rule.statKey));
  if(Object.keys(fact.stats).some(key=>!allowed.has(key)))throw Error('Source normalization contains a non-V9 field.');
  const score=calculateScore(ubpV9Rules,{role:fact.role,stats:fact.stats,teEligible:fact.role==='FOOTBALL'&&fact.historicalObservedPositions.length?fact.historicalObservedPositions.includes('TE'):null});
  if(score.missingStats.length){holds.push({sourcePlayerId:fact.sourcePlayerId,role:fact.role,reason:`MISSING_V9_INPUTS:${score.missingStats.join(',')}`});continue;}
  historicalV9CompletePlayers++;
  records.push(observationSchema.parse({...base,entityKey:statEntityKey(input.game.id,fact.playerId,fact.role),raw:{sourceRecord:fact.raw,sourceProofs:stableProofs,canonicalGameBinding:input.game,...(fact.historicalStat?{historicalStatId:fact.historicalStat.id,priorContentHash:fact.historicalStat.contentHash}:{}),historicalObservedPositions:fact.historicalObservedPositions,scope:'REVIEW_QUEUE_ONLY; historical positions are not current eligibility'},normalized:{kind:'STAT',player:{provider:'v9-historical',externalId:fact.sourcePlayerId},game:{provider:input.game.provider,externalId:input.game.externalId},team:{provider:team.provider,externalId:team.externalId},role:fact.role,phase:'FINAL',publicationSemantics:'UNVERIFIED',initialPublishedAt:null,stats:fact.stats}}));
 }
 records.unshift(observationSchema.parse({...base,entityKey:`game-state:${input.game.id}`,raw:{sourceRecord:input.finalSourceRecord,sourceProofs:stableProofs,canonicalGameBinding:input.game,validationSemantics:'FIRST_LOCAL_VALIDATION_OF_RETAINED_FINAL_SOURCE; not physical event time'},normalized:{kind:'GAME_STATE',evidencePolicy:observedEvidencePolicy,game:{provider:input.game.provider,externalId:input.game.externalId},status:'FINAL',scheduledStartsAt:input.game.scheduledStartsAt,actualStartsAt:null,completedAt:null}}));
 return{game:input.game,sourceFingerprint,observedAt:input.validatedAt,expectedSourcePlayers:input.expectedPlayers,records,holds,historicalV9CompletePlayers,completeBoxBindingReady:holds.length===0&&historicalV9CompletePlayers===input.expectedPlayers&&new Set(input.facts.map(fact=>fact.playerId)).size===input.expectedPlayers,productionCompetitiveReady:false,productionHolds:['No reviewed development promotion or recurring promotion policy.','No demonstrated professional pre-lock ownership/eligibility/availability chronology for these historical observations.','A complete final box requires actual materialized source-stat and score-entry bindings plus immutable starter coverage.']};
}
export function buildNflCompetitiveRecords(input:{game:CanonicalCompetitiveGame;schedule:SourceRow;statistics:SourceRow[];players:ReadonlyMap<string,string>;proofs:CompetitiveSourceProof[];validatedAt:string}){
 const final=nflCompletedScheduleResult(input.schedule,input.validatedAt);
 if(input.game.gameDate&&input.game.gameDate!==input.schedule.gameday)throw Error('NFL accepted game date conflicts with source result date.');
 if(final.status!=='FINAL')throw Error(`NFL final-state hold: ${final.reason}`);
 if(input.game.sport!=='NFL'||input.game.externalId!==final.sourceGameId||input.game.seasonYear!==Number(input.schedule.season)||input.game.week!==Number(input.schedule.week)||input.game.phase!==(input.schedule.game_type==='REG'?'REGULAR':input.schedule.game_type==='POST'?'POSTSEASON':'PRESEASON')||!input.game.teams.some(team=>team.side==='HOME'&&team.code===input.schedule.home_team)||!input.game.teams.some(team=>team.side==='AWAY'&&team.code===input.schedule.away_team))throw Error('NFL canonical game tuple does not match its completed source result.');
 const facts:Fact[]=[],holds:CompetitiveHold[]=[];let expectedPlayers=0;
 for(const[index,row]of input.statistics.entries()){
  if(row.game_id!==final.sourceGameId)throw Error('NFL source row belongs to another game.');
  if(!['QB','RB','FB','WR','TE'].includes(row.position))continue;expectedPlayers++;
  const normalized=normalizeHistoricalRow('NFL',row,index+2),playerId=input.players.get(row.player_id),team=input.game.teams.find(team=>team.code===normalized.team.code&&team.side===normalized.team.side);
  if(!playerId||!team){holds.push({sourcePlayerId:row.player_id,role:'FOOTBALL',reason:!playerId?'MISSING_CANONICAL_PLAYER':'MISSING_GAME_PARTICIPANT'});continue;}
  facts.push({sourcePlayerId:row.player_id,playerId,teamId:team.id,role:'FOOTBALL',stats:normalized.stats,raw:row,historicalObservedPositions:normalized.observedPositions});
 }
 return stage({provider:'nflverse-open-data',game:input.game,proofs:input.proofs,validatedAt:input.validatedAt,facts,expectedPlayers,holds,finalSourceRecord:input.schedule});
}
export function buildNhlCompetitiveRecords(input:{game:CanonicalCompetitiveGame;info:SourceRow;skaters:SourceRow[];goalies:SourceRow[];canonicalStats:CanonicalCompetitiveStat[];proofs:CompetitiveSourceProof[];validatedAt:string}){
 const row=input.info;
 if(whole(row.home_score)===null||whole(row.away_score)===null||row.home_score===row.away_score||input.game.phase!==(row.game_type==='R'?'REGULAR':row.game_type==='P'?'POSTSEASON':'PRESEASON')||(input.game.gameDate&&input.game.gameDate!==row.game_date))throw Error('NHL final score, phase or accepted date is unresolved.');
 if(input.game.sport!=='NHL'||row.game_state!=='OFF'||input.game.externalId!==row.game_id||Number(row.season.slice(0,4))!==input.game.seasonYear||row.game_date>input.validatedAt.slice(0,10)||!input.game.teams.some(team=>team.side==='HOME'&&team.code===row.home_team_abbr)||!input.game.teams.some(team=>team.side==='AWAY'&&team.code===row.away_team_abbr))throw Error('NHL final source/canonical game tuple is unresolved.');
 if(input.skaters.length<30||input.goalies.length!==4)throw Error('NHL expected final box inventory is incomplete.');
 const facts:Fact[]=[],holds:CompetitiveHold[]=[];
 for(const box of [...input.skaters,...input.goalies]){
  const role:GameStatRole=input.skaters.includes(box)?'SKATER':'GOALIE',canonical=input.canonicalStats.filter(stat=>stat.sourcePlayerId===box.player_id&&stat.role===role),team=input.game.teams.find(team=>team.code===box.team_abbrev&&team.side===(box.home_away==='home'?'HOME':'AWAY'));
  if(box.game_id!==row.game_id)throw Error('NHL source box row belongs to another game.');
  if(canonical.length!==1||!team||canonical[0].teamId!==team.id){holds.push({sourcePlayerId:box.player_id,role,reason:'UNRESOLVED_CANONICAL_PLAYER_ROLE_OR_PARTICIPANT'});continue;}
  const stat=canonical[0],observed:StatValues=role==='SKATER'?{goals:whole(box.goals),assists:whole(box.assists),sog:whole(box.shots_on_goal),blockedShots:whole(box.blocked_shots),hits:whole(box.hits)}:{saves:whole(box.saves),goalsAgainst:whole(box.goals_against)};
  const differences=Object.entries(observed).filter(([key,value])=>value===null||stat.stats[key]!==value).map(([field,sourceValue])=>({field,sourceValue,acceptedValue:stat.stats[field]??null}));
  if(differences.length){holds.push({sourcePlayerId:box.player_id,role,reason:'SOURCE_BOX_DIFFERS_FROM_REVIEWED_CANONICAL_STATISTICS',details:{historicalStatId:stat.id,contentHash:stat.contentHash,differences,alsoMissingShutout:role==='GOALIE'&&stat.stats.shutout==null}});continue;}
  // Missing fields are inherited only from the accepted historical revision/proof,
  // never synthesized from percentages, zero GA, expected roles or blank decisions.
  facts.push({sourcePlayerId:box.player_id,playerId:stat.playerId,teamId:team.id,role,stats:stat.stats,raw:box,historicalStat:{id:stat.id,contentHash:stat.contentHash},historicalObservedPositions:box.position?[box.position]:[]});
 }
 return stage({provider:'sportsdataverse-open-data',game:input.game,proofs:input.proofs,validatedAt:input.validatedAt,facts,expectedPlayers:input.skaters.length+input.goalies.length,holds,finalSourceRecord:row});
}

export function buildNbaCompetitiveRecords(input:{game:CanonicalCompetitiveGame;schedule:SourceRow;box:SourceRow[];players:ReadonlyMap<string,string>;proofs:CompetitiveSourceProof[];validatedAt:string}){
 const row=input.schedule,home=whole(row.home_pts),away=whole(row.away_pts);
 if(input.game.gameDate&&input.game.gameDate!==row.game_date)throw Error('NBA accepted game date conflicts with source final date.');
 if(input.game.phase!==(row.season_type==='preseason'?'PRESEASON':'REGULAR'))throw Error('NBA source phase differs from the canonical game.');
 const bridge=input.game.gameIdentityEvidence;
 if(bridge&&!validNbaGameBridge(input.game,row,bridge))throw Error('NBA explicit publisher game bridge is contradictory.');
 if(input.game.sport!=='NBA'||(!bridge&&row.game_id!==input.game.externalId)||Number(row.season)-1!==input.game.seasonYear||row.game_date>input.validatedAt.slice(0,10)||home===null||away===null||home===away||row.home_wl!==(home>away?'W':'L')||row.away_wl!==(home>away?'L':'W'))throw Error('NBA explicit final outcome is unresolved or contradictory.');
 for(const side of ['home','away'] as const){if(!input.game.teams.some(team=>team.side===side.toUpperCase()&&(bridge?team.externalId===bridge.crosswalk[`${side}_espn_team_id`]:team.code===row[`${side}_team_abbreviation`])))throw Error('NBA canonical game participant does not match the source schedule.');const sourceRows=input.box.filter(box=>box.side===side);if(sourceRows.length<5||sourceRows.some(box=>box.team_id!==row[`${side}_team_id`]||whole(box.points)===null)||sourceRows.reduce((sum,box)=>sum+whole(box.points)!,0)!==(side==='home'?home:away))throw Error('NBA complete box team inventory or final points do not reconcile.');}
 const fields={PTS:'points',REB:'rebounds_total',AST:'assists',STL:'steals',BLK:'blocks',TOV:'turnovers',FGM:'field_goals_made',FGA:'field_goals_attempted',FTM:'free_throws_made',FTA:'free_throws_attempted',FG3M:'three_pointers_made',OREB:'rebounds_offensive'};
 const facts:Fact[]=[],holds:CompetitiveHold[]=[];
 for(const box of input.box){
  if(box.game_id!==row.game_id||Number(box.season)!==Number(row.season))throw Error('NBA source box game/season differs from its final schedule.');
  const playerId=input.players.get(box.person_id),team=input.game.teams.find(team=>team.side===box.side.toUpperCase()&&(bridge?box.team_id===bridge.crosswalk[`nba_${box.side}_team_id`]&&team.externalId===bridge.crosswalk[`${box.side}_espn_team_id`]:team.code===box.team_tricode));
  if(!playerId||!team){holds.push({sourcePlayerId:box.person_id,role:'BASKETBALL',reason:!playerId?'MISSING_CANONICAL_PLAYER':'MISSING_CANONICAL_GAME_PARTICIPANT'});continue;}
  const stats=Object.fromEntries(Object.entries(fields).map(([key,column])=>[key,whole(box[column])]));
  facts.push({sourcePlayerId:box.person_id,playerId,teamId:team.id,role:'BASKETBALL',stats,raw:box,historicalObservedPositions:box.position?[box.position]:[]});
 }
 return stage({provider:'sportsdataverse-open-data',game:input.game,proofs:input.proofs,validatedAt:input.validatedAt,facts,expectedPlayers:input.box.length,holds,finalSourceRecord:row});
}


/** Bind only after the actual normalized source rows and complete score entries exist.
 * This constructor never invents stat/ledger IDs or official publication timestamps. */
export function bindCompleteFinalBox(stage:CompetitiveGameStage,bindings:{playerId:string;role:GameStatRole;statId:string;statHash:string;scoreEntryId:string;sourceProvider:string;stats:StatValues;calculatedAt?:string;recordedAt?:string}[],at:string):Observation{
 if(!stage.completeBoxBindingReady||stage.holds.length||bindings.length!==stage.expectedSourcePlayers)throw Error('A partial or unresolved source box cannot establish a correction anchor.');
 const seen=new Set<string>();
 for(const binding of bindings){const key=statEntityKey(stage.game.id,binding.playerId,binding.role);if(seen.has(binding.playerId))throw Error('Each source athlete requires one resolved scoring role.');seen.add(binding.playerId);const record=stage.records.find(record=>record.entityKey===key&&record.normalized.kind==='STAT');if(!record||record.provider!==binding.sourceProvider||record.normalized.kind!=='STAT'||fingerprint(record.normalized.stats)!==fingerprint(binding.stats))throw Error('Materialized stat evidence does not match the staged source box.');}
 const state=stage.records[0],statistics=bindings.map(({playerId,role,statId,statHash,scoreEntryId})=>({playerId,role,statId,statHash,scoreEntryId})),revisionToken=fingerprint({sourceFingerprint:stage.sourceFingerprint,statistics}),revisionOrdinal=Math.max(Date.parse(stage.observedAt),...bindings.flatMap(binding=>[binding.calculatedAt,binding.recordedAt].filter((value):value is string=>Boolean(value)).map(value=>Date.parse(value))));
 return observationSchema.parse({provider:state.provider,sport:state.sport,entityKey:`complete-final-box:${stage.game.id}`,revisionToken,revisionOrdinal,sourceReference:state.sourceReference,observedAt:at,publishedAt:null,effectiveAt:null,raw:{sourceFingerprint:stage.sourceFingerprint,scope:'Materialized complete final source box; no exact publication claim'},normalized:{kind:'COMPLETE_FINAL_BOX',game:{provider:stage.game.provider,externalId:stage.game.externalId},policyVersion:observedEvidencePolicy,sourceFingerprint:stage.sourceFingerprint,completeness:{allExpectedRowsPresent:true,rolesResolved:true,noUnresolvedContradictions:true,expectedPlayers:stage.expectedSourcePlayers},statistics,publicationSemantics:'OBSERVED_COMPLETE_BOX',initialPublishedAt:null}});
}
export {stage as stageCompetitiveRecords};
