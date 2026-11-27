import type { Prisma } from '@/generated/prisma/client';
import { fingerprint } from '@/ingestion/contracts';
/** Audit unsafe first capture; identical administrative repeats do not change assignments. */
export async function gameLockReview(tx:Prisma.TransactionClient,gameId:string,lockAt:Date,at:Date,playerIds:string[],persist=false){
 const assignments=await tx.competitionPeriodGame.findMany({where:{gameId},select:{sportCompetitionId:true,sportCompetition:{select:{leagueId:true}}}});
 const completion=await tx.gameCompletionEvidence.findFirst({where:{gameId,knownAt:{lte:at}},orderBy:{completedAt:'desc'},select:{completedAt:true}});
 const through=new Date(Math.min(+at,completion?+completion.completedAt:+at));
 const affected:{leagueId:string;rosterEntryId:string;eventIds:string[]}[]=[];
 for(const assignment of assignments){
  const captured=await tx.gameLineupSnapshot.findMany({where:{gameId,sportCompetitionId:assignment.sportCompetitionId},select:{rosterEntryId:true}});
  const entries=await tx.rosterEntry.findMany({where:{leagueId:assignment.sportCompetition.leagueId,playerId:{in:playerIds},acquiredAt:{lte:lockAt},OR:[{releasedAt:null},{releasedAt:{gt:lockAt}}]},include:{assignmentEvents:{where:{effectiveAt:{lte:through}},orderBy:[{effectiveAt:'asc'},{createdAt:'asc'},{id:'asc'}]}}});
  for(const entry of entries){if(captured.some(snapshot=>snapshot.rosterEntryId===entry.id))continue;let prior:typeof entry.assignmentEvents[number]|undefined;const changed=[];
   for(const event of entry.assignmentEvents){const different=prior&&(event.toSlot!==prior.toSlot||event.toSlotIndex!==prior.toSlotIndex||event.teamId!==prior.teamId);if(event.effectiveAt>=lockAt&&different)changed.push(event.id);prior=event;}
   if(changed.length)affected.push({leagueId:entry.leagueId,rosterEntryId:entry.id,eventIds:changed});
  }
 }
 affected.sort((a,b)=>`${a.leagueId}:${a.rosterEntryId}`.localeCompare(`${b.leagueId}:${b.rosterEntryId}`));
 const reviewFingerprint=fingerprint({gameId,lockAt:lockAt.toISOString(),affected});
 const resolved=affected.length?await tx.commissionerAuditEvent.findMany({where:{action:'RESOLVE_GAME_LOCK_REVIEW',targetType:'Game',targetId:gameId,leagueId:{in:affected.map(row=>row.leagueId)},effectiveAt:{lte:at}},select:{leagueId:true,reason:true,after:true}}):[];
 const unresolved=affected.filter(row=>!resolved.some(audit=>audit.leagueId===row.leagueId&&(audit.after as {reviewFingerprint?:string;resolution?:string})?.reviewFingerprint===reviewFingerprint&&(audit.after as {resolution?:string})?.resolution==='ACKNOWLEDGED_AND_RESOLVED'&&audit.reason.length>=10));
 let observationId:string|null=null;
 if(persist&&unresolved.length){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'game-lock-review:'+gameId},0))`;
  const game=await tx.game.findUniqueOrThrow({where:{id:gameId},select:{sport:true}});
  const key={provider:'internal-lock-audit',sport:game.sport,category:'GAME_LOCK_REVIEW',entityKey:`game-lock-review:${gameId}`,revisionToken:reviewFingerprint,contentHash:reviewFingerprint};
  const existing=await tx.professionalDataObservation.findFirst({where:key});
  if(existing)observationId=existing.id;
  else{const record=await tx.professionalDataObservation.create({data:{...key,sourceReference:'https://github.com/VickenMat/FantasySportsSite',observedAt:at,publishedAt:null,effectiveAt:null,raw:{gameId,lockAt:lockAt.toISOString(),affected},normalized:{kind:'GAME_LOCK_REVIEW',gameId,reviewFingerprint,reason:'Initial immutable capture found actual post-lock slot/team changes; no source history or starter outcome was rewritten.'}}});observationId=record.id;
   await tx.professionalDataDecision.create({data:{observationId:record.id,version:1,outcome:'QUARANTINED',reason:'Post-lock assignment changes require explicit commissioner audit before first capture.',targets:{gameId,reviewFingerprint,affectedRosterEntryIds:unresolved.map(row=>row.rosterEntryId),quarantinedAssignmentEventIds:unresolved.flatMap(row=>row.eventIds),lockAt:lockAt.toISOString()},decidedAt:at}});
  }
 }
 return{pending:unresolved.length>0,reviewFingerprint,observationId,affectedRosterEntryIds:unresolved.map(row=>row.rosterEntryId),quarantinedAssignmentEventIds:unresolved.flatMap(row=>row.eventIds)};
}
