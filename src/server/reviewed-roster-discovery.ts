import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { getDatabase } from '@/lib/db';
import { lockSport } from './sport-lock';
import { fingerprint, observationSchema } from '@/ingestion/contracts';
import { professionalPlayerIdentityState } from '@/ingestion/identity-resolutions';

type Tx = Prisma.TransactionClient;
const candidateSchema=z.object({sourcePlayerId:z.string().regex(/^\d+$/),proposedPlayerId:z.uuid(),displayName:z.string().trim().min(1).max(200),birthDate:z.string().nullable(),sourceTeamId:z.string().regex(/^\d+$/),sourceObservedPosition:z.string().max(20)}).strict();
const bridgeSchema=z.object({nbaPlayerId:z.string().regex(/^\d+$/),espnAthleteId:z.string().regex(/^\d+$/),playerId:z.uuid(),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),basis:z.enum(['VERIFIED_DOB_CURRENT_TEAM','VERIFIED_HISTORICAL_DOB_CURRENT_ESPN_PROFILE']),sourceRows:z.array(z.number().int().positive()).min(1)}).strict();
const aliasHeadSchema=z.object({provider:z.enum(['v9-historical','espn']),externalId:z.string().regex(/^\d+$/),expectedPlayerId:z.uuid().nullable(),expectedResolutionId:z.uuid().nullable()}).strict();
export const reviewedRosterDiscoverySchema=z.object({version:z.literal('reviewed-nba-roster-2027-1'),reviewerUserId:z.uuid(),sourceProofs:z.array(z.object({sourceReference:observationSchema.shape.sourceReference,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(20),candidates:z.array(candidateSchema).max(1000),bridges:z.array(bridgeSchema).max(2000),expectedAliasHeads:z.array(aliasHeadSchema).max(3000)}).strict();
export type ReviewedRosterDiscoveryManifest=z.infer<typeof reviewedRosterDiscoverySchema>;

/** Convert the collision-reviewed direct-ID candidates and independently checked
 * crosswalk records. Name-only publisher matches never qualify on their own.
 * Empty expected heads are conservative: a pre-existing edge requires a new review.
 */
export function buildReviewedNbaRosterManifest(candidateReport:unknown,bridgeReport:unknown,sourceProofs:ReviewedRosterDiscoveryManifest['sourceProofs'],reviewerUserId:string){
 const input=z.object({rows:z.array(candidateSchema.extend({status:z.string(),nameCollisionIds:z.array(z.string()),existingCanonicalPlayerId:z.string().nullable()}).passthrough())}).passthrough().parse(candidateReport);
 const candidates=input.rows.filter(row=>row.status==='NEW_DIRECT_NBA_ID_REQUIRES_APPROVAL'&&!row.nameCollisionIds.length&&!row.existingCanonicalPlayerId).map(row=>candidateSchema.parse(Object.fromEntries(Object.keys(candidateSchema.shape).map(key=>[key,row[key as keyof typeof row]]))));
 const proposed=new Map(candidates.map(row=>[row.sourcePlayerId,row.proposedPlayerId]));
 const reviewed=z.object({rows:z.array(z.object({nbaPlayerId:z.string(),espnAthleteId:z.string(),status:z.string(),canonicalPlayerId:z.string().nullable(),officialBirthDates:z.array(z.string()),espnBirthDates:z.array(z.string())}).passthrough())}).passthrough().parse(bridgeReport);
 const verifiedRows=reviewed.rows.flatMap((row,index)=>{
  if(!['VERIFIED_DOB_CURRENT_TEAM','VERIFIED_HISTORICAL_DOB_CURRENT_ESPN_PROFILE'].includes(row.status))return[];
  const playerId=row.canonicalPlayerId??proposed.get(row.nbaPlayerId);if(!playerId)throw Error('A verified bridge lacks an existing or proposed canonical player.');
  if(row.officialBirthDates.length!==1||row.espnBirthDates.length!==1||row.officialBirthDates[0]!==row.espnBirthDates[0])throw Error('Name-only or conflicting birth-date bridges cannot be reviewed as verified.');
  return[bridgeSchema.parse({nbaPlayerId:row.nbaPlayerId,espnAthleteId:row.espnAthleteId,playerId,birthDate:row.officialBirthDates[0],basis:row.status,sourceRows:[index+1]})];
 });
 const groups=new Map<string,z.infer<typeof bridgeSchema>[]>();for(const row of verifiedRows)groups.set(row.espnAthleteId,[...(groups.get(row.espnAthleteId)??[]),row]);
 const bridges=[...groups.values()].map(rows=>{
  const semantics=new Set(rows.map(row=>fingerprint({...row,sourceRows:[]})));if(semantics.size!==1)throw Error('Conflicting provider alias targets/evidence require quarantine, not duplicate selection.');
  const value=rows.reduce((left,right)=>({...left,sourceRows:[...left.sourceRows,...right.sourceRows]}));
  return{...value,sourceRows:[...new Set(value.sourceRows)].sort((a,b)=>a-b)};
 }).sort((a,b)=>a.espnAthleteId.localeCompare(b.espnAthleteId));
 const expectedAliasHeads=[...candidates.map(row=>({provider:'v9-historical' as const,externalId:row.sourcePlayerId,expectedPlayerId:null,expectedResolutionId:null})),...bridges.map(row=>({provider:'espn' as const,externalId:row.espnAthleteId,expectedPlayerId:null,expectedResolutionId:null}))];
 return reviewedRosterDiscoverySchema.parse({version:'reviewed-nba-roster-2027-1',reviewerUserId,sourceProofs,candidates,bridges,expectedAliasHeads});
}

/** Lower-level transaction entry for a separately approved consolidated deployment.
 * Caller owns isolation/production authorization and ordered sport locks. This
 * function still requires an exact part fingerprint and never rewrites old rows.
 */
export async function reconcileReviewedRosterInTransaction(tx:Tx,raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 const manifest=reviewedRosterDiscoverySchema.parse(raw),targetFingerprint=fingerprint(manifest);
 if(!manifest.candidates.length&&!manifest.bridges.length)throw Error('An empty roster target cannot be reviewed as a backfill.');
 if(approval&&approval.expectedFingerprint!==targetFingerprint)throw Error('Reviewed roster manifest changed.');
 const receipt=await tx.professionalDataObservation.findFirst({where:{provider:'reviewed-nba-roster',sport:'NBA',category:'REVIEWED_ROSTER_DISCOVERY',entityKey:`roster-review:${targetFingerprint}`,revisionToken:targetFingerprint,contentHash:targetFingerprint},include:{decisions:{orderBy:{version:'desc'},take:1}}});
 if(receipt?.decisions[0]?.outcome==='ACCEPTED')return{fingerprint:targetFingerprint,newPlayers:0,newAliases:0,alreadyApplied:true,applied:false,eligibilityChanges:0,sourcePublicationChanges:0};
 if(!await tx.user.findUnique({where:{id:manifest.reviewerUserId},select:{id:true}}))throw Error('Roster discovery requires an existing audited reviewer.');
 const ids=manifest.candidates.map(row=>row.proposedPlayerId),sourceIds=manifest.candidates.map(row=>row.sourcePlayerId);
 if(new Set(ids).size!==ids.length||new Set(sourceIds).size!==sourceIds.length||new Set(manifest.candidates.map(row=>row.displayName.toLowerCase())).size!==manifest.candidates.length)throw Error('Duplicate proposed identity or name requires manual review.');
 if(await tx.player.findFirst({where:{OR:[{id:{in:ids}},...manifest.candidates.map(row=>({sport:'NBA' as const,displayName:{equals:row.displayName,mode:'insensitive' as const}}))]},select:{id:true}}))throw Error('An existing canonical ID or name conflicts with the reviewed new-player target.');
 const proposed=new Map(manifest.candidates.map(row=>[row.sourcePlayerId,row.proposedPlayerId]));
 const aliases=[...manifest.candidates.map(row=>({provider:'v9-historical' as const,externalId:row.sourcePlayerId,playerId:row.proposedPlayerId})),...manifest.bridges.map(row=>({provider:'espn' as const,externalId:row.espnAthleteId,playerId:row.playerId}))];
 const aliasKeys=aliases.map(row=>`${row.provider}:${row.externalId}`),headKeys=manifest.expectedAliasHeads.map(row=>`${row.provider}:${row.externalId}`);
 if(new Set(aliasKeys).size!==aliasKeys.length||new Set(headKeys).size!==headKeys.length||aliasKeys.length!==headKeys.length||aliasKeys.some(key=>!headKeys.includes(key)))throw Error('Reviewed alias/head target sets disagree.');
 const nbaByEspn=new Map<string,string>(),espnByNba=new Map<string,string>();
 for(const bridge of manifest.bridges){
  if((nbaByEspn.has(bridge.espnAthleteId)&&nbaByEspn.get(bridge.espnAthleteId)!==bridge.nbaPlayerId)||(espnByNba.has(bridge.nbaPlayerId)&&espnByNba.get(bridge.nbaPlayerId)!==bridge.espnAthleteId))throw Error('Contradictory one-to-one provider bridge.');
  nbaByEspn.set(bridge.espnAthleteId,bridge.nbaPlayerId);espnByNba.set(bridge.nbaPlayerId,bridge.espnAthleteId);
  if(proposed.has(bridge.nbaPlayerId)){if(proposed.get(bridge.nbaPlayerId)!==bridge.playerId)throw Error('A new-player bridge changed its reviewed canonical target.');}
  else {const current=await professionalPlayerIdentityState(tx,'NBA',{provider:'v9-historical',externalId:bridge.nbaPlayerId},at);if(current.status!=='RESOLVED'||current.mapping?.playerId!==bridge.playerId)throw Error('The established NBA canonical identity changed since review.');if(!await tx.player.findFirst({where:{id:bridge.playerId,sport:'NBA',isSynthetic:false,isDemo:false},select:{id:true}}))throw Error('A real-source bridge cannot promote a synthetic/demo canonical identity.');}
 }
 for(const head of manifest.expectedAliasHeads){
  const state=await professionalPlayerIdentityState(tx,'NBA',{provider:head.provider,externalId:head.externalId},at),target=aliases.find(alias=>alias.provider===head.provider&&alias.externalId===head.externalId)!;
  if(state.status==='CONFLICT'||state.status==='RETRACTED'||(state.mapping?.playerId??null)!==head.expectedPlayerId||state.resolutionId!==head.expectedResolutionId)throw Error('A reviewed identity edge/head changed or was retracted.');
  if(state.mapping&&state.mapping.playerId!==target.playerId)throw Error('A provider alias already belongs to a different canonical player.');
 }
 const existing=await tx.playerExternalId.findMany({where:{sport:'NBA',OR:aliases.map(row=>({provider:row.provider,externalId:row.externalId}))}}),existingKeys=new Set(existing.map(row=>`${row.provider}:${row.externalId}`));
 const newAliases=aliases.filter(row=>!existingKeys.has(`${row.provider}:${row.externalId}`));
 const report={fingerprint:targetFingerprint,newPlayers:manifest.candidates.length,newAliases:newAliases.length,alreadyApplied:false,applied:Boolean(approval),eligibilityChanges:0,sourcePublicationChanges:0};
 if(!approval)return report;
 if(manifest.candidates.length)await tx.player.createMany({data:manifest.candidates.map(row=>({id:row.proposedPlayerId,sport:'NBA',displayName:row.displayName,isSynthetic:false,isDemo:false}))});
 if(newAliases.length)await tx.playerExternalId.createMany({data:newAliases.map(row=>({...row,sport:'NBA'}))});
 const observation=await tx.professionalDataObservation.create({data:{provider:'reviewed-nba-roster',sport:'NBA',category:'REVIEWED_ROSTER_DISCOVERY',entityKey:`roster-review:${targetFingerprint}`,revisionToken:targetFingerprint,revisionOrdinal:1n,contentHash:targetFingerprint,sourceReference:manifest.sourceProofs[0].sourceReference,observedAt:at,effectiveAt:null,publishedAt:null,raw:{manifest,reviewFingerprint:targetFingerprint,knownAtSemantics:'LOCAL_REVIEW_EVENT_NOT_OFFICIAL_PUBLICATION'},normalized:{kind:'REVIEWED_ROSTER_DISCOVERY',newPlayerIds:ids,aliases,eligibilityPositionsGranted:[]}}});
 await tx.professionalDataDecision.create({data:{observationId:observation.id,version:1,outcome:'ACCEPTED',reason:'Exact reviewed direct NBA identities and independently corroborated provider bridges; no name-only merge or eligibility promotion.',targets:{reviewerUserId:manifest.reviewerUserId,reviewFingerprint:targetFingerprint,newPlayerIds:ids,aliases},decidedAt:at}});
 return{...report,newAliases:newAliases.length};
}

export async function reconcileReviewedRoster(raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 if(approval){const{assertIsolatedIngestionDatabase}=await import('@/ingestion/persist');assertIsolatedIngestionDatabase();}
 return getDatabase().$transaction(async tx=>{if(approval)await lockSport(tx,'NBA');else await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileReviewedRosterInTransaction(tx,raw,approval,at);},{isolationLevel:'Serializable',timeout:120000});
}
