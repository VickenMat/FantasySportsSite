import type { Prisma } from '@/generated/prisma/client';
import type { Sport } from '@/generated/prisma/enums';
import { playerSnapshotSchema, mapProfessionalSnapshotPosition, mapInjurySnapshot } from '@/positions/player-snapshot-policy';
import { resolveProfessionalPlayer } from './identity-resolutions';
import { resolveProfessionalTeam } from './professional-identities';
import { recordAvailabilityEvidence } from '@/server/lineup-snapshots';
import { recordRookieEligibility } from '@/server/rookies';
import { permitsObservedEvidence, observedPolicyAdoptedAt } from './evidence-policy';
export { playerSnapshotSchema } from '@/positions/player-snapshot-policy';
type Envelope={provider:string;sport:Sport;entityKey:string;observedAt:string;effectiveAt:string|null;publishedAt:string|null;revisionOrdinal:number|null;sourceReference:string;raw:Prisma.InputJsonObject;normalized:unknown};
/** Source snapshots keep exact professional effective/publication fields unknown. */
export async function promotePlayerSnapshot(tx:Prisma.TransactionClient,input:Envelope,observationId:string,processedAt=new Date()){
 const n=playerSnapshotSchema.parse(input.normalized), pending=(reason:string)=>({outcome:'PENDING_DATA' as const,reason,targets:{}}), reject=(reason:string)=>({outcome:'QUARANTINED' as const,reason,targets:{}});
 const approvedRecoveryScope=input.provider==='reviewed-recovered-mlb-positions'&&input.sport==='MLB'&&n.facet.type==='POSITION_AGGREGATE';
 if((!approvedRecoveryScope&&!permitsObservedEvidence(input.provider))||+new Date(n.policyAdoptedAt)!==+observedPolicyAdoptedAt)return reject('Observed source or policy-adoption floor is not approved.');
 if(input.effectiveAt!==null||input.publishedAt!==null)return reject('Snapshot policy cannot relabel an operational instant as exact source effect/publication.');
 if(input.revisionOrdinal===null)return pending('Source snapshot revisions require explicit trusted ordering.');
 if(+new Date(n.firstObservedAt)>+new Date(input.observedAt)||processedAt<new Date(input.observedAt))return reject('Snapshot observation/processing chronology is reversed.');
 if(input.entityKey!==`player-snapshot:${n.player.provider}:${n.player.externalId}:${n.seasonStartYear}:${n.facet.type}${n.facet.type==='POSITION_AGGREGATE'?':'+n.facet.code+':'+n.facet.evidenceSeasonStartYear:''}`)return reject('Use the stable player-season-facet snapshot stream.');
 const mapping=await resolveProfessionalPlayer(tx,input.sport,n.player,new Date(input.observedAt));if(!mapping)return pending('Snapshot requires an explicit canonical player bridge.');
 const season=await tx.season.findUnique({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}}});if(!season)return pending('Snapshot requires an existing canonical target sport-season.');
 const effectiveAt=new Date(Math.max(+new Date(n.validFrom),+new Date(n.firstObservedAt),+new Date(n.policyAdoptedAt),+processedAt));
 if(n.validUntil&&+new Date(n.validUntil)<=+effectiveAt)return pending('Snapshot expired before this prospective application.');
 const targets={playerId:mapping.playerId,seasonId:season.id,operationalEffectiveAt:effectiveAt.toISOString(),firstObservedAt:n.firstObservedAt,exactEffectiveAt:null,officialPublishedAt:null,policyVersion:n.policyVersion};
 const sourceRecord={observationId,sourceReference:input.sourceReference,sourceFingerprint:n.sourceFingerprint,sourceRecordId:n.sourceRecordId,sourceSnapshotDate:n.sourceSnapshotDate,sourceDatePrecision:n.sourceDatePrecision,firstObservedAt:n.firstObservedAt,operationalEffectiveAt:effectiveAt.toISOString(),actualEffectiveAt:null,officialPublishedAt:null,policyVersion:n.policyVersion,retracted:n.retracted,raw:input.raw};
 if(n.facet.type==='POSITION'){
  if(!['NFL','NHL'].includes(input.sport))return reject('NBA uses its dedicated granular/family precedence policy; MLB uses explicit count evidence.');
  const mapped=mapProfessionalSnapshotPosition(input.sport,n.facet.sourcePosition);
  if(mapped.professionalPosition!==n.facet.professionalPosition||JSON.stringify(mapped.fantasyPositions)!==JSON.stringify(n.facet.fantasyPositions))return reject('Professional/fantasy position mapping differs from approved sport semantics.');
  return{outcome:'ACCEPTED' as const,reason:'Prospective explicit professional position retained separately from historical observations and exact source instants.',targets:{...targets,positions:n.retracted?[]:mapped.fantasyPositions,professionalPosition:mapped.professionalPosition}};
 }
 if(n.facet.type==='POSITION_AGGREGATE'){
  if(input.sport!=='MLB')return reject('Independent historical count carry is MLB-only.');
  return{outcome:'ACCEPTED' as const,reason:'Reviewed independent source threshold supports prospective current/following-year eligibility; no invented games or LISTED designation.',targets:{...targets,code:n.facet.code,evidenceSeasonStartYear:n.facet.evidenceSeasonStartYear}};
 }
 if(n.facet.type==='TEAM_ASSIGNMENT'){
  const team=await resolveProfessionalTeam(tx,input.sport,n.facet.team);if(!team)return pending('Professional team snapshot needs an explicit canonical team reference.');
  return{outcome:'ACCEPTED' as const,reason:'Prospective observed professional team association; fantasy ownership unchanged.',targets:{...targets,teamId:n.retracted?null:team.id,assignment:n.retracted?'UNKNOWN':'ROSTERED'}};
 }
 if(n.facet.type==='ROOKIE'){
  if(input.sport!=='NFL'||n.facet.sourceYear>n.seasonStartYear||n.facet.eligible!==(n.facet.sourceYear===n.seasonStartYear))return reject('Rookie snapshot requires explicit valid NFL rookie_year, never age/experience/absence.');
  const row=await recordRookieEligibility({playerId:mapping.playerId,seasonId:season.id,sport:input.sport,eligible:!n.retracted&&n.facet.eligible,effectiveAt,knownAt:effectiveAt,provider:input.provider,externalId:observationId,sourceRecord},tx);
  return{outcome:'ACCEPTED' as const,reason:'Explicit NFL rookie-year classification applied prospectively.',targets:{...targets,evidenceId:row.id}};
 }
 if(n.facet.sourceType==='EXPLICIT_NFL_ROSTER_RETIREMENT'){
  if(input.sport!=='NFL'||n.facet.sourceStatus!=='RET'||n.facet.designation!=='RETIRED'||n.facet.irEligible)return reject('Retirement requires the explicit professional RET designation; it never grants IR.');
 }else{
  const mapped=mapInjurySnapshot(input.sport,n.facet.sourceStatus,n.facet.sourceType);
  if(mapped.conflict||mapped.designation!==n.facet.designation||mapped.irEligible!==n.facet.irEligible)return reject('Normalized availability differs from the explicit typed source designation and approved sport IR rules.');
 }
 if(n.facet.irEligible&&!(n.facet.designation==='INJURED_RESERVE'||input.sport==='NFL'&&['OUT','SUSPENDED'].includes(n.facet.designation)))return reject('IR eligibility mapping exceeds the confirmed sport-specific rules.');
 const row=await recordAvailabilityEvidence({playerId:mapping.playerId,designation:n.retracted?'UNKNOWN':n.facet.designation,irEligible:!n.retracted&&n.facet.irEligible,effectiveAt,knownAt:effectiveAt,expiresAt:n.validUntil?new Date(n.validUntil):null,provider:input.provider,externalId:observationId,sourceRecord},tx);
 return{outcome:'ACCEPTED' as const,reason:'Explicit source availability snapshot applied prospectively without health-by-absence inference or ownership removal.',targets:{...targets,evidenceId:row.id}};
}
