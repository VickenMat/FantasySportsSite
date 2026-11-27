import { invalidateCorrectionAnchor } from '@/server/publication-anchors';
import { permitsObservedEvidence } from './evidence-policy';
import type { Prisma } from '@/generated/prisma/client';
import type { Observation } from './contracts';
import { resolveProfessionalGame } from './professional-identities';
import { operationalGameClock, operationalEventPolicy, type OperationalGameClock, type OperationalGameClaim } from './operational-game-events';
import { fingerprint } from './contracts';

type State=Observation&{normalized:Extract<Observation['normalized'],{kind:'GAME_STATE'}>&Omit<OperationalGameClaim,'observedAt'>};
export async function promoteObservedGameState(tx:Prisma.TransactionClient,input:State,observationId:string){
 const n=input.normalized;
 const pending=(reason:string)=>({outcome:'PENDING_DATA' as const,reason,targets:{}});
 const reject=(reason:string)=>({outcome:'QUARANTINED' as const,reason,targets:{}});
 const game=await resolveProfessionalGame(tx,input.sport,n.game);
 if(!game)return pending('Observed event evidence requires an explicitly identified canonical game.');
 if(input.entityKey!==`game-state:${game.id}`)return reject('Observed game state requires its canonical stream key.');
 // Permission is established by the permitted publisher registry, not by a raw claim.
 if(!permitsObservedEvidence(input.provider))return pending('Observed events require a permitted publisher; fixture evidence is isolated only.');
 const previous=await tx.professionalDataObservation.findMany({where:{sport:input.sport,category:'GAME_STATE',entityKey:input.entityKey,observedAt:{lte:new Date(input.observedAt)},id:{not:observationId}},include:{decisions:{orderBy:{version:'desc'},take:1}},orderBy:{observedAt:'asc'}});
 const accepted=previous.filter(row=>row.decisions[0]?.outcome==='ACCEPTED');
 let clock:OperationalGameClock|undefined;
 for(const row of accepted){const target=row.decisions[0].targets as {operationalClock?:OperationalGameClock};if(target.operationalClock){if(!clock)clock=target.operationalClock;else clock={...target.operationalClock,started:clock.started||target.operationalClock.started,operationalLockAt:clock.started&&clock.operationalLockAt&&target.operationalClock.operationalLockAt?new Date(Math.min(Date.parse(clock.operationalLockAt),Date.parse(target.operationalClock.operationalLockAt))).toISOString():target.operationalClock.operationalLockAt};}}
 if(!clock){const started=accepted.map(row=>row.normalized as OperationalGameClaim).filter(row=>row.actualStartsAt||['LIVE','SUSPENDED','FINAL'].includes(row.status));if(started.length){const boundaries=started.flatMap(row=>[row.actualStartsAt,row.scheduledStartsAt]).filter((value):value is string=>Boolean(value)).sort((a,b)=>Date.parse(a)-Date.parse(b));clock={started:true,operationalLockAt:boundaries[0]??game.startsAt?.toISOString()??null,operationalCompletedAt:null,lockPrecision:'SCHEDULED_FALLBACK',completionPrecision:null,actualStartsAt:started.find(row=>row.actualStartsAt)?.actualStartsAt??null,actualCompletedAt:null};}}
 let next:OperationalGameClock;
 try{next=operationalGameClock({...n,observedAt:input.observedAt,scheduledStartsAt:n.scheduledStartsAt??game.startsAt?.toISOString()??null},clock);}catch(error){return reject(error instanceof Error?error.message:'Invalid operational game evidence.');}
 const latestOthers=new Map<string,typeof accepted[number]>();for(const row of accepted)if(row.provider!==input.provider)latestOthers.set(row.provider,row);
 const conflicting=[...latestOthers.values()].some(row=>(row.normalized as {status:string}).status!==n.status);
 const existingCompletions=await tx.gameCompletionEvidence.findMany({where:{gameId:game.id,knownAt:{lte:new Date(input.observedAt)}},orderBy:{completedAt:'desc'}});
 const knownExact=existingCompletions.filter(row=>row.provider!=='conservative-event-policy'||(row.sourceRecord as {precision?:string}).precision==='EXACT_VERIFIED');
 const correctionPending=new Set(knownExact.map(row=>row.completedAt.getTime())).size>1||Boolean(next.completionReviewPending)||Boolean(n.completedAt&&knownExact.some(row=>row.completedAt.getTime()!==Date.parse(n.completedAt!)))||Boolean(n.completedAt&&clock?.completionPrecision==='OBSERVED_FINAL'&&clock.operationalCompletedAt&&Date.parse(n.completedAt)>Date.parse(clock.operationalCompletedAt));
 next.completionReviewPending=correctionPending;
 const completionPending=correctionPending;
 if(n.status==='FINAL'&&conflicting){next.operationalCompletedAt=clock?.operationalCompletedAt??null;next.completionPrecision=clock?.completionPrecision??null;}
 const impactedSnapshots=next.operationalLockAt?await tx.gameLineupSnapshot.findMany({where:{gameId:game.id,lockedAt:{not:new Date(next.operationalLockAt)}},select:{id:true}}):[];
 const earlier=next.started&&next.operationalLockAt&&(!clock?.operationalLockAt||Date.parse(next.operationalLockAt)<Date.parse(clock.operationalLockAt));
 const leagues=await tx.competitionPeriodGame.findMany({where:{gameId:game.id},select:{sportCompetition:{select:{leagueId:true}}}});
 const inspectAssignments=earlier||Boolean(next.started&&!clock?.started)||Boolean(n.actualStartsAt&&clock?.actualStartsAt!==n.actualStartsAt);
 const impactedAssignments=inspectAssignments&&next.operationalLockAt?await tx.rosterAssignmentEvent.findMany({where:{leagueId:{in:leagues.map(row=>row.sportCompetition.leagueId)},effectiveAt:{gte:new Date(next.operationalLockAt),lte:new Date(n.completedAt??input.observedAt)},rosterEntry:{player:{OR:[{gameStats:{some:{gameId:game.id}}},{availabilityEvidence:{some:{gameId:game.id}}}]}}},select:{id:true}}):[];
 const lockReviewPending=impactedSnapshots.length>0||impactedAssignments.length>0;
 let completionEvidenceId:string|null=null;
 if(n.status==='FINAL'&&!completionPending&&!conflicting&&next.operationalCompletedAt){
  // All publishers share one immutable first observation key. Exact later facts may
  // append a longer safe boundary, but routine refreshes never start a new clock.
  const prior=existingCompletions[0];
  const candidate=knownExact.length&&!n.completedAt&&!n.completionBounds?knownExact[0].completedAt.getTime():Date.parse(next.operationalCompletedAt);
  const boundary=new Date(Math.max(candidate,prior?.completedAt.getTime()??0));
  next.operationalCompletedAt=boundary.toISOString();
  if(knownExact.length&&!n.completedAt&&!n.completionBounds&&boundary.getTime()===knownExact[0].completedAt.getTime()){next.completionPrecision='EXACT_VERIFIED';next.actualCompletedAt=boundary.toISOString();}
  if(prior&&boundary.getTime()===prior.completedAt.getTime())completionEvidenceId=prior.id;
  else{
   const externalId=prior?`operational-safe-final:${game.id}:${fingerprint(boundary.toISOString())}`:`operational-final:${game.id}`;
   const evidence=await tx.gameCompletionEvidence.upsert({where:{provider_externalId:{provider:'conservative-event-policy',externalId}},update:{},create:{gameId:game.id,provider:'conservative-event-policy',externalId,completedAt:boundary,knownAt:new Date(input.observedAt),sourceRecord:{policy:operationalEventPolicy,precision:next.completionPrecision,actualCompletedAt:n.completedAt,sourceObservationId:observationId,publisher:input.provider,sourceReference:input.sourceReference,observedAt:input.observedAt,firstObservationImmutable:true,extendsEvidenceId:prior?.id??null}}});
   completionEvidenceId=evidence.id;
  }
 }
 if(correctionPending||conflicting||lockReviewPending)await invalidateCorrectionAnchor(tx,game.id,observationId,new Date(input.observedAt),lockReviewPending?'Late start evidence requires audited immutable-lineup resolution.':correctionPending?'Later game-state evidence invalidated an earlier completion claim.':'Unresolved source game-state contradiction invalidated the complete-box anchor.');
 return{outcome:'ACCEPTED' as const,reason:'Approved conservative event evidence; exact timestamps remain separate, original fantasy attribution and immutable lineup history are preserved.',targets:{gameId:game.id,policy:operationalEventPolicy,operationalClock:next,completionPending,completionCorrectionRequired:correctionPending,sourceStateConflict:conflicting,completionEvidenceId,lockReviewPending,impactedSnapshotIds:impactedSnapshots.map(row=>row.id),quarantinedAssignmentEventIds:impactedAssignments.map(row=>row.id),actualEventTimestampsInvented:false,competitiveAttributionChanged:false}};
}
