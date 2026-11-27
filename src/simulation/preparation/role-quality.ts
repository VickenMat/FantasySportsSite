import {applicableRules,type StatValues} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {fingerprint} from '@/ingestion/contracts';
import type {PreparedHistoricalRow} from './records';
/** A role-level source-quality classification, never a production role selection
 * or a claim that an athlete physically did not participate. */
export function reviewRecordedRolelessMlbAppearance(rows:readonly PreparedHistoricalRow[]){
 if(rows.length!==2||rows.some(row=>!row.valid||row.sport!=='MLB')||new Set(rows.map(row=>row.playerGameKey)).size!==1)throw Error('Expected one exact two-role MLB source tuple.');
 const hitter=rows.find(row=>row.role==='HITTER'),pitcher=rows.find(row=>row.role==='PITCHER');if(!hitter||!pitcher)throw Error('Both explicit source role records are required.');
 const h=JSON.parse(hitter.roleEvidenceJson),p=JSON.parse(pitcher.roleEvidenceJson),zero=(value:unknown)=>value!==null&&value!==undefined&&/^0(?:\.0+)?$/.test(String(value));
 for(const row of rows){const stats=JSON.parse(row.statsJson) as StatValues;const keys=applicableRules(ubpV9Rules,row.role!).map(rule=>rule.statKey==='pitching_innings'?'pitching_outs':rule.statKey);if(keys.some(key=>stats[key]!==0))throw Error('Every applicable recorded V9 input must be explicitly known zero.');}
 if(!zero(h.plateAppearances)||!zero(h.atBats)||!zero(p.gamesPitched)||hitter.participation!=='PLAYED'||pitcher.participation!=='DID_NOT_PLAY')throw Error('Explicit role-quality evidence is missing or contradictory.');
 return{version:'m6-recorded-role-quality-review-1' as const,playerGameKey:hitter.playerGameKey!,seasonStartYear:hitter.seasonStartYear,sourceGameId:hitter.sourceGameId!,sourcePlayerId:hitter.sourcePlayerId!,classification:'ROLE_LEVEL_NON_PLAYING_PLACEHOLDER' as const,reason:'NO_ACTIVE_SCORING_ROLE_IN_RECORDED_ROWS' as const,athleteParticipation:'PLAYED' as const,selectedRole:null,knownRecordedInputsAllZero:true,diagnosticRecordedInputTotalTenths:0,actualScoringMaterialized:false,sourceKnownAt:null,physicalRoleAbsenceAsserted:false,productionRoleResolution:false,sourceRows:rows.map(row=>({role:row.role,sourceRow:row.sourceRow,sourceRowFingerprint:row.sourceRowFingerprint,statsFingerprint:fingerprint(JSON.parse(row.statsJson)),roleEvidence:JSON.parse(row.roleEvidenceJson)})).sort((a,b)=>a.role!.localeCompare(b.role!))};
}
