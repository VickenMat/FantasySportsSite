import { normalizeHistoricalRow } from '@/imports/normalize';
import { fingerprint,type Observation } from '../contracts';
import { stageCompetitiveRecords,type CanonicalCompetitiveGame,type CompetitiveSourceProof,type CompetitiveHold } from './competitive-records';
import type { SourceRow } from './read';
import type { StatValues } from '@/scoring/engine';
export type NhlExactEventFields={faceoff_wins:number;shorthanded_points_bonus:number;faceoffEvents:string[];shortGoalEvents:string[]};
/** Existing accepted normalizer supplies V9 keys. Unknown source fields remain
 * null; percentages, team wins and zero GA never manufacture exact missing inputs. */
export function normalizeNhlSourceBox(box:SourceRow,role:'SKATER'|'GOALIE',events?:NhlExactEventFields,provenDecision?:number){
 const season=box.season.slice(0,4)+'-'+box.season.slice(6,8);
 const raw:SourceRow={...box,season,team:box.team_abbrev,category:role==='GOALIE'?'goalies':box.position==='D'?'defense':'forwards',position:role==='GOALIE'?'G':box.position,sog:box.shots_on_goal??'',blockedShots:box.blocked_shots??'',goalsAgainst:box.goals_against??'',faceoff_wins:events?String(events.faceoff_wins):'',shorthanded_points_bonus:events?String(events.shorthanded_points_bonus):'',goalie_win:provenDecision===undefined?'':String(provenDecision),shutout:box.shutout??''};
 const normalized=normalizeHistoricalRow('NHL',raw,1),zeroTime=/^0{1,3}:00$/.test(box.toi??'');
 const fieldProvenance=role==='SKATER'?{base:'EXPLICIT_SOURCE_SKATER_BOX',faceoff_wins:events?'COUNTED_COMPLETE_FACEOFF_EVENTS':'UNKNOWN',shorthanded_points_bonus:events?'COMPLETE_SCORING_STRENGTH_CREDITS':'UNKNOWN',faceoffEventIds:events?.faceoffEvents??[],shorthandedEventIds:events?.shortGoalEvents??[]}:{base:'EXPLICIT_SOURCE_GOALIE_BOX',goalie_win:box.decision?'EXPLICIT_SOURCE_DECISION':provenDecision!==undefined?'EXPLICIT_OTHER_WINNER_COMPLETE_CANONICAL_INVENTORY':zeroTime?'EXPLICIT_ZERO_ICE_TIME':'UNKNOWN',shutout:box.shutout!==undefined&&box.shutout!==''?'EXPLICIT_SOURCE_CREDIT':Number(box.goals_against)>0?'POSITIVE_GOALS_AGAINST_EXCLUDES_SHUTOUT':zeroTime?'EXPLICIT_ZERO_ICE_TIME':'UNKNOWN; zero GA does not prove shutout'};
 return{role,stats:normalized.stats,observedPositions:normalized.observedPositions,fieldProvenance};
}
export function buildFutureNhlCompetitiveRecords(input:{game:CanonicalCompetitiveGame;info:SourceRow;skaters:SourceRow[];goalies:SourceRow[];players:ReadonlyMap<string,string>;eventFields:ReadonlyMap<string,NhlExactEventFields>;goalieDecisions?:ReadonlyMap<string,number>;proofs:CompetitiveSourceProof[];validatedAt:string}){
 const game=input.game,row=input.info,all=[...input.skaters,...input.goalies];
 if(game.sport!=='NHL'||game.externalId!==row.game_id||row.game_state!=='OFF'||game.seasonYear!==Number(row.season.slice(0,4))||game.phase!=='REGULAR'||row.game_type!=='R'||game.gameDate!==row.game_date||input.skaters.length<30||input.goalies.length!==4||new Set(all.map(box=>box.player_id)).size!==all.length)throw Error('Future NHL final game/season/phase/box inventory is unresolved.');
 for(const side of ['home','away'] as const){const ids=new Set(all.filter(box=>box.home_away===side).map(box=>box.team_id));if(ids.size!==1||!game.teams.some(team=>team.side===side.toUpperCase()&&ids.has(team.externalId)))throw Error('NHL native participant IDs do not match the canonical V5 game.');}
 const canonicalGoalies=input.goalies.map(box=>input.players.get(box.player_id)),completeCanonicalGoalieInventory=canonicalGoalies.every(Boolean)&&new Set(canonicalGoalies).size===4;
 const holds:CompetitiveHold[]=[],facts=[],provenance=new Map<string,unknown>();
 for(const box of all){const role=input.goalies.includes(box)?'GOALIE' as const:'SKATER' as const,playerId=input.players.get(box.player_id),team=game.teams.find(team=>team.externalId===box.team_id&&team.side===box.home_away.toUpperCase());if(!playerId||!team){holds.push({sourcePlayerId:box.player_id,role,reason:!playerId?'MISSING_CANONICAL_PLAYER':'UNRESOLVED_CANONICAL_PARTICIPANT'});continue;}
  const exact=input.eventFields.get(`${row.game_id}:${box.player_id}`),decision=completeCanonicalGoalieInventory?input.goalieDecisions?.get(box.player_id):undefined,derived=normalizeNhlSourceBox(box,role,exact,decision);
  facts.push({sourcePlayerId:box.player_id,playerId,teamId:team.id,role,stats:derived.stats as StatValues,raw:box,historicalObservedPositions:derived.observedPositions});provenance.set(`${playerId}:${role}`,derived.fieldProvenance);
 }
 const stage=stageCompetitiveRecords({provider:'sportsdataverse-open-data',game,proofs:input.proofs,validatedAt:input.validatedAt,facts,expectedPlayers:all.length,holds,finalSourceRecord:row});
 const sourceFingerprint=fingerprint({version:'direct-nhl-source-v9-1',sourceFingerprint:stage.sourceFingerprint,fieldProvenance:[...provenance].sort(([a],[b])=>a.localeCompare(b))});
 for(const record of stage.records){record.revisionToken=sourceFingerprint;const source=record.normalized.kind==='GAME_STATE'?input.proofs.find(proof=>proof.sourceUrl.includes('game_info_')):record.normalized.kind==='STAT'&&record.normalized.role==='GOALIE'?input.proofs.find(proof=>proof.sourceUrl.includes('goalie_box_')):input.proofs.find(proof=>proof.sourceUrl.includes('skater_box_'));if(!source)throw Error('Each NHL observation needs its exact published source reference.');record.sourceReference=source.sourceUrl;if(record.normalized.kind==='STAT'){const match=/^stat:[^:]+:([^:]+):(.+)$/.exec(record.entityKey)!;record.raw.fieldProvenance=provenance.get(`${match[1]}:${match[2]}`) as Observation['raw'][string];record.raw.derivationVersion='direct-nhl-source-v9-1';record.raw.historicalStatDependency=false;}}
 return{...stage,sourceFingerprint};
}
