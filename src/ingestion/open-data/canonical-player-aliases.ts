import type {Prisma} from '@/generated/prisma/client';
import type {Sport} from '@/generated/prisma/enums';
import {identityResolutionSchema,professionalPlayerIdentityState} from '../identity-resolutions';
/** Batch database reads, then reuse the authoritative identity reducer for every
 * explicit native alias. Withdrawn/malformed/conflicted edges never fall back. */
export async function canonicalSourcePlayerAliases(tx:Prisma.TransactionClient,sports:readonly Sport[],asOf:Date){
 const[aliases,observations,players]=await Promise.all([
  tx.playerExternalId.findMany({where:{provider:'v9-historical',sport:{in:[...sports]}},select:{sport:true,provider:true,externalId:true,playerId:true}}),
  tx.professionalDataObservation.findMany({where:{provider:'internal-identity-review',sport:{in:[...sports]},category:'IDENTITY_RESOLUTION',observedAt:{lte:asOf},effectiveAt:{lte:asOf}},include:{decisions:{where:{decidedAt:{lte:asOf}},orderBy:{version:'desc'},take:1}},orderBy:[{revisionOrdinal:'desc'},{observedAt:'desc'},{id:'desc'}]}),
  tx.player.findMany({where:{sport:{in:[...sports]},isSynthetic:false,isDemo:false},select:{id:true,sport:true}}),
 ]);
 const refs=new Map(aliases.map(row=>[`${row.sport}:${row.externalId}`,{sport:row.sport,provider:row.provider,externalId:row.externalId}]));
 for(const row of observations){const parsed=identityResolutionSchema.safeParse((row.raw as{proposal?:unknown})?.proposal);if(parsed.success&&parsed.data.reference.provider==='v9-historical')refs.set(`${row.sport}:${parsed.data.reference.externalId}`,{sport:row.sport,...parsed.data.reference});}
 const aliasMap=new Map(aliases.map(row=>[`${row.sport}:${row.provider}:${row.externalId}`,row])),realPlayers=new Set(players.map(row=>`${row.sport}:${row.id}`));
 const overlayMap=new Map<string,typeof observations>();for(const row of observations){const key=`${row.sport}:${row.entityKey}`;overlayMap.set(key,[...(overlayMap.get(key)??[]),row]);}
 const client={
  playerExternalId:{findUnique:async(query:{where:{sport_provider_externalId:{sport:Sport;provider:string;externalId:string}}})=>{const key=query.where.sport_provider_externalId;return aliasMap.get(`${key.sport}:${key.provider}:${key.externalId}`)??null;}},
  player:{findFirst:async(query:{where:{id:string;sport:Sport}})=>realPlayers.has(`${query.where.sport}:${query.where.id}`)?{id:query.where.id}:null},
  professionalDataObservation:{findMany:async(query:{where:{sport:Sport;entityKey:string}})=>overlayMap.get(`${query.where.sport}:${query.where.entityKey}`)??[]},
 } as unknown as Prisma.TransactionClient;
 const resolved:{sport:Sport;externalId:string;playerId:string}[]=[];
 for(const ref of refs.values()){const state=await professionalPlayerIdentityState(client,ref.sport,{provider:ref.provider,externalId:ref.externalId},asOf);if(state.status==='RESOLVED'&&state.mapping)resolved.push({sport:ref.sport,externalId:ref.externalId,playerId:state.mapping.playerId});}
 return resolved;
}
