import {randomUUID}from"node:crypto";
import type{Prisma}from"@/generated/prisma/client";
import{fingerprint}from"./contracts";
/** Exact sliding windows shared by every sport/stream for this provider.
 * Existing generic expiring buckets store one reservation per network request;
 * failures consume their reservation, while waiting/disabled jobs consume none.
 */
export async function reserveProviderRequest(tx:Prisma.TransactionClient,provider:string,windows:{limit:number;windowMs:number}[],at:Date){
 const prefix=`professional-request:${fingerprint(provider)}:`;
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${prefix},0))`;
 const configurationPrefix=`professional-budget-policy:${fingerprint(provider)}:`;
 const configurationKey=`${configurationPrefix}${fingerprint([...windows].sort((a,b)=>a.windowMs-b.windowMs||a.limit-b.limit))}`;
 const configuration=await tx.rateLimitBucket.findFirst({where:{key:{startsWith:configurationPrefix}},select:{key:true}});
 if(configuration&&configuration.key!==configurationKey)throw new Error("Provider request-window policy changed; review retained request history before replacing its configuration.");
 if(!configuration)await tx.rateLimitBucket.create({data:{key:configurationKey,windowStart:at,count:1,expiresAt:new Date("9999-01-01T00:00:00Z")}});
 const longest=Math.max(...windows.map(w=>w.windowMs));
 const reservations=await tx.rateLimitBucket.findMany({where:{key:{startsWith:prefix},windowStart:{gt:new Date(+at-longest)}},orderBy:{windowStart:"asc"},select:{windowStart:true,count:true}});
 const future=reservations.find(r=>r.windowStart>at);
 if(future)return{status:"WAITING" as const,retryAt:future.windowStart};
 let retryAt:number|null=null;
 for(const window of windows){
  const active=reservations.filter(r=>+r.windowStart>+at-window.windowMs);
  let count=active.reduce((sum,r)=>sum+r.count,0);
  if(count<window.limit)continue;
  for(const row of active){count-=row.count;if(count<window.limit){retryAt=Math.max(retryAt??0,+row.windowStart+window.windowMs);break;}}
 }
 if(retryAt!==null)return{status:"QUOTA_EXHAUSTED" as const,retryAt:new Date(retryAt)};
 await tx.rateLimitBucket.create({data:{key:`${prefix}${randomUUID()}`,windowStart:at,count:1,expiresAt:new Date(+at+longest)}});
 return{status:"RESERVED" as const};
}
