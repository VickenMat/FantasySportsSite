import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {z} from 'zod';
import type {Prisma} from '@/generated/prisma/client';
import {fingerprint} from '@/ingestion/contracts';
import {professionalPlayerIdentityState} from '@/ingestion/identity-resolutions';
import {lockSport} from './sport-lock';
const sha=z.string().regex(/^[a-f0-9]{64}$/),ids=['8477573','8479406','8482451','8484821'] as const;
const candidate=z.object({sourcePlayerId:z.enum(ids),proposedPlayerId:z.uuid(),displayName:z.string().trim().min(1).max(200),expectedPlayerId:z.null(),expectedResolutionId:z.null(),sourceRows:z.array(z.object({sourceLine:z.number().int().min(2),rowSha256:sha,record:z.record(z.string(),z.string())}).strict()).min(1)}).strict();
export const reviewedNhlDirectDiscoverySchema=z.object({version:z.literal('reviewed-nhl-four-direct-discovery-1'),reviewerUserId:z.uuid(),sourceProof:z.object({sourceReference:z.literal('https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_rosters/rosters_2027.csv'),sha256:sha,license:z.literal('CC-BY-4.0'),licenseReference:z.literal('https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md')}).strict(),candidates:z.array(candidate).length(4)}).strict();
export type ReviewedNhlDirectDiscovery=z.infer<typeof reviewedNhlDirectDiscoverySchema>;
export const directIdentityName=(name:string)=>name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g,'');
export function validateNhlDirectDiscovery(raw:unknown){
 const manifest=reviewedNhlDirectDiscoverySchema.parse(raw);
 if(new Set(manifest.candidates.map(row=>row.sourcePlayerId)).size!==4||new Set(manifest.candidates.map(row=>row.proposedPlayerId)).size!==4||new Set(manifest.candidates.map(row=>directIdentityName(row.displayName))).size!==4)throw Error('Duplicate reviewed NHL identity/name.');
 for(const row of manifest.candidates)for(const proof of row.sourceRows)if(proof.record.player_id!==row.sourcePlayerId||proof.record.full_name!==row.displayName||proof.record.season!=='2027'||fingerprint(proof.record)!==proof.rowSha256)throw Error('Direct NHL ID/name/season/row evidence differs.');
 return manifest;
}
export async function validateNhlDirectDiscoverySource(raw:unknown){
 const manifest=validateNhlDirectDiscovery(raw),bytes=await readFile(`data/provider_previews/objects/${manifest.sourceProof.sha256}`);
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sourceProof.sha256)throw Error('Reviewed NHL immutable source changed.');
 const rows=parse(bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
 for(const candidate of manifest.candidates)for(const proof of candidate.sourceRows)if(fingerprint(rows[proof.sourceLine-2])!==proof.rowSha256)throw Error('Reviewed NHL physical source row changed.');
 return manifest;
}
/** Exact4 new identities/aliases only. Never merges identities or grants eligibility. */
export async function reconcileReviewedNhlDirectDiscoveryInTransaction(tx:Prisma.TransactionClient,raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 const manifest=validateNhlDirectDiscovery(raw),targetFingerprint=fingerprint(manifest);
 if(approval&&approval.expectedFingerprint!==targetFingerprint)throw Error('NHL direct identity proposal differs from approval.');
 if(approval)await lockSport(tx,'NHL');
 const receipt=await tx.professionalDataObservation.findFirst({where:{provider:'reviewed-nhl-direct-discovery',sport:'NHL',category:'REVIEWED_ROSTER_DISCOVERY',entityKey:`roster-review:${targetFingerprint}`,revisionToken:targetFingerprint,contentHash:targetFingerprint},include:{decisions:{orderBy:{version:'desc'},take:1}}});
 if(receipt?.decisions[0]?.outcome==='ACCEPTED')return{fingerprint:targetFingerprint,newPlayers:0,newAliases:0,alreadyApplied:true,applied:false};
 if(!await tx.user.findUnique({where:{id:manifest.reviewerUserId},select:{id:true}}))throw Error('An existing audited reviewer is required.');
 const existing=await tx.player.findMany({where:{OR:[{sport:'NHL'},{id:{in:manifest.candidates.map(row=>row.proposedPlayerId)}}]},select:{id:true,displayName:true,sport:true}});
 for(const row of manifest.candidates){
  if(existing.some(player=>player.id===row.proposedPlayerId||(player.sport==='NHL'&&directIdentityName(player.displayName)===directIdentityName(row.displayName))))throw Error('NHL canonical name/ID collision requires independent review.');
  const state=await professionalPlayerIdentityState(tx,'NHL',{provider:'v9-historical',externalId:row.sourcePlayerId},at);
  if(state.status!=='MISSING'||state.mapping!==null||state.resolutionId!==null)throw Error('NHL direct identity alias/review head changed.');
 }
 if(approval){
  await tx.player.createMany({data:manifest.candidates.map(row=>({id:row.proposedPlayerId,sport:'NHL',displayName:row.displayName,isSynthetic:false,isDemo:false}))});
  await tx.playerExternalId.createMany({data:manifest.candidates.map(row=>({playerId:row.proposedPlayerId,sport:'NHL',provider:'v9-historical',externalId:row.sourcePlayerId}))});
  const observation=await tx.professionalDataObservation.create({data:{provider:'reviewed-nhl-direct-discovery',sport:'NHL',category:'REVIEWED_ROSTER_DISCOVERY',entityKey:`roster-review:${targetFingerprint}`,revisionToken:targetFingerprint,revisionOrdinal:1n,contentHash:targetFingerprint,sourceReference:manifest.sourceProof.sourceReference,observedAt:at,effectiveAt:null,publishedAt:null,raw:{manifest,knownAtSemantics:'LOCAL_REVIEW_EVENT_NOT_OFFICIAL_PUBLICATION'},normalized:{kind:'REVIEWED_ROSTER_DISCOVERY',newPlayerIds:manifest.candidates.map(row=>row.proposedPlayerId),eligibilityPositionsGranted:[]}}});
  await tx.professionalDataDecision.create({data:{observationId:observation.id,version:1,outcome:'ACCEPTED',reason:'Exact reviewed four official NHL direct IDs with preserved source rows; no name-only merge or current eligibility grant.',targets:{reviewerUserId:manifest.reviewerUserId,reviewFingerprint:targetFingerprint,newPlayerIds:manifest.candidates.map(row=>row.proposedPlayerId)},decidedAt:at}});
 }
 return{fingerprint:targetFingerprint,newPlayers:4,newAliases:4,alreadyApplied:false,applied:Boolean(approval)};
}
