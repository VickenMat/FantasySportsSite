import {z} from 'zod';
import {applicableRules,calculateScore,type StatValues} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import type {PreparedHistoricalRow} from './records';
export const historicalNhlOverlaySchema=z.object({sport:z.literal('NHL'),seasonStartYear:z.number().int(),sourceGameId:z.string().regex(/^\d+$/),sourcePlayerId:z.string().regex(/^\d+$/),role:z.enum(['SKATER','GOALIE']),fields:z.record(z.string(),z.number().int().nonnegative().nullable()),proof:z.object({transformVersion:z.literal('m6-nhl-exact-historical-overlay-1'),sourceProofs:z.array(z.object({kind:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),schemaProfile:z.string()}).strict()).length(5)}).catchall(z.json()),sourceKnownAt:z.null(),historicalOnly:z.literal(true)}).strict();
export function enrichHistoricalNhlRow(row:PreparedHistoricalRow,raw:unknown){
 const overlay=historicalNhlOverlaySchema.parse(raw);
 if(!row.valid||row.sport!=='NHL'||row.role!==overlay.role||row.seasonStartYear!==overlay.seasonStartYear||row.sourceGameId!==overlay.sourceGameId||row.sourcePlayerId!==overlay.sourcePlayerId)throw Error('Historical NHL overlay exact canonical tuple differs.');
 if(new Set(overlay.proof.sourceProofs.map(proof=>proof.kind)).size!==5||!['events','goalies','info','scoring','skaters'].every(kind=>overlay.proof.sourceProofs.some(proof=>proof.kind===kind)))throw Error('Historical NHL overlay source proof set differs.');
 const stats=JSON.parse(row.statsJson) as StatValues,allowed=new Set(applicableRules(ubpV9Rules,overlay.role).map(rule=>rule.statKey)),conflicts:string[]=[],applied:string[]=[],provenanceOnly:string[]=[];
 for(const [key,value]of Object.entries(overlay.fields)){
  if((!allowed.has(key)&&!(overlay.role==='GOALIE'&&key==='goals'))||!overlay.proof[key]||typeof overlay.proof[key]!=='object'||Array.isArray(overlay.proof[key]))throw Error('Historical NHL overlay lacks explicit applicable field proof.');
  if(!allowed.has(key)){provenanceOnly.push(key);continue;}
  if(value===null)continue;
  if(stats[key]!==null&&stats[key]!==undefined&&stats[key]!==value)conflicts.push(key);
  else if(stats[key]===null||stats[key]===undefined){stats[key]=value;applied.push(key);}
 }
 const baseline=JSON.parse(row.statsJson) as StatValues,accepted=conflicts.length?baseline:stats,score=calculateScore(ubpV9Rules,{role:overlay.role,stats:accepted,teEligible:false});
 return{...row,enrichedStatsJson:JSON.stringify(accepted),enrichedMissingMask:score.missingStats,enrichedPointsTenths:score.missingStats.length?null:score.totalTenths,enrichmentConflictFields:conflicts.sort(),enrichmentProvenanceOnlyFields:provenanceOnly.sort(),enrichmentAppliedFields:conflicts.length?[]:applied.sort(),enrichmentStatus:conflicts.length?'QUARANTINED_SOURCE_CONTRADICTION':applied.length?'EXACT_MISSING_FIELDS_SUPPLEMENTED':'NO_NEW_FIELDS',enrichmentProofJson:JSON.stringify(overlay)};
}
