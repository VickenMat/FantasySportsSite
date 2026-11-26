import{resolveProfessionalGame,resolveProfessionalTeam}from"./professional-identities";
import type{Prisma}from"@/generated/prisma/client";
import type{Observation}from"./contracts";
import{recordAvailabilityEvidence}from"@/server/lineup-snapshots";
import{recordRookieEligibility}from"@/server/rookies";
import{recordGameCompletionEvidence}from"@/server/waiver-holds";
import{resolveProfessionalPlayer}from'./identity-resolutions';
type Tx=Prisma.TransactionClient;
type LifecycleObservation=Observation&{normalized:Extract<Observation["normalized"],{kind:"AVAILABILITY"|"ROOKIE"|"GAME_COMPLETION"|"TEAM_ASSIGNMENT"}>};
export async function promoteLifecycle(tx:Tx,input:LifecycleObservation,observationId:string){
 const n=input.normalized;
 const pending=(reason:string)=>({outcome:"PENDING_DATA" as const,reason,targets:{}});
 const quarantine=(reason:string)=>({outcome:"QUARANTINED" as const,reason,targets:{}});
 if(!input.publishedAt||!input.effectiveAt)return pending("Lifecycle evidence requires explicit source publication and effective timestamps; observation time is not a substitute.");
 const knownAt=new Date(input.publishedAt),effectiveAt=new Date(input.effectiveAt);
 if(knownAt<effectiveAt)return quarantine("Source evidence cannot be known before it became effective.");
 const sourceRecord={observationId,sourceReference:input.sourceReference,observedAt:input.observedAt,raw:input.raw};
 if(n.kind==="GAME_COMPLETION"){
  const game=await resolveProfessionalGame(tx,input.sport,n.game);
  if(!game)return pending("Completion requires an explicitly mapped canonical game.");
  const completedAt=new Date(n.completedAt);
  if(completedAt>knownAt||completedAt>effectiveAt)return quarantine("Completion instant must precede its source publication/effective instant.");
  const previous=await tx.gameCompletionEvidence.findMany({where:{gameId:game.id}});
  if(previous.some(row=>row.completedAt.getTime()!==completedAt.getTime()))return quarantine("Conflicting completion instant requires reviewed correction resolution; existing waiver holds are not silently shortened.");
  const evidence=await recordGameCompletionEvidence({gameId:game.id,provider:input.provider,externalId:observationId,completedAt,knownAt,sourceRecord},tx);
  return{outcome:"ACCEPTED" as const,reason:"Explicit completion instant recorded; final status and fetch time were not used as substitutes.",targets:{gameId:game.id,evidenceId:evidence.id}};
 }
 const mapping=await resolveProfessionalPlayer(tx,input.sport,n.player,new Date(input.observedAt));
 if(!mapping)return pending("Lifecycle evidence requires an explicit canonical player identifier.");
 if(n.kind==="TEAM_ASSIGNMENT"){
  if((n.assignment==="ROSTERED")!==Boolean(n.team))return quarantine("Team assignment status and explicit team reference disagree.");
  const season=await tx.season.findUnique({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}}});
  if(!season)return pending("Team assignment requires an existing canonical sport-season.");
  const team=n.team?await resolveProfessionalTeam(tx,input.sport,n.team):null;
  if(n.team&&!team)return pending("Team history requires an explicit canonical professional team; names cannot invent a mapping.");
  return{outcome:"ACCEPTED" as const,reason:"Immutable professional team history recorded; fantasy ownership is unchanged.",targets:{playerId:mapping.playerId,seasonId:season.id,teamId:team?.id??null}};
 }
 if(n.kind==="ROOKIE"){
  const season=await tx.season.findUnique({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}}});
  if(!season)return pending("Rookie classification requires an existing canonical season.");
  const evidence=await recordRookieEligibility({playerId:mapping.playerId,seasonId:season.id,sport:input.sport,eligible:n.eligible,effectiveAt,knownAt,provider:input.provider,externalId:observationId,sourceRecord:{...sourceRecord,classificationBasis:n.classificationBasis}},tx);
  return{outcome:"ACCEPTED" as const,reason:"Explicit rookie classification recorded without inferring from age, experience or missing history.",targets:{playerId:mapping.playerId,evidenceId:evidence.id}};
 }
 if(n.designation==="UNKNOWN"&&n.irEligible)return quarantine("Unknown availability cannot grant IR eligibility.");
 const expiresAt=n.expiresAt?new Date(n.expiresAt):null;
 if(expiresAt&&expiresAt<=effectiveAt)return quarantine("Availability expires before it becomes effective.");
 const game=n.game?await resolveProfessionalGame(tx,input.sport,n.game):null;
 if(n.game&&!game)return pending("Availability references an unmapped canonical game.");
 const evidence=await recordAvailabilityEvidence({playerId:mapping.playerId,gameId:game?.id??null,designation:n.designation,irEligible:n.irEligible,effectiveAt,knownAt,expiresAt,provider:input.provider,externalId:observationId,sourceRecord},tx);
 return{outcome:"ACCEPTED" as const,reason:"Source availability recorded without changing fantasy ownership or automatically removing retired players.",targets:{playerId:mapping.playerId,evidenceId:evidence.id}};
}
