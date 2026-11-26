import type { Prisma } from "@/generated/prisma/client";
import { lockSport } from "@/server/sport-lock";
import { recordPositionEvidence } from "@/server/positions";
import { promoteLifecycle } from "./lifecycle";
import { promoteAggregatePosition } from "./aggregate-positions";
import { promotePositionRevision } from "./position-revisions";
import { promoteStatistics } from "./statistics";
import { promoteGameState } from "./game-state";
import { promoteSeasonBoundary } from "./season-boundaries";
import { promoteProfessionalIdentity, resolveProfessionalGame } from "./professional-identities";
import { professionalPlayerIdentityState,resolveProfessionalPlayer } from './identity-resolutions';
import { contentFingerprint, observationSchema, stableJson, type Observation } from "./contracts";

type Tx=Prisma.TransactionClient;
type Decision={outcome:"ACCEPTED"|"STALE"|"QUARANTINED"|"PENDING_DATA";reason:string;targets:Prisma.InputJsonValue};
export function assertIsolatedIngestionDatabase() {
 const url=new URL(process.env.DATABASE_URL!);
 if(url.pathname!=="/fantasy_evolution_test"||!url.searchParams.get("schema")?.startsWith("integration_")||!(process.env.AUTHORIZED_TEST_DATABASES??"").split(",").includes("fantasy_evolution_test"))throw new Error("M5 promotion requires an authorized isolated disposable schema. Development/live ingestion remains disabled.");
}
export const assertFixtureDatabase = assertIsolatedIngestionDatabase;
export function assertOpenDataProvider(provider:string){if(!['nflverse-open-data','sportsdataverse-open-data'].includes(provider))throw new Error('Open-data promotion requires an explicitly reviewed release provider.');}
async function promote(tx:Tx,input:Observation,id:string):Promise<Decision> {
 const n=input.normalized;
 if(n.kind==="PLAYER") {
  const references=[{provider:input.provider,externalId:n.externalId},...n.links];
  const states=[];for(const ref of references)states.push(await professionalPlayerIdentityState(tx,input.sport,ref,new Date(input.observedAt)));
  if(states.some(state=>state.status==='RETRACTED'||state.status==='CONFLICT'))return{outcome:'QUARANTINED',reason:'An explicitly retracted or conflicting player reference requires reviewed identity resolution.',targets:{}};
  const mappings=states.flatMap(state=>state.mapping?[state.mapping]:[]);
  const ids=[...new Set(mappings.map(row=>row.playerId))];
  if(ids.length>1)return {outcome:"QUARANTINED",reason:"Provider identity links disagree; names cannot resolve the conflict.",targets:{playerIds:ids}};
  let playerId=ids[0];
  if(!playerId) {
   if(n.discovery!=="NEW"||n.links.length)return {outcome:"PENDING_DATA",reason:"A verified canonical identity bridge is required.",targets:{}};
   if(await tx.player.findFirst({where:{sport:input.sport,displayName:{equals:n.displayName,mode:"insensitive"}}}))return {outcome:"QUARANTINED",reason:"Name collision requires identity review, not an automatic merge or duplicate.",targets:{}};
   playerId=(await tx.player.create({data:{sport:input.sport,displayName:n.displayName,isSynthetic:true}})).id;
  }
  // Every incoming linked ID is explicit evidence; never rename an established canonical player.
  for(const ref of references)await tx.playerExternalId.upsert({where:{sport_provider_externalId:{sport:input.sport,...ref}},create:{sport:input.sport,...ref,playerId},update:{}});
  return {outcome:"ACCEPTED",reason:"Canonical identity resolved from provider identifiers.",targets:{playerId}};
 }
 if(n.kind==="TEAM_IDENTITY"||n.kind==="GAME_IDENTITY")return promoteProfessionalIdentity(tx,{...input,normalized:n});
 if(n.kind==="SEASON_BOUNDARY")return promoteSeasonBoundary(tx,{...input,normalized:n},id);
 if(n.kind==="GAME_STATE")return promoteGameState(tx,{...input,normalized:n},id);
 if(n.kind==="STAT")return promoteStatistics(tx,{...input,normalized:n},id);
 if(n.kind==="POSITION_AGGREGATE")return promoteAggregatePosition(tx,{...input,normalized:n});
 if(n.kind==="POSITION_REVISION")return promotePositionRevision(tx,{...input,normalized:n},id);
 if(n.kind==="AVAILABILITY"||n.kind==="ROOKIE"||n.kind==="GAME_COMPLETION"||n.kind==="TEAM_ASSIGNMENT")return promoteLifecycle(tx,{...input,normalized:n},id);
 const mapping=await resolveProfessionalPlayer(tx,input.sport,n.player,new Date(input.observedAt));
 const season=await tx.season.findUnique({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}}});
 if(!mapping||!season)return {outcome:"PENDING_DATA",reason:"Position evidence requires an existing canonical player and season.",targets:{}};
 if(!input.publishedAt||!input.effectiveAt)return {outcome:"PENDING_DATA",reason:"Position evidence needs explicit source publication and effective timestamps; observation time is not substituted.",targets:{playerId:mapping.playerId}};
 if(input.sport==="MLB"&&n.evidenceKind!=="FIELDING")return {outcome:"QUARANTINED",reason:"MLB eligibility requires fielding starts/appearances; a roster role does not satisfy 10 starts or 20 appearances.",targets:{}};
 if(n.evidenceKind==="FIELDING"&&(!n.gameId||n.started===undefined))return {outcome:"PENDING_DATA",reason:"Fielding evidence requires an identified game and explicit start evidence.",targets:{}};
 if(n.gameId&&!(await tx.game.findFirst({where:{id:n.gameId,sport:input.sport,seasonId:season.id}})))return {outcome:"QUARANTINED",reason:"The fielding game does not match this canonical sport-season.",targets:{}};
 const base={playerId:mapping.playerId,seasonId:season.id,code:n.code,effectiveAt:new Date(input.effectiveAt),knownAt:new Date(input.publishedAt),provider:input.provider,externalId:id};
 const evidence=await recordPositionEvidence(n.evidenceKind==="FIELDING"?{...base,kind:"FIELDING",gameId:n.gameId!,started:n.started!}:{...base,kind:"LISTED"},tx);
 return {outcome:"ACCEPTED",reason:"Evidence accepted through the existing M4 position service.",targets:{playerId:mapping.playerId,evidenceId:evidence.id}};
}
export async function persistObservation(tx:Tx,raw:unknown,at:Date) {
 assertFixtureDatabase();
 const input=observationSchema.parse(raw);
 if(new Date(input.observedAt)>at)throw new Error("Future observations cannot be ingested before their observation instant.");
 await lockSport(tx,input.sport);
 const category=input.normalized.kind;
 const identity={provider:input.provider,sport:input.sport,category,entityKey:input.entityKey};
 const hash=contentFingerprint(input);
 const same=await tx.professionalDataObservation.findFirst({where:{...identity,revisionToken:input.revisionToken,contentHash:hash},include:{decisions:{orderBy:{version:"desc"},take:1}}});
 if(same?.decisions[0]&&["ACCEPTED","STALE"].includes(same.decisions[0].outcome))return {observationId:same.id,outcome:"DUPLICATE",reason:"Previously processed content.",targets:same.decisions[0].targets};
 const previous=await tx.professionalDataObservation.findMany({where:identity,include:{decisions:{orderBy:{version:"desc"},take:1}}});
 const observation=same??await tx.professionalDataObservation.create({data:{...identity,revisionToken:input.revisionToken,revisionOrdinal:input.revisionOrdinal==null?null:BigInt(input.revisionOrdinal),contentHash:hash,sourceReference:input.sourceReference,observedAt:new Date(input.observedAt),publishedAt:input.publishedAt?new Date(input.publishedAt):null,effectiveAt:input.effectiveAt?new Date(input.effectiveAt):null,raw:input.raw,normalized:input.normalized}});
 const accepted=previous.filter(row=>row.decisions[0]?.outcome==="ACCEPTED");
 const latest=accepted.sort((a,b)=>a.revisionOrdinal===b.revisionOrdinal?0:(a.revisionOrdinal??-1n)>(b.revisionOrdinal??-1n)?-1:1)[0];
 let decision:Decision;
 if(previous.some(row=>row.id!==observation.id&&row.revisionToken===input.revisionToken&&row.contentHash!==hash))decision={outcome:"QUARANTINED",reason:"The same source revision has conflicting content.",targets:{}};
 else if(latest&&input.revisionOrdinal!=null&&latest.revisionOrdinal!=null&&BigInt(input.revisionOrdinal)<latest.revisionOrdinal)decision={outcome:"STALE",reason:"Out-of-order source revision preserved without changing canonical evidence.",targets:{}};
 else if(latest&&category!=="PLAYER"&&latest.publishedAt&&input.publishedAt&&new Date(input.publishedAt)<latest.publishedAt)decision={outcome:"QUARANTINED",reason:"Increasing source revision has a regressing publication timestamp; resolve its temporal semantics before projection.",targets:{}};
 else if(latest&&(input.revisionOrdinal==null||latest.revisionOrdinal==null||BigInt(input.revisionOrdinal)<=latest.revisionOrdinal))decision={outcome:"QUARANTINED",reason:"Changed content lacks an unambiguous increasing source revision.",targets:{}};
 else if(latest&&category==="POSITION"&&stableJson(latest.normalized)!==stableJson(input.normalized))decision={outcome:"QUARANTINED",reason:"Position replacement or retraction needs a reviewed evidence-resolution policy; positive history is not silently overwritten.",targets:{}};
 else {
  const targets=latest?.decisions[0]?.targets as {playerId?:string;gameId?:string}|null|undefined;
  const mapping=targets?.playerId&&"player" in input.normalized?await resolveProfessionalPlayer(tx,input.sport,input.normalized.player,new Date(input.observedAt)):null;
  const game=targets?.gameId&&input.normalized.kind==="GAME_COMPLETION"?await resolveProfessionalGame(tx,input.sport,input.normalized.game):null;
  if((mapping&&mapping.playerId!==targets?.playerId)||(game&&game.id!==targets?.gameId))decision={outcome:"QUARANTINED",reason:"A source entity revision changed its canonical actor/game identity; review the explicit mapping.",targets:{}};
  else decision=await promote(tx,input,observation.id);
 }
 const receipt=same?.decisions[0];
 if(receipt&&receipt.outcome===decision.outcome&&receipt.reason===decision.reason&&stableJson(receipt.targets)===stableJson(decision.targets))return{observationId:observation.id,...decision};
 const version=(same?.decisions[0]?.version??0)+1;
 await tx.professionalDataDecision.create({data:{observationId:observation.id,version,...decision,decidedAt:at}});
 return {observationId:observation.id,...decision};
}
