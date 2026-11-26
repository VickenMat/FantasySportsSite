import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { getDatabase } from '@/lib/db';
import { lockSport } from './sport-lock';
import { fingerprint, observationSchema } from '@/ingestion/contracts';
import { professionalPlayerIdentityState } from '@/ingestion/identity-resolutions';

type Tx = Prisma.TransactionClient;
const distinctNameProofSchema=z.object({otherCanonicalPlayerId:z.uuid(),otherGsisId:z.string().regex(/^00-\d{7}$/).nullable(),otherBirthDate:z.string().nullable(),basis:z.enum(['DISTINCT_GSIS_AND_BIRTH_DATE','EXISTING_SYNTHETIC_OR_DEMO_RECORD']),sourceRows:z.array(z.number().int().positive()).min(1)}).strict();
const candidateSchema=z.object({sourcePlayerId:z.string().regex(/^00-\d{7}$/),proposedPlayerId:z.uuid(),displayName:z.string().trim().min(1).max(200),birthDate:z.string().nullable(),sourceTeamId:z.string().regex(/^[A-Z]{2,4}$/),sourceObservedPosition:z.string().max(20),distinctNameProofs:z.array(distinctNameProofSchema).default([])}).strict();
const bridgeSchema=z.object({gsisId:z.string().regex(/^00-\d{7}$/),espnAthleteId:z.string().regex(/^\d+$/),playerId:z.uuid(),birthDate:z.string().nullable(),basis:z.literal('EXPLICIT_SAME_ROW_GSIS_ESPN'),sourceRows:z.array(z.number().int().positive()).min(1)}).strict();
const aliasHeadSchema=z.object({provider:z.enum(['v9-historical','espn']),externalId:z.string().regex(/^(?:00-\d{7}|\d+)$/),expectedPlayerId:z.uuid().nullable(),expectedResolutionId:z.uuid().nullable()}).strict();
export const reviewedNflRosterDiscoverySchema=z.object({version:z.literal('reviewed-nfl-roster-2026-1'),reviewerUserId:z.uuid(),sourceProofs:z.array(z.object({sourceReference:observationSchema.shape.sourceReference,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(20),candidates:z.array(candidateSchema).max(5000),bridges:z.array(bridgeSchema).max(5000),expectedAliasHeads:z.array(aliasHeadSchema).max(10000)}).strict();
export type ReviewedNflRosterManifest=z.infer<typeof reviewedNflRosterDiscoverySchema>;

/** Convert the collision-reviewed direct-ID candidates and independently checked
 * crosswalk records. Name-only publisher matches never qualify on their own.
 * Empty expected heads are conservative: a pre-existing edge requires a new review.
 */
export function buildReviewedNflRosterManifest(report:unknown,sourceProofs:ReviewedNflRosterManifest['sourceProofs'],reviewerUserId:string){
 const parsed=z.object({candidates:z.array(candidateSchema),bridges:z.array(bridgeSchema)}).passthrough().parse(report);
 const groups=new Map<string,z.infer<typeof bridgeSchema>[]>();for(const row of parsed.bridges)groups.set(row.espnAthleteId,[...(groups.get(row.espnAthleteId)??[]),row]);
 const bridges=[...groups.values()].map(rows=>{if(new Set(rows.map(row=>fingerprint({...row,sourceRows:[]}))).size!==1)throw Error('Conflicting same-row NFL identity evidence requires quarantine.');return rows.reduce((left,right)=>({...left,sourceRows:[...new Set([...left.sourceRows,...right.sourceRows])].sort((a,b)=>a-b)}));}).sort((a,b)=>a.espnAthleteId.localeCompare(b.espnAthleteId));
 const candidates=[...parsed.candidates].sort((a,b)=>a.sourcePlayerId.localeCompare(b.sourcePlayerId));
 const expectedAliasHeads=[...candidates.map(row=>({provider:'v9-historical' as const,externalId:row.sourcePlayerId,expectedPlayerId:null,expectedResolutionId:null})),...bridges.map(row=>({provider:'espn' as const,externalId:row.espnAthleteId,expectedPlayerId:null,expectedResolutionId:null}))];
 return reviewedNflRosterDiscoverySchema.parse({version:'reviewed-nfl-roster-2026-1',reviewerUserId,sourceProofs,candidates,bridges,expectedAliasHeads});
}

/** Lower-level transaction entry for a separately approved consolidated deployment.
 * Caller owns isolation/production authorization and ordered sport locks. This
 * function still requires an exact part fingerprint and never rewrites old rows.
 */
export async function reconcileReviewedNflRosterInTransaction(tx:Tx,raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 const manifest=reviewedNflRosterDiscoverySchema.parse(raw),targetFingerprint=fingerprint(manifest);
 if(!manifest.candidates.length&&!manifest.bridges.length)throw Error('An empty roster target cannot be reviewed as a backfill.');
 if(approval&&approval.expectedFingerprint!==targetFingerprint)throw Error('Reviewed roster manifest changed.');
 const receipt=await tx.professionalDataObservation.findFirst({where:{provider:'reviewed-nfl-roster',sport:'NFL',category:'REVIEWED_ROSTER_DISCOVERY',entityKey:`roster-review:${targetFingerprint}`,revisionToken:targetFingerprint,contentHash:targetFingerprint},include:{decisions:{orderBy:{version:'desc'},take:1}}});
 if(receipt?.decisions[0]?.outcome==='ACCEPTED')return{fingerprint:targetFingerprint,newPlayers:0,newAliases:0,alreadyApplied:true,applied:false,eligibilityChanges:0,sourcePublicationChanges:0};
 if(!await tx.user.findUnique({where:{id:manifest.reviewerUserId},select:{id:true}}))throw Error('Roster discovery requires an existing audited reviewer.');
 const ids=manifest.candidates.map(row=>row.proposedPlayerId),sourceIds=manifest.candidates.map(row=>row.sourcePlayerId);
 if(new Set(ids).size!==ids.length||new Set(sourceIds).size!==sourceIds.length)throw Error('Duplicate proposed identity requires manual review.');
 if(await tx.player.findFirst({where:{id:{in:ids}},select:{id:true}}))throw Error('An existing canonical ID conflicts with the reviewed new-player target.');
 for(const candidate of manifest.candidates){
  const peers=manifest.candidates.filter(row=>row.sourcePlayerId!==candidate.sourcePlayerId&&row.displayName.toLowerCase()===candidate.displayName.toLowerCase());
  if(peers.some(row=>!row.birthDate||!candidate.birthDate||row.birthDate===candidate.birthDate))throw Error('Identical names without distinct source birth dates remain quarantined.');
  const collisions=await tx.player.findMany({where:{sport:'NFL',displayName:{equals:candidate.displayName,mode:'insensitive'}},select:{id:true,isSynthetic:true,isDemo:true}});
  for(const collision of collisions){
   const proof=candidate.distinctNameProofs.find(row=>row.otherCanonicalPlayerId===collision.id);if(!proof)throw Error('A canonical name collision lacks independent reviewed identity evidence.');
   if(proof.basis==='EXISTING_SYNTHETIC_OR_DEMO_RECORD'){if(!collision.isSynthetic&&!collision.isDemo)throw Error('A real existing identity cannot be dismissed as a fixture.');}
   else {if(!candidate.birthDate||!proof.otherBirthDate||candidate.birthDate===proof.otherBirthDate||!proof.otherGsisId||candidate.sourcePlayerId===proof.otherGsisId)throw Error('Different namespaced IDs and birth dates are required to distinguish equal names.');const state=await professionalPlayerIdentityState(tx,'NFL',{provider:'v9-historical',externalId:proof.otherGsisId},at);if(state.mapping?.playerId!==collision.id)throw Error('The independently reviewed existing GSIS identity changed.');}
  }
 }
 const proposed=new Map(manifest.candidates.map(row=>[row.sourcePlayerId,row.proposedPlayerId]));
 const aliases=[...manifest.candidates.map(row=>({provider:'v9-historical' as const,externalId:row.sourcePlayerId,playerId:row.proposedPlayerId})),...manifest.bridges.map(row=>({provider:'espn' as const,externalId:row.espnAthleteId,playerId:row.playerId}))];
 const aliasKeys=aliases.map(row=>`${row.provider}:${row.externalId}`),headKeys=manifest.expectedAliasHeads.map(row=>`${row.provider}:${row.externalId}`);
 if(new Set(aliasKeys).size!==aliasKeys.length||new Set(headKeys).size!==headKeys.length||aliasKeys.length!==headKeys.length||aliasKeys.some(key=>!headKeys.includes(key)))throw Error('Reviewed alias/head target sets disagree.');
 const gsisByEspn=new Map<string,string>(),espnByNfl=new Map<string,string>();
 for(const bridge of manifest.bridges){
  if((gsisByEspn.has(bridge.espnAthleteId)&&gsisByEspn.get(bridge.espnAthleteId)!==bridge.gsisId)||(espnByNfl.has(bridge.gsisId)&&espnByNfl.get(bridge.gsisId)!==bridge.espnAthleteId))throw Error('Contradictory one-to-one provider bridge.');
  gsisByEspn.set(bridge.espnAthleteId,bridge.gsisId);espnByNfl.set(bridge.gsisId,bridge.espnAthleteId);
  if(proposed.has(bridge.gsisId)){if(proposed.get(bridge.gsisId)!==bridge.playerId)throw Error('A new-player bridge changed its reviewed canonical target.');}
  else {const current=await professionalPlayerIdentityState(tx,'NFL',{provider:'v9-historical',externalId:bridge.gsisId},at);if(current.status!=='RESOLVED'||current.mapping?.playerId!==bridge.playerId)throw Error('The established NFL canonical identity changed since review.');if(!await tx.player.findFirst({where:{id:bridge.playerId,sport:'NFL',isSynthetic:false,isDemo:false},select:{id:true}}))throw Error('A real-source bridge cannot promote a synthetic/demo canonical identity.');}
 }
 for(const head of manifest.expectedAliasHeads){
  const state=await professionalPlayerIdentityState(tx,'NFL',{provider:head.provider,externalId:head.externalId},at),target=aliases.find(alias=>alias.provider===head.provider&&alias.externalId===head.externalId)!;
  if(state.status==='CONFLICT'||state.status==='RETRACTED'||(state.mapping?.playerId??null)!==head.expectedPlayerId||state.resolutionId!==head.expectedResolutionId)throw Error('A reviewed identity edge/head changed or was retracted.');
  if(state.mapping&&state.mapping.playerId!==target.playerId)throw Error('A provider alias already belongs to a different canonical player.');
 }
 const existing=await tx.playerExternalId.findMany({where:{sport:'NFL',OR:aliases.map(row=>({provider:row.provider,externalId:row.externalId}))}}),existingKeys=new Set(existing.map(row=>`${row.provider}:${row.externalId}`));
 const newAliases=aliases.filter(row=>!existingKeys.has(`${row.provider}:${row.externalId}`));
 const report={fingerprint:targetFingerprint,newPlayers:manifest.candidates.length,newAliases:newAliases.length,alreadyApplied:false,applied:Boolean(approval),eligibilityChanges:0,sourcePublicationChanges:0};
 if(!approval)return report;
 if(manifest.candidates.length)await tx.player.createMany({data:manifest.candidates.map(row=>({id:row.proposedPlayerId,sport:'NFL',displayName:row.displayName,isSynthetic:false,isDemo:false}))});
 if(newAliases.length)await tx.playerExternalId.createMany({data:newAliases.map(row=>({...row,sport:'NFL'}))});
 const observation=await tx.professionalDataObservation.create({data:{provider:'reviewed-nfl-roster',sport:'NFL',category:'REVIEWED_ROSTER_DISCOVERY',entityKey:`roster-review:${targetFingerprint}`,revisionToken:targetFingerprint,revisionOrdinal:1n,contentHash:targetFingerprint,sourceReference:manifest.sourceProofs[0].sourceReference,observedAt:at,effectiveAt:null,publishedAt:null,raw:{manifest,reviewFingerprint:targetFingerprint,knownAtSemantics:'LOCAL_REVIEW_EVENT_NOT_OFFICIAL_PUBLICATION'},normalized:{kind:'REVIEWED_ROSTER_DISCOVERY',newPlayerIds:ids,aliases,eligibilityPositionsGranted:[]}}});
 await tx.professionalDataDecision.create({data:{observationId:observation.id,version:1,outcome:'ACCEPTED',reason:'Exact reviewed direct NFL identities and independently corroborated provider bridges; no name-only merge or eligibility promotion.',targets:{reviewerUserId:manifest.reviewerUserId,reviewFingerprint:targetFingerprint,newPlayerIds:ids,aliases},decidedAt:at}});
 return{...report,newAliases:newAliases.length};
}

export async function reconcileReviewedNflRoster(raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 if(approval){const{assertIsolatedIngestionDatabase}=await import('@/ingestion/persist');assertIsolatedIngestionDatabase();}
 return getDatabase().$transaction(async tx=>{if(approval)await lockSport(tx,'NFL');else await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileReviewedNflRosterInTransaction(tx,raw,approval,at);},{isolationLevel:'Serializable',timeout:120000});
}
