import type {Sport,GameStatRole} from '@/generated/prisma/enums';
import {normalizeHistoricalRow,type RawRow} from '@/imports/normalize';
import {participationEvidence} from '@/scoring/participation';
import {calculateScore} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {fingerprint} from '@/ingestion/contracts';
import {normalizeNbaPosition} from '@/positions/nba-policy';
export const historicalPreparationVersion='m6-historical-preparation-1';
export type PreparedHistoricalRow={sport:Sport;seasonStartYear:number;sourceRow:number;sourceRowFingerprint:string;sourcePlayerId:string|null;sourceGameId:string|null;canonicalPlayerKey:string|null;canonicalGameKey:string|null;playerGameKey:string|null;role:GameStatRole|null;teamId:string|null;gameDate:string|null;phase:string|null;week:number|null;valid:boolean;quarantineReason:string|null;statsJson:string;missingMask:string[];baselinePointsTenths:number|null;participation:string;participationReason:string;positions:string[];positionClass:string;roleSelection:string;selectedRole:boolean;historicalKnownAt:null;leakageFlags:string[];roleEvidenceJson:string;positionProvenanceJson:string};
export type PositionContext={positions:string[];classification:'EXPLICIT_GRANULAR'|'FAMILY_DERIVED'|'HISTORICAL_ESTIMATED'|'UNKNOWN'|'RECORDED_THRESHOLD_RETROSPECTIVE';provenance:unknown};
export function historicalNbaPosition(source:string,estimated=false):PositionContext{const mapped=normalizeNbaPosition(source);return{positions:mapped.positions,classification:estimated&&mapped.positions.length?'HISTORICAL_ESTIMATED':mapped.classification==='EXPLICIT'?'EXPLICIT_GRANULAR':mapped.classification==='FAMILY_DERIVED'?'FAMILY_DERIVED':'UNKNOWN',provenance:{sourcePosition:source,estimated,knownAt:null,currentEligibility:false}};}
export function prepareHistoricalRow(sport:Sport,raw:RawRow,line:number,position?:PositionContext):PreparedHistoricalRow{
 const common={sport,seasonStartYear:Number((raw.SEASON_YEAR??raw.season??'').slice(0,4)),sourceRow:line,sourceRowFingerprint:fingerprint(raw),sourcePlayerId:raw.PLAYER_ID||raw.player_id||null,sourceGameId:raw.GAME_ID||raw.game_id||null,historicalKnownAt:null,leakageFlags:['HISTORICAL_PUBLICATION_UNKNOWN','PRESEASON_DISCOVERY_UNKNOWN','INJURY_CHRONOLOGY_UNKNOWN'],positionProvenanceJson:JSON.stringify(position?.provenance??null)};
 try{
  const n=normalizeHistoricalRow(sport,raw,line),positions=position?.positions??n.observedPositions,participation=participationEvidence({role:n.role,provider:'v9-historical',normalized:n.stats,raw:{original:raw},terminal:true}),score=calculateScore(ubpV9Rules,{role:n.role,stats:n.stats,teEligible:sport==='NFL'?(positions.length?positions.includes('TE'):null):false});
  const evidence={gamesStarted:raw.gamesStarted||null,gamesPitched:raw.gamesPitched||null,gamesPlayed:raw.gamesPlayed||null,plateAppearances:raw.plateAppearances||null,atBats:raw.atBats||null,pitchesThrown:raw.pitchesThrown||null,battersFaced:raw.battersFaced||null};
  const unsupported=sport==='NFL'&&!positions.some(code=>['QB','RB','FB','WR','TE'].includes(code));
  return{...common,seasonStartYear:n.season.startYear,sourcePlayerId:n.player.externalId,sourceGameId:n.game.externalId,canonicalPlayerKey:`${sport}:v9-historical:${n.player.externalId}`,canonicalGameKey:`${sport}:archive:${n.game.externalId}`,playerGameKey:`${sport}:${n.season.startYear}:${n.game.externalId}:${n.player.externalId}`,role:n.role,teamId:n.team.externalId,gameDate:n.game.gameDate?.toISOString().slice(0,10)??null,phase:n.game.phase,week:n.game.week,valid:true,quarantineReason:null,statsJson:JSON.stringify(n.stats),missingMask:score.missingStats,baselinePointsTenths:score.missingStats.length?null:score.totalTenths,participation:participation.status,participationReason:participation.reason,positions,positionClass:position?.classification??(positions.length?'HISTORICAL_OBSERVED':'UNKNOWN'),roleSelection:unsupported?'UNSUPPORTED_PROFESSIONAL_ROLE':'SINGLE_ROLE',selectedRole:!unsupported&&participation.status!=='DID_NOT_PLAY',roleEvidenceJson:JSON.stringify(evidence),leakageFlags:[...common.leakageFlags,...(positions.length?['POSITION_EFFECTIVE_TIME_UNKNOWN']:[]),...(sport==='NFL'?['GAME_DATE_ABSENT_IN_ARCHIVE']:[])]};
 }catch(error){return{...common,canonicalPlayerKey:null,canonicalGameKey:null,playerGameKey:null,role:null,teamId:null,gameDate:null,phase:null,week:null,valid:false,quarantineReason:error instanceof Error?error.message:'Invalid source row',statsJson:'{}',missingMask:[],baselinePointsTenths:null,participation:'UNKNOWN',participationReason:'QUARANTINED_SOURCE_ROW',positions:[],positionClass:'UNKNOWN',roleSelection:'QUARANTINED',selectedRole:false,roleEvidenceJson:'{}'};}
}
const integer=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim()!==''&&/^\d+(?:\.0+)?$/.test(String(value))?Number(value):null;
/** Fixed approved priority uses recorded participation, never realized points. */
export function resolveHistoricalMlbRoles(rows:PreparedHistoricalRow[]){
 if(rows.some(row=>row.sport!=='MLB')||new Set(rows.map(row=>row.playerGameKey)).size!==1)throw Error('MLB role resolution requires one canonical player-game.');
 const grouped=new Map<GameStatRole,PreparedHistoricalRow[]>();for(const row of rows)if(row.role)grouped.set(row.role,[...(grouped.get(row.role)??[]),row]);
 for(const list of grouped.values())if(list.length>1){const signatures=new Set(list.map(row=>fingerprint({stats:JSON.parse(row.statsJson),team:row.teamId,participation:row.participation,evidence:JSON.parse(row.roleEvidenceJson)})));for(const row of rows){row.selectedRole=false;row.roleSelection=signatures.size===1?'DUPLICATE':'SOURCE_CONTRADICTION';}return rows;}
 const hitter=grouped.get('HITTER')?.[0],pitcher=grouped.get('PITCHER')?.[0];if(!hitter||!pitcher)return rows;
 const h=JSON.parse(hitter.roleEvidenceJson),noBattingPlaceholder=integer(h.plateAppearances)===0&&integer(h.atBats)===0&&Object.values(JSON.parse(hitter.statsJson)).every(value=>value===0),p=JSON.parse(pitcher.roleEvidenceJson),starts=integer(p.gamesStarted),bats=(integer(h.plateAppearances)??0)>0||(integer(h.atBats)??0)>0;
 let chosen:GameStatRole|null=null,classification='MISSING_PARTICIPATION_EVIDENCE';
 if(rows.some(row=>row.participationReason.includes('CONFLICT')))classification='SOURCE_CONTRADICTION';
 else if(starts!==null&&starts>1)classification='SOURCE_CONTRADICTION';
 else if(starts===1&&pitcher.participation==='PLAYED'){chosen='PITCHER';classification='VERIFIED_PITCHER';}
 else if(bats&&starts===0){chosen='HITTER';classification='VERIFIED_HITTER';}
 else if(bats&&pitcher.participation==='DID_NOT_PLAY'){chosen='HITTER';classification='VERIFIED_HITTER';}
 else if(pitcher.participation==='PLAYED'&&noBattingPlaceholder){chosen='PITCHER';classification='VERIFIED_PITCHER';hitter.roleEvidenceJson=JSON.stringify({...h,rolePlaceholder:'EXPLICIT_ZERO_PA_AB_AND_ALL_HITTER_SCORING_INPUTS'});}
 else if(pitcher.participation==='PLAYED'&&hitter.participation==='DID_NOT_PLAY'){chosen='PITCHER';classification='VERIFIED_PITCHER';}
 else if(hitter.participation==='DID_NOT_PLAY'&&pitcher.participation==='DID_NOT_PLAY')classification='NON_PLAYING_PLACEHOLDER';
 else if(bats&&pitcher.participation==='PLAYED')classification='GENUINE_UNRESOLVED_ROLE_AMBIGUITY';
 for(const row of rows){row.roleSelection=classification;row.selectedRole=row.role===chosen;}return rows;
}
export type HistoricalDecisionContext={decisionAt:string;knownAt:string|null;sourceKind:'PRIOR_SEASON'|'IN_SEASON'|'RETROSPECTIVE_ESTIMATE';effectiveAt:string|null};
export function permitsHistoricalDecisionEvidence(input:HistoricalDecisionContext){return input.sourceKind!=='RETROSPECTIVE_ESTIMATE'&&input.knownAt!==null&&input.effectiveAt!==null&&Number.isFinite(Date.parse(input.decisionAt))&&Date.parse(input.knownAt)<=Date.parse(input.decisionAt)&&Date.parse(input.effectiveAt)<=Date.parse(input.decisionAt);}
