import type{Prisma,PlayerGameStat}from"@/generated/prisma/client";
import type{GameStatRole,Sport}from"@/generated/prisma/enums";
import{applicableRules}from"@/scoring/engine";
import{ubpV9Rules}from"@/scoring/ubp-v9";
import{fingerprint}from"./contracts";
export type StatSourceCandidate={provider:string;priority:number;role:GameStatRole;observationId:string;statId:string;observedAt:Date};
export type FieldSourcePolicy={version:string;enrichment?:"NONE"|"MISSING_ONLY";sources:{provider:string;fields?:string[]}[]};
/** Fill only unknown fields from explicitly reviewed secondary sources; retain per-field lineage. */
export async function enrichSelectedStatistics(tx:Prisma.TransactionClient,input:{sport:Sport;gameId:string;playerId:string},ranked:StatSourceCandidate[],policy:FieldSourcePolicy){
 if(policy.enrichment!=="MISSING_ONLY")return null;
 const primary=ranked[0],rows=await tx.playerGameStat.findMany({where:{id:{in:ranked.map(r=>r.statId)}}});
 const root=rows.find(row=>row.id===primary.statId);if(!root)return{status:"PENDING_DATA" as const};
 const metadata=(row:PlayerGameStat)=>(row.raw as {professionalObservation?:{initialPublishedAt?:string|null;sourceReference?:string;phase?:string}}).professionalObservation;
 const values:Record<string,number|null>={},lineage:Record<string,Prisma.InputJsonValue>={};
 const used=new Set<string>([root.id]);let secondaryUsed=false,masked=false;
 const keys=[...new Set(applicableRules(ubpV9Rules,primary.role).map(rule=>rule.statKey==="pitching_innings"?"pitching_outs":rule.statKey==="tight_end_reception_bonus"?"receptions":rule.statKey))];
 for(const key of keys){
  values[key]=null;
  for(const candidate of ranked){
   const allowed=policy.sources.find(p=>p.provider===candidate.provider)?.fields;
   const row=rows.find(r=>r.id===candidate.statId);if(!row)continue;
   const count=(row.normalized as Record<string,number|null>)[key];
   if(allowed&&!allowed.includes(key)){if(candidate===primary&&count!=null)masked=true;continue;}
   if(count==null)continue;
   if(row.teamId!==root.teamId)return{status:"SOURCE_CONFLICT" as const};
   values[key]=count;used.add(row.id);if(candidate!==primary)secondaryUsed=true;
   lineage[key]={provider:row.provider,statId:row.id,sourceReference:metadata(row)?.sourceReference??null,publishedAt:row.sourceKnownAt?.toISOString()??null};break;
  }
 }
 if(!secondaryUsed&&!masked)return null;
 const evidence=rows.filter(r=>used.has(r.id));
 const publishedAt=evidence.length&&evidence.every(r=>r.sourceKnownAt!==null)?new Date(Math.max(...evidence.map(r=>+r.sourceKnownAt!))):null;
 const initialPublishedAt=metadata(root)?.initialPublishedAt??null;
 const provider=`hybrid:${fingerprint(policy).slice(0,32)}`;
 const contentHash=fingerprint({policy,gameId:input.gameId,playerId:input.playerId,role:primary.role,values,lineage,sourceStats:[...used].sort(),initialPublishedAt});
 const existing=await tx.playerGameStat.findFirst({where:{gameId:input.gameId,playerId:input.playerId,role:primary.role,provider,contentHash}});if(existing)return{status:"ENRICHED" as const,provider,statId:existing.id};
 const previous=await tx.playerGameStat.findFirst({where:{gameId:input.gameId,playerId:input.playerId,role:primary.role,provider},orderBy:{revision:"desc"}});
 const batch=await tx.importBatch.upsert({where:{sport_provider_contentHash_importerVersion:{sport:input.sport,provider,contentHash,importerVersion:"reviewed-field-enrichment-1"}},update:{},create:{sport:input.sport,provider,contentHash,importerVersion:"reviewed-field-enrichment-1",sourceName:`Reviewed missing-field enrichment ${policy.version}`,summary:{policyFingerprint:fingerprint(policy),sourceStatIds:[...used].sort()}}});
 const receivedAt=new Date(Math.max(...ranked.filter(r=>used.has(r.statId)).map(r=>+r.observedAt))).toISOString();
 const stat=await tx.playerGameStat.create({data:{gameId:input.gameId,playerId:input.playerId,teamId:root.teamId,provider,role:primary.role,importBatchId:batch.id,revision:(previous?.revision??0)+1,priorRevisionId:previous?.id??null,contentHash,sourceLine:1,observedPositions:[],normalized:values,sourceKnownAt:publishedAt,raw:{professionalObservation:{observationId:primary.observationId,sourceReference:metadata(root)?.sourceReference??null,phase:metadata(root)?.phase??null,publicationSemantics:publishedAt?"OFFICIAL_BOX_SCORE":"UNVERIFIED",initialPublishedAt,primaryProvider:primary.provider,enriched:true,receivedAt},policyVersion:policy.version,policyFingerprint:fingerprint(policy),sourceStatIds:[...used].sort(),fieldSources:lineage}}});
 return{status:"ENRICHED" as const,provider,statId:stat.id};
}
