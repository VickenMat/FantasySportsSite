import{resolveProfessionalGame}from"./professional-identities";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { assertFixtureDatabase, persistObservation } from "./persist";
import { ProviderFailure, retryDelay, type ProviderAdapter, type ProviderPolicy } from "./contracts";
import { reserveProviderRequest } from "./request-budget";
import { professionalPollInterval, type ProfessionalGameState } from "./http";
import { professionalGameProjection } from "@/server/professional-game-state";
const policySchema=z.object({provider:z.string().min(1),sport:z.enum(["NFL","MLB","NBA","NHL"]),stream:z.string().min(1),gameId:z.uuid().optional(),minIntervalMs:z.number().int().min(1000),maxRequests:z.number().int().positive(),requestWindows:z.array(z.object({limit:z.number().int().min(1).max(100000),windowMs:z.number().int().min(1000).max(31536000000)}).strict()).min(1).max(10).optional(),leaseMs:z.number().int().min(1000).max(600000),permission:z.enum(["FIXTURE_ONLY","DISABLED"])}).strict();
export async function synchronizeProvider(adapter:ProviderAdapter,rawPolicy:ProviderPolicy,clock:()=>Date=()=>new Date()) {
 const policy=policySchema.parse(rawPolicy);
 if(policy.permission==="DISABLED")return {status:"PENDING_PERMISSION" as const};
 if(policy.stream==="GAME_BUNDLE"&&!policy.gameId)throw new Error("Combined game pages require a canonical game scope.");
 assertFixtureDatabase();
 const db=getDatabase(),now=clock(),token=randomUUID();
 const key={provider:policy.provider,sport:policy.sport,stream:policy.gameId?`${policy.stream}:game:${policy.gameId}`:policy.stream};
 const claim=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(key)},0))`;
  const state=await tx.professionalSyncState.upsert({where:{provider_sport_stream:key},create:{...key,nextPollAt:now},update:{}});
  if(!policy.requestWindows&&state.requests>=policy.maxRequests)return {status:"QUOTA_EXHAUSTED" as const};
  if(state.nextPollAt>now||(state.leaseUntil&&state.leaseUntil>now))return {status:"WAITING" as const};
  if(policy.requestWindows){const reservation=await reserveProviderRequest(tx,policy.provider,policy.requestWindows,now);if(reservation.status!=="RESERVED")return reservation;}
  const leased=await tx.professionalSyncState.update({where:{id:state.id},data:{leaseToken:token,leaseUntil:new Date(+now+policy.leaseMs),requests:{increment:1},nextPollAt:new Date(+now+policy.minIntervalMs)}});
  return {status:"LEASED" as const,state:leased};
 });
 if(claim.status!=="LEASED")return claim;
 try {
  const page=await adapter.fetchPage(claim.state.cursor);
  if(page.records.length>1000||JSON.stringify(page).length>2_000_000)throw new Error("Provider page exceeds the bounded ingestion size.");
  const finished=clock();
  return await db.$transaction(async tx=>{
   const active=await tx.professionalSyncState.findUniqueOrThrow({where:{id:claim.state.id}});
   if(active.leaseToken!==token||!active.leaseUntil||active.leaseUntil<=finished)throw new Error("Provider lease expired; response cannot advance the cursor.");
   const decisions=[];
   for(const record of page.records) {
    const matchesStream=record.normalized.kind===policy.stream||(policy.stream==="GAME_BUNDLE"&&["GAME_STATE","GAME_COMPLETION","AVAILABILITY","STAT"].includes(record.normalized.kind));
    if(record.provider!==policy.provider||record.sport!==policy.sport||!matchesStream)throw new Error("Provider page crossed its configured identity/sport/stream scope.");
    if(policy.gameId){
     if(!("game" in record.normalized)||!record.normalized.game)throw new Error("A game-scoped page requires explicit game references.");
     const game=await resolveProfessionalGame(tx,policy.sport,record.normalized.game);
     if(game?.id!==policy.gameId)throw new Error("Provider page crossed its configured canonical game scope.");
    }
    decisions.push(await persistObservation(tx,record,finished));
   }
   let intervalMs=policy.minIntervalMs;
   if(policy.gameId){
    const [game]=await tx.$queryRaw<{status:ProfessionalGameState|null;scheduledStartsAt:Date|null;completedAt:Date|null}[]>`SELECT source_state.status, COALESCE(source_state."scheduledStartsAt",game."startsAt") AS "scheduledStartsAt", source_state."completedAt" FROM "Game" game ${professionalGameProjection(finished)} WHERE game.id=${policy.gameId}::uuid`;
    intervalMs=game?professionalPollInterval(game.status??"SCHEDULED",game.scheduledStartsAt?+game.scheduledStartsAt-+finished:null,game.completedAt?+finished-+game.completedAt:null,policy.minIntervalMs):Math.max(60000,policy.minIntervalMs);
   }
   const changed=await tx.professionalSyncState.updateMany({where:{id:active.id,leaseToken:token},data:{cursor:page.nextCursor,leaseToken:null,leaseUntil:null,failures:0,lastFailure:null,lastSuccessAt:finished,nextPollAt:new Date(+finished+intervalMs)}});
   if(changed.count!==1)throw new Error("Provider lease changed before commit.");
   return {status:"PROCESSED" as const,decisions};
  },{isolationLevel:"Serializable",timeout:30000});
 } catch(error) {
  const at=clock();const failure=error instanceof ProviderFailure?error:null;
  const delay=retryDelay(claim.state.failures+1,policy.minIntervalMs,failure?.retryAfterMs??null);
  await db.professionalSyncState.updateMany({where:{id:claim.state.id,leaseToken:token},data:{leaseToken:null,leaseUntil:null,failures:{increment:1},lastFailure:failure?`HTTP_${failure.status}`:"PAGE_REJECTED",nextPollAt:new Date(+at+([401,403].includes(failure?.status??0)?Math.max(delay,86400000):delay))}});
  return {status:"BACKOFF" as const,reason:failure?`HTTP_${failure.status}`:"PAGE_REJECTED"};
 }
}
