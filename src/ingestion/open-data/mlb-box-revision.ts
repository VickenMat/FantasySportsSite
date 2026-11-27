import type {Prisma} from '@/generated/prisma/client';
import {fingerprint,contentFingerprint,observationSchema,type Observation} from '../contracts';
const facts=(raw:Record<string,unknown>)=>({
 sourceFiles:Array.isArray(raw.sourceFiles)?raw.sourceFiles.map(value=>{const source=value as{scope?:unknown;sha256?:unknown};return{scope:source.scope,sha256:source.sha256};}).sort((a,b)=>String(a.scope).localeCompare(String(b.scope))||String(a.sha256).localeCompare(String(b.sha256))):null,
 targets:Array.isArray(raw.acceptedStatTargets)?raw.acceptedStatTargets.map(value=>{const{expectedLedgerId,expectedEntryId,...source}=value as Record<string,unknown>;void expectedLedgerId;void expectedEntryId;return source;}).sort((a,b)=>String(a.playerId).localeCompare(String(b.playerId))):null,
});
/** Current reviewed heads are checked by the caller. A different guard snapshot
 * is not a different professional box. Reuse immutable first-valid provenance
 * only for the same exact source version and materialized statistical bindings. */
export async function restoreMlbBoxRevision(tx:Pick<Prisma.TransactionClient,'professionalDataObservation'>,candidate:Observation){
 if(candidate.sport!=='MLB'||candidate.normalized.kind!=='COMPLETE_FINAL_BOX')throw Error('Expected a reviewed MLB final box.');
 const rows=await tx.professionalDataObservation.findMany({where:{provider:candidate.provider,sport:'MLB',category:'COMPLETE_FINAL_BOX',entityKey:candidate.entityKey,revisionToken:candidate.revisionToken,observedAt:{lte:new Date(candidate.observedAt)}},include:{decisions:{where:{decidedAt:{lte:new Date(candidate.observedAt)}},orderBy:{version:'desc'},take:1}},orderBy:[{observedAt:'asc'},{id:'asc'}]});
 const accepted=rows.filter(row=>row.decisions[0]?.outcome==='ACCEPTED');if(!accepted.length)return candidate;
 const expectedFacts=facts(candidate.raw);if(!expectedFacts.sourceFiles?.length||!expectedFacts.targets?.length)throw Error('Reviewed MLB source facts are missing.');
 for(const row of accepted){if(row.sourceReference!==candidate.sourceReference||row.effectiveAt!==null||row.publishedAt!==null||fingerprint(row.normalized)!==fingerprint(candidate.normalized)||!row.raw||typeof row.raw!=='object'||Array.isArray(row.raw)||fingerprint(facts(row.raw))!==fingerprint(expectedFacts))throw Error('The same MLB box revision has different source facts or statistical bindings; fresh review is required.');}
 const first=accepted[0];if(first.revisionOrdinal===null||!Number.isSafeInteger(Number(first.revisionOrdinal)))throw Error('The original MLB box revision ordering is unavailable.');
 const restored=observationSchema.parse({...candidate,revisionOrdinal:Number(first.revisionOrdinal),raw:first.raw,normalized:first.normalized});
 if(contentFingerprint(restored)!==first.contentHash)throw Error('The original MLB box content fingerprint no longer matches its immutable representation.');
 return restored;
}
