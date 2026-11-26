import{z}from"zod";
import{Prisma,type ProfessionalDataObservation}from"@/generated/prisma/client";
import{getDatabase}from"@/lib/db";
import{assertFixtureDatabase,persistObservation}from"./persist";
import{observationSchema,retryDelay}from"./contracts";
const schema=z.object({permission:z.enum(["DISABLED","FIXTURE_ONLY"]),providers:z.array(z.string().min(1).max(100)).max(20),limit:z.number().int().min(1).max(200).default(100)}).strict();
/** Retry dependency-pending evidence without refetching or changing source timestamps. */
export async function retryPendingProfessionalObservations(raw:z.input<typeof schema>,at=new Date()){
 const policy=schema.parse(raw);
 if(policy.permission==="DISABLED"||!policy.providers.length)return{status:"PENDING_PERMISSION" as const,examined:0,recovered:0};
 assertFixtureDatabase();const db=getDatabase();
 const rows=await db.$queryRaw<ProfessionalDataObservation[]>`SELECT observation.* FROM "ProfessionalDataObservation" observation
  JOIN LATERAL(SELECT outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=observation.id ORDER BY version DESC LIMIT 1) current_decision ON true
  LEFT JOIN "ProfessionalSyncState" retry ON retry.provider='internal-pending-retry' AND retry.sport=observation.sport AND retry.stream=observation.id::text
  WHERE current_decision.outcome='PENDING_DATA' AND observation.provider IN (${Prisma.join(policy.providers)})
    AND observation."observedAt"<=${at} AND (retry."nextPollAt" IS NULL OR retry."nextPollAt"<=${at})
  ORDER BY CASE observation.category WHEN 'TEAM_IDENTITY' THEN 0 WHEN 'PLAYER' THEN 1 WHEN 'SEASON_BOUNDARY' THEN 2 WHEN 'GAME_IDENTITY' THEN 3 ELSE 4 END,
    observation."observedAt",observation.id LIMIT ${policy.limit}`;
 let recovered=0,failed=0;
 for(const row of rows){
  try{
   const record=observationSchema.parse({provider:row.provider,sport:row.sport,entityKey:row.entityKey,revisionToken:row.revisionToken,revisionOrdinal:row.revisionOrdinal===null?null:Number(row.revisionOrdinal),sourceReference:row.sourceReference,observedAt:row.observedAt.toISOString(),effectiveAt:row.effectiveAt?.toISOString()??null,publishedAt:row.publishedAt?.toISOString()??null,raw:row.raw,normalized:row.normalized});
   const result=await db.$transaction(async tx=>{
    const decision=await persistObservation(tx,record,at);
    const key={provider:"internal-pending-retry",sport:row.sport,stream:row.id};
    const state=await tx.professionalSyncState.findUnique({where:{provider_sport_stream:key}});
    const pending=decision.outcome==="PENDING_DATA";
    const update={nextPollAt:new Date(+at+(pending?Math.min(3600000,retryDelay((state?.failures??0)+1,60000,null)):0)),failures:pending?(state?.failures??0)+1:0,lastFailure:pending?"DEPENDENCIES_PENDING":null,...(pending?{}:{lastSuccessAt:at})};
    await tx.professionalSyncState.upsert({where:{provider_sport_stream:key},create:{...key,...update},update});
    return decision;
   },{timeout:30000});
   if(result.outcome==="ACCEPTED"||result.outcome==="DUPLICATE")recovered++;
  }catch{failed++;}
 }
 return{status:"PROCESSED" as const,examined:rows.length,recovered,failed};
}
