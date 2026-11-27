import{Prisma}from'@/generated/prisma/client';
import type{Observation}from'@/ingestion/contracts';
import{fingerprint}from'@/ingestion/contracts';
import{permitsObservedEvidence,observedPolicyAdoptedAt}from'@/ingestion/evidence-policy';
import{resolveProfessionalGame}from'@/ingestion/professional-identities';
import{completeFinalBoxSchema}from'@/scoring/complete-box-policy';
import{professionalGameProjection}from'./professional-game-state';
const provider='conservative-box-policy',key=(gameId:string)=>`box-clock:${gameId}`;
export async function correctionAnchor(tx:Prisma.TransactionClient,gameId:string,at:Date){
 const row=await tx.professionalDataObservation.findFirst({where:{provider,category:'BOX_CLOCK',entityKey:key(gameId),observedAt:{lte:at},decisions:{some:{outcome:'ACCEPTED',decidedAt:{lte:at}}}},orderBy:{revisionOrdinal:'desc'}});
 if(!row)return null;
 const invalid=await tx.professionalDataObservation.findFirst({where:{provider,category:'BOX_CLOCK_INVALIDATION',entityKey:key(gameId),observedAt:{lte:at},decisions:{some:{outcome:'ACCEPTED',decidedAt:{lte:at},targets:{path:['anchorId'],equals:row.id}}}}});
 const value=row.normalized as{anchorAt:string;deadlineAt:string;mode:string};
 return{id:row.id,anchorAt:new Date(value.anchorAt),deadlineAt:new Date(value.deadlineAt),mode:value.mode,invalidated:Boolean(invalid),revision:row.revisionOrdinal??0n};
}
export async function invalidateCorrectionAnchor(tx:Prisma.TransactionClient,gameId:string,sourceObservationId:string,at:Date,reason:string){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key(gameId)},0))`;
 const anchor=await correctionAnchor(tx,gameId,at);if(!anchor||anchor.invalidated)return{invalidated:false};
 const token=fingerprint({gameId,anchorId:anchor.id,sourceObservationId,reason});
 const game=await tx.game.findUniqueOrThrow({where:{id:gameId}});
 const row=await tx.professionalDataObservation.create({data:{provider,sport:game.sport,category:'BOX_CLOCK_INVALIDATION',entityKey:key(gameId),revisionToken:token,revisionOrdinal:anchor.revision,contentHash:token,sourceReference:'https://github.com/VickenMat/FantasySportsSite',observedAt:at,raw:{sourceObservationId,reason},normalized:{gameId,anchorId:anchor.id,reason}}});
 await tx.professionalDataDecision.create({data:{observationId:row.id,version:1,outcome:'ACCEPTED',reason,targets:{gameId,anchorId:anchor.id},decidedAt:at}});return{invalidated:true};
}
export async function promoteCompleteFinalBox(tx:Prisma.TransactionClient,input:Observation,observationId:string,at:Date){
 const n=completeFinalBoxSchema.parse(input.normalized),pending=(reason:string)=>({outcome:'PENDING_DATA' as const,reason,targets:{}}),reject=(reason:string)=>({outcome:'QUARANTINED' as const,reason,targets:{}});
 if(!permitsObservedEvidence(input.provider)||at<observedPolicyAdoptedAt)return reject('The observed-box policy requires a permitted source and prospective policy applicability.');
 const game=await resolveProfessionalGame(tx,input.sport,n.game);if(!game)return pending('The final box needs a resolved canonical game.');
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key(game.id)},0))`;
 const[state]=await tx.$queryRaw<{status:string|null;completedAt:Date|null;exactCompletedAt:Date|null;lockReviewPending:boolean}[]>`SELECT source_state.status,COALESCE(source_state."operationalCompletedAt",source_state."completedAt") AS "completedAt",source_state."completedAt" AS "exactCompletedAt",source_state."lockReviewPending" FROM "Game" game ${professionalGameProjection(at)} WHERE game.id=${game.id}::uuid`;
 if(state?.status!=='FINAL'||!state.completedAt||state.completedAt>at||state.lockReviewPending)return pending('A trustworthy uncontradicted completed game and safe immutable lock history are required.');
 const{pendingGameStarterSnapshots}=await import('./lineup-snapshots');
 if((await pendingGameStarterSnapshots(tx,game.id,at)).pending)return pending('Required immutable starter snapshots are not yet complete.');
 const starters=await tx.gameLineupSnapshot.findMany({where:{gameId:game.id,isStarter:true,lockedAt:{lte:at}},select:{playerId:true}});
 if(starters.some(row=>!n.statistics.some(stat=>stat.playerId===row.playerId)))return pending('The complete box must cover every affected immutable starter.');
 const selectionFailures=await tx.professionalSyncState.count({where:{provider:"internal-source-selection",sport:input.sport,lastFailure:{not:null},nextPollAt:{lte:at},stream:{in:n.statistics.map(target=>`game:${game.id}:player:${target.playerId}`)}}});
 if(selectionFailures)return pending("Unresolved statistical source selection blocks the complete-box anchor.");
 for(const target of n.statistics){
  const entry=await tx.scoreLedgerEntry.findUnique({where:{id:target.scoreEntryId},include:{ledger:{include:{preset:true}},stat:true}});
  if(!entry||entry.ledger.gameId!==game.id||entry.ledger.playerId!==target.playerId||entry.ledger.role!==target.role||entry.ledger.preset.version!=='ubp-v9-experimental'||entry.statId!==target.statId||entry.stat.gameId!==game.id||entry.stat.playerId!==target.playerId||entry.stat.role!==target.role||entry.stat.contentHash!==target.statHash||entry.missingStats.length)return pending('All reviewed player roles and V9 inputs must match complete canonical score entries.');
  const latest=await tx.scoreLedgerEntry.findFirst({where:{ledgerId:entry.ledgerId,calculatedAt:{lte:at}},orderBy:{sequence:'desc'}});
  if(latest?.id!==entry.id)return reject('A reviewed final-box score head changed; validate the updated complete box.');
 }
 const old=await correctionAnchor(tx,game.id,at);
 if(old&&!old.invalidated)return{outcome:'ACCEPTED' as const,reason:'Existing shared first-valid box anchor retained; refresh, correction and provider failover do not reset its deadline.',targets:{gameId:game.id,anchorId:old.id,deadlineAt:old.deadlineAt.toISOString(),anchorCreated:false}};
 if(old&&(!n.replacement||n.replacement.invalidatedAnchorId!==old.id))return pending('Invalidated complete-box evidence requires an explicitly audited conservative replacement.');
 let anchorAt=at,mode='OBSERVED_COMPLETE_BOX';
 if(n.publicationSemantics==='OFFICIAL_BOX_SCORE'){
  const pub=n.initialPublishedAt??input.publishedAt;if(!pub||!input.publishedAt||new Date(pub)>new Date(input.publishedAt)||new Date(input.publishedAt)>at)return reject('Official publication must be explicit and no later than observation.');
  if(state.exactCompletedAt&&new Date(pub)<state.exactCompletedAt)return reject('Official final-box publication cannot precede verified exact completion.');
  anchorAt=new Date(pub);mode='OFFICIAL_PUBLICATION';
 }
 if(old)anchorAt=new Date(Math.max(+anchorAt,+old.anchorAt));
 const deadlineAt=new Date(Math.max(+anchorAt+86400000,old?+old.deadlineAt:0)),value={gameId:game.id,anchorAt:anchorAt.toISOString(),deadlineAt:deadlineAt.toISOString(),mode,sourceObservationId:observationId,sourceFingerprint:n.sourceFingerprint,previousAnchorId:old?.id??null,statTargets:n.statistics,policyVersion:n.policyVersion};
 const token=fingerprint(value),row=await tx.professionalDataObservation.create({data:{provider,sport:input.sport,category:'BOX_CLOCK',entityKey:key(game.id),revisionToken:token,revisionOrdinal:(old?.revision??0n)+1n,contentHash:token,sourceReference:input.sourceReference,observedAt:at,effectiveAt:null,publishedAt:null,raw:{sourceObservationId:observationId,replacementReason:n.replacement?.reason??null},normalized:value}});
 await tx.professionalDataDecision.create({data:{observationId:row.id,version:1,outcome:'ACCEPTED',reason:old?n.replacement!.reason:'First validated complete final box establishes a shared correction window under the approved evidence policy.',targets:{gameId:game.id,anchorAt:value.anchorAt,deadlineAt:value.deadlineAt,mode},decidedAt:at}});
 return{outcome:'ACCEPTED' as const,reason:'Validated final box clock persisted separately from exact official publication and completion.',targets:{gameId:game.id,anchorId:row.id,deadlineAt:value.deadlineAt,anchorCreated:true}};
}

/** `stat` is the caller's canonical-stat alias. Local knowledge is usable only
 * behind an accepted, non-invalidated box anchor; official publication stays intact.
 */
export function statisticalKnowledgeTime(at:Date){return Prisma.sql`COALESCE(stat."sourceKnownAt",(
 SELECT CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(clock.normalized->'statTargets') t WHERE t->>'statId'=stat.id::text)
   THEN CASE WHEN clock.normalized->>'mode'='OFFICIAL_PUBLICATION' THEN (clock.normalized->>'anchorAt')::timestamptz ELSE GREATEST((clock.normalized->>'anchorAt')::timestamptz,stat."recordedAt") END
   ELSE (SELECT GREATEST(observation."observedAt",receipt.known,stat."recordedAt") FROM "ProfessionalDataObservation" observation
     JOIN LATERAL(SELECT MIN(d."decidedAt") known FROM "ProfessionalDataDecision" d WHERE d."observationId"=observation.id AND d.outcome='ACCEPTED' AND d."decidedAt"<=${at}) receipt ON receipt.known IS NOT NULL
     WHERE observation.id::text=stat.raw->'professionalObservation'->>'observationId' AND observation."observedAt"<=${at}) END
 FROM(SELECT c.* FROM "ProfessionalDataObservation" c WHERE c.provider='conservative-box-policy' AND c.category='BOX_CLOCK' AND c."entityKey"='box-clock:'||stat."gameId"::text AND c."observedAt"<=${at}
   AND EXISTS(SELECT 1 FROM "ProfessionalDataDecision" d WHERE d."observationId"=c.id AND d.outcome='ACCEPTED' AND d."decidedAt"<=${at}) ORDER BY c."revisionOrdinal" DESC LIMIT 1) clock
 WHERE NOT EXISTS(SELECT 1 FROM "ProfessionalDataObservation" i JOIN "ProfessionalDataDecision" d ON d."observationId"=i.id AND d.outcome='ACCEPTED'
  WHERE i.provider='conservative-box-policy' AND i.category='BOX_CLOCK_INVALIDATION' AND i."entityKey"=clock."entityKey" AND d.targets->>'anchorId'=clock.id::text AND i."observedAt"<=${at} AND d."decidedAt"<=${at})
))`;}

/** A period with multiple games cannot extend an earlier game's correction window. */
export function statisticalDeadline(at:Date,periodDeadline:Date){return Prisma.sql`LEAST(${periodDeadline},COALESCE((
 SELECT (clock.normalized->>'deadlineAt')::timestamptz FROM "ProfessionalDataObservation" clock
 WHERE clock.provider='conservative-box-policy' AND clock.category='BOX_CLOCK'
 AND clock."entityKey"='box-clock:'||stat."gameId"::text AND clock."observedAt"<=${at}
 AND EXISTS(SELECT 1 FROM "ProfessionalDataDecision" d WHERE d."observationId"=clock.id AND d.outcome='ACCEPTED' AND d."decidedAt"<=${at})
 ORDER BY clock."revisionOrdinal" DESC LIMIT 1),${periodDeadline}))`;}

/** Undefined preserves the pre-existing official-publication path. Null means a
 * policy-managed game is explicitly pending and cannot fall through to old clocks.
 */
export async function observedPeriodPublicationTime(tx:Prisma.TransactionClient,periodId:string,at:Date):Promise<Date|null|undefined>{
 const assignments=await tx.competitionPeriodGame.findMany({where:{scoringPeriodId:periodId},include:{sportCompetition:{include:{league:{select:{presetId:true}}}}}});
 const anchors=await Promise.all(assignments.map(row=>correctionAnchor(tx,row.gameId,at)));
 if(!anchors.some(Boolean))return undefined;
 const clocks:Date[]=[];
 for(const[index,assignment]of assignments.entries()){
  const[state]=await tx.$queryRaw<{status:string|null;startsAt:Date|null;lockReviewPending:boolean|null;legacyStatus:string|null}[]>`SELECT source_state.status,source_start."resolvedStart" AS "startsAt",source_state."lockReviewPending",(SELECT s.status FROM "GameScheduleObservation" s WHERE s."gameId"=game.id AND s."retrievedAt"<=${at} ORDER BY s."retrievedAt" DESC,s.id DESC LIMIT 1) AS "legacyStatus" FROM "Game" game ${professionalGameProjection(at)} WHERE game.id=${assignment.gameId}::uuid`;
  if(state?.status==='CANCELLED')continue;
  if(!state?.startsAt||state.startsAt>at||state.lockReviewPending||!['FINAL','Final','Completed Early','final_score_present'].includes(state.status??state.legacyStatus??''))return null;
  const{pendingGameStarterSnapshots}=await import('./lineup-snapshots');if((await pendingGameStarterSnapshots(tx,assignment.gameId,at)).pending)return null;
  const snapshots=await tx.gameLineupSnapshot.findMany({where:{gameId:assignment.gameId,sportCompetitionId:assignment.sportCompetitionId,isStarter:true,lockedAt:{lte:at}}});
  if(!snapshots.length)return null;
  const anchor=anchors[index];if(anchor?.invalidated)return null;
  const publications:Date[]=[];
  for(const snapshot of snapshots){
   const eligible=snapshot.eligibility as{eligible?:boolean;available?:boolean};if(!(eligible.eligible??eligible.available))return null;
   const ledger=await tx.scoreLedger.findUnique({where:{gameId_playerId_presetId:{gameId:assignment.gameId,playerId:snapshot.playerId,presetId:assignment.sportCompetition.league.presetId}}});if(!ledger)return null;
   const cutoff=anchor?new Date(Math.min(+at,+anchor.deadlineAt)):at;
   const[entry]=await tx.$queryRaw<{missingStats:string[];initial:Date|null}[]>`SELECT e."missingStats",CASE WHEN stat.raw ? 'professionalObservation' THEN (stat.raw->'professionalObservation'->>'initialPublishedAt')::timestamptz ELSE stat."sourceKnownAt" END AS initial FROM "ScoreLedgerEntry" e JOIN "PlayerGameStat" stat ON stat.id=e."statId" WHERE e."ledgerId"=${ledger.id}::uuid AND e."calculatedAt"<=${at} AND ${statisticalKnowledgeTime(at)}<=${cutoff} ORDER BY e.sequence DESC LIMIT 1`;
   if(!entry||entry.missingStats.length)return null;
   const failure=await tx.professionalSyncState.findUnique({where:{provider_sport_stream:{provider:'internal-source-selection',sport:assignment.sportCompetition.sport,stream:`game:${assignment.gameId}:player:${snapshot.playerId}`}}});if(failure?.lastFailure)return null;
   if(!anchor){if(!entry.initial)return null;publications.push(entry.initial);}
  }
  if(anchor)clocks.push(anchor.anchorAt);else clocks.push(new Date(Math.max(...publications.map(Number))));
 }
 if(!clocks.length)return null;
 // A later cancellation/official discovery cannot shorten an already communicated period deadline.
 const prior=await tx.matchupResultRevision.findFirst({where:{matchup:{periodId},calculatedAt:{lte:at}},orderBy:{finalizesAt:'desc'},select:{finalizesAt:true}});
 return new Date(Math.max(...clocks.map(Number),prior?+prior.finalizesAt-86400000:0));
}
