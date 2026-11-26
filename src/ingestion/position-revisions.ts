import type{Prisma}from"@/generated/prisma/client";
import{observationSchema,type Observation}from"./contracts";
import{recordPositionEvidence}from"@/server/positions";
type Revision=Observation&{normalized:Extract<Observation["normalized"],{kind:"POSITION_REVISION"}>};
export async function promotePositionRevision(tx:Prisma.TransactionClient,input:Revision,id:string){
 const n=input.normalized;
 const reject=(reason:string)=>({outcome:"QUARANTINED" as const,reason,targets:{}});
 if(!input.publishedAt||!input.effectiveAt)return{outcome:"PENDING_DATA" as const,reason:"Position corrections need source publication and effective instants.",targets:{}};
 const original=await tx.professionalDataObservation.findUnique({where:{id:n.originalObservationId},include:{decisions:{where:{outcome:"ACCEPTED"},orderBy:{version:"desc"},take:1}}});
 if(!original||!original.decisions.length)return{outcome:"PENDING_DATA" as const,reason:"An accepted original position observation is required.",targets:{}};
 if(original.provider!==input.provider||original.sport!==input.sport)return reject("A source cannot retract another source's position evidence.");
 if(input.entityKey!==`position-revision:${original.id}`)return reject("Use the original observation's stable position-revision stream key.");
 const parsed=observationSchema.shape.normalized.safeParse(original.normalized);
 if(!parsed.success||parsed.data.kind!=="POSITION")return reject("Only an original positive position observation can be revised.");
 const positive=parsed.data;
 if(!original.effectiveAt||!original.publishedAt||+new Date(input.effectiveAt)!==+original.effectiveAt||new Date(input.publishedAt)<original.publishedAt)return reject("A position correction must retain the appearance's effective instant and cannot predate the original publication.");
 if(new Set(n.replacements.map(r=>r.code)).size!==n.replacements.length)return reject("Replacement positions must be distinct source claims.");
 if(positive.evidenceKind==="FIELDING"&&n.replacements.some(r=>r.started===undefined))return reject("Corrected fielding evidence requires explicit start flags.");
 const targets=original.decisions[0].targets as {playerId?:string;evidenceId?:string};
 if(!targets.playerId||!targets.evidenceId)return reject("Original position evidence lacks canonical target identifiers.");
 const sourceEvidence=await tx.playerPositionEvidence.findUnique({where:{id:targets.evidenceId}});
 if(!sourceEvidence||sourceEvidence.playerId!==targets.playerId)return reject("Original canonical evidence is unavailable or inconsistent.");
 const replacementEvidenceIds:string[]=[];
 for(const replacement of n.replacements){
  if(input.sport==="MLB"&&!["C","1B","2B","3B","SS","LF","CF","RF","P"].includes(replacement.code))return reject("MLB replacement evidence requires a defensive fielding position.");
 }
 for(const replacement of n.replacements){
  const common={playerId:targets.playerId,seasonId:sourceEvidence.seasonId,code:replacement.code,effectiveAt:new Date(input.effectiveAt),knownAt:new Date(input.publishedAt),provider:input.provider,externalId:`${id}:${replacement.code}`};
  const evidence=await recordPositionEvidence(positive.evidenceKind==="FIELDING"?{...common,kind:"FIELDING",gameId:positive.gameId!,started:replacement.started!}:{...common,kind:"LISTED"},tx);replacementEvidenceIds.push(evidence.id);
 }
 return{outcome:"ACCEPTED" as const,reason:"Immutable position correction recorded; original evidence and prior lineup snapshots remain intact.",targets:{playerId:targets.playerId,originalEvidenceId:targets.evidenceId,replacementEvidenceIds}};
}
