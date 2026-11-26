import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { assertFixtureDatabase, persistObservation } from "./persist";
import { ProviderFailure, retryDelay, type ProviderAdapter, type ProviderPolicy } from "./contracts";
const policySchema=z.object({provider:z.string().min(1),sport:z.enum(["NFL","MLB","NBA","NHL"]),stream:z.string().min(1),minIntervalMs:z.number().int().min(1000),maxRequests:z.number().int().positive(),leaseMs:z.number().int().min(1000).max(600000),permission:z.enum(["FIXTURE_ONLY","DISABLED"])}).strict();
export async function synchronizeProvider(adapter:ProviderAdapter,rawPolicy:ProviderPolicy,clock:()=>Date=()=>new Date()) {
 const policy=policySchema.parse(rawPolicy);
 if(policy.permission==="DISABLED")return {status:"PENDING_PERMISSION" as const};
 assertFixtureDatabase();
 const db=getDatabase(),now=clock(),token=randomUUID();
 const key={provider:policy.provider,sport:policy.sport,stream:policy.stream};
 const claim=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(key)},0))`;
  const state=await tx.professionalSyncState.upsert({where:{provider_sport_stream:key},create:{...key,nextPollAt:now},update:{}});
  if(state.requests>=policy.maxRequests)return {status:"QUOTA_EXHAUSTED" as const};
  if(state.nextPollAt>now||(state.leaseUntil&&state.leaseUntil>now))return {status:"WAITING" as const};
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
    if(record.provider!==policy.provider||record.sport!==policy.sport||record.normalized.kind!==policy.stream)throw new Error("Provider page crossed its configured identity/sport/stream scope.");
    decisions.push(await persistObservation(tx,record,finished));
   }
   const changed=await tx.professionalSyncState.updateMany({where:{id:active.id,leaseToken:token},data:{cursor:page.nextCursor,leaseToken:null,leaseUntil:null,failures:0,lastFailure:null,lastSuccessAt:finished,nextPollAt:new Date(+finished+policy.minIntervalMs)}});
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
