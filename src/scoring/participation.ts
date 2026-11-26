import type { GameStatRole } from '@/generated/prisma/enums';
import { applicableRules, type StatValues } from './engine';
import { ubpV9Rules } from './ubp-v9';
import { historicalStatsForScoring } from './historical-evidence';

export type ParticipationEvidence = { status: 'PLAYED' | 'DID_NOT_PLAY' | 'UNKNOWN'; reason: string };
export type ParticipationInput = { role: GameStatRole; provider?: string; normalized?: StatValues; raw?: unknown; terminal?: boolean };
const activityKeys = new Map((['FOOTBALL','HITTER','PITCHER','BASKETBALL','SKATER','GOALIE'] as const).map(role=>[role,new Set(applicableRules(ubpV9Rules,role).map(rule=>rule.statKey==='pitching_innings'?'pitching_outs':rule.statKey==='tight_end_reception_bonus'?'receptions':rule.statKey))]));
const rawActivityKeys:Record<GameStatRole,readonly string[]>={FOOTBALL:['attempts','completions','carries','targets','receptions','special_teams_tds','offense_snaps','defense_snaps','special_teams_snaps'],HITTER:['plateAppearances','atBats','hits','runs','stolenBases','hitByPitch'],PITCHER:['gamesStarted','pitchesThrown','battersFaced','outs','strikeOuts','baseOnBalls','hits','runs','earnedRuns'],BASKETBALL:['PTS','REB','OREB','DREB','AST','STL','BLK','TOV','FGA','FGM','FTA','FTM'],SKATER:['goals','assists','sog','hits','blockedShots','shifts','faceoff_wins','shorthanded_points_bonus'],GOALIE:['goals','assists','saves','goalsAgainst','goalie_win']};
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null; }
function count(value: unknown) { if (value == null || String(value).trim() === '') return null; const number=Number(value);return Number.isFinite(number)&&number>=0?number:null; }
function duration(value: unknown) {
  if (value == null || String(value).trim() === '') return null;
  const text=String(value).trim(),clock=/^(\d{1,3}):([0-5]\d)(?:\.\d+)?$/.exec(text);
  return clock ? Number(clock[1])*60+Number(clock[2]) : count(value);
}
function original(raw:unknown) { let value=record(raw);for(let depth=0;depth<10&&record(value?.original);depth++)value=record(value!.original);return value??{}; }
export function referencedHistoricalStatId(raw:unknown) { const value=original(raw);return typeof value.historicalStatId==='string'?value.historicalStatId:null; }

/** Game-level positive activity proves participation; a final explicit zero proves DNP.
 * Profile age/status, roster membership, missing fields and fantasy totals are not proof.
 */
export function participationEvidence(input: ParticipationInput): ParticipationEvidence {
  const wrapper=record(input.raw),row=original(input.raw),professional=record(wrapper?.professionalObservation);
  const terminal=input.terminal??(input.provider==='v9-historical'||professional?.phase==='FINAL');
  // Reuse the scoring evidence guard for the preserved unsupported legacy credits.
  const normalized=historicalStatsForScoring({...input,provider:input.provider??'',normalized:input.normalized??{},raw:input.raw});
  const activity=Object.entries(normalized).some(([key,value])=>activityKeys.get(input.role)?.has(key)&&typeof value==='number'&&Number.isFinite(value)&&value!==0);
  let explicit:number|null=null,positive=activity||rawActivityKeys[input.role].some(key=>(count(row[key])??0)>0)||input.role==='GOALIE'&&(count(row.shutout)===1||['W','L','O'].includes(String(row.decision))),dnpText=false;
  if(input.role==='GOALIE'||input.role==='SKATER')explicit=duration(row.toi);
  else if(input.role==='BASKETBALL') { explicit=duration(row.MIN);dnpText=['DNP','DND'].includes(String(row.MIN??'').trim().toUpperCase()); }
  else if(input.role==='HITTER') { explicit=count(row.gamesPlayed);positive ||= (count(row.plateAppearances)??0)>0; }
  else if(input.role==='PITCHER') { explicit=count(row.gamesPitched);positive ||= (count(row.gamesStarted)??0)>0; }
  else {
    explicit=count(row.gamesPlayed);
    positive ||= Object.entries(row).some(([key,value])=>key.startsWith('def_')&&(count(value)??0)>0);
  }
  if((explicit===0||dnpText)&&positive)return{status:'UNKNOWN',reason:'CONFLICTING_ZERO_TIME_OR_GAMES_AND_RECORDED_ACTIVITY'};
  if(explicit!==null&&explicit>0||positive)return{status:'PLAYED',reason:explicit!==null&&explicit>0?'EXPLICIT_POSITIVE_TIME_OR_GAMES':'RECORDED_GAME_ACTIVITY'};
  if((explicit===0||dnpText)&&terminal)return{status:'DID_NOT_PLAY',reason:'FINAL_EXPLICIT_ZERO_TIME_OR_GAMES'};
  return{status:'UNKNOWN',reason:explicit===0||dnpText?'ZERO_IN_UNFINISHED_SNAPSHOT':'PARTICIPATION_EVIDENCE_MISSING'};
}

/** Hitter DNP and pitcher participation may coexist; conflicting same-role sources cannot. */
export function combineParticipationEvidence(inputs:readonly ParticipationInput[]):ParticipationEvidence {
  const groups=new Map<GameStatRole,ParticipationEvidence[]>();
  for(const input of inputs)groups.set(input.role,[...(groups.get(input.role)??[]),participationEvidence(input)]);
  const roles=[];
  for(const values of groups.values()){
    if(values.some(value=>value.reason==='CONFLICTING_ZERO_TIME_OR_GAMES_AND_RECORDED_ACTIVITY')||values.some(value=>value.status==='PLAYED')&&values.some(value=>value.status==='DID_NOT_PLAY'))return{status:'UNKNOWN',reason:'CONFLICTING_PARTICIPATION_SOURCES'};
    roles.push(values.some(value=>value.status==='PLAYED')?'PLAYED':values.some(value=>value.status==='DID_NOT_PLAY')?'DID_NOT_PLAY':'UNKNOWN');
  }
  return roles.includes('PLAYED')?{status:'PLAYED',reason:'RECORDED_ACTIVITY_IN_ONE_SCORING_ROLE'}:roles.length&&roles.every(value=>value==='DID_NOT_PLAY')?{status:'DID_NOT_PLAY',reason:'FINAL_EXPLICIT_ZERO_IN_ALL_ROLES'}:{status:'UNKNOWN',reason:'PARTICIPATION_EVIDENCE_MISSING'};
}
