import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { getDatabase } from '@/lib/db';
import { fingerprint, contentFingerprint, observationSchema } from '@/ingestion/contracts';
import { assertIsolatedIngestionDatabase, persistObservationInTransaction } from '@/ingestion/persist';
import { professionalPlayerIdentityState } from '@/ingestion/identity-resolutions';
import { hashFile } from '@/imports/csv';
import { loadMlbPositionContinuation } from '@/ingestion/mlb-position-continuation';
import { reconcileMlbCounts } from '@/ingestion/position-recovery';
import { applyCompetitiveStages, type ReviewedCompetitiveStages } from '@/ingestion/open-data/apply-competitive-stages';
import { lockSport } from './sport-lock';
const genericGuard=z.object({provider:z.string(),sport:z.enum(['NFL','MLB','NBA','NHL']),entityKey:z.string(),expectedPlayerId:z.string(),expectedSeasonId:z.string(),expectedResolutionId:z.string().nullable(),expectedTeamId:z.string().nullable(),expectedAcceptedHeadId:z.string().nullable()}).strict();
const source=z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),localPath:z.string().optional()}).passthrough();
const generic=z.object({version:z.literal('reviewed-player-snapshot-promotion-1'),sourceProofs:z.array(source),observations:z.array(observationSchema),canonicalGuards:z.array(genericGuard)}).passthrough();
const nba=z.object({manifest:z.object({sourceProofs:z.array(source),targets:z.array(z.object({playerId:z.string(),expectedAlias:z.object({provider:z.string(),externalId:z.string(),expectedPlayerId:z.string(),expectedResolutionId:z.string().nullable()}),expectedPositionObservations:z.array(z.object({id:z.string(),contentHash:z.string()})),observation:observationSchema}).passthrough())}).passthrough(),report:z.object({targetFingerprint:z.string()}).passthrough()});
const calendar=z.object({version:z.literal('reviewed-announced-season-date-promotion-1'),observations:z.array(observationSchema)}).passthrough();
export const operationalPromotionSchema=z.object({version:z.literal('reviewed-operational-data-promotion-1'),generic,nba,calendar,competitive:z.json().optional()}).strict();
export type OperationalPromotion=z.infer<typeof operationalPromotionSchema>;
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const key=(row:{provider:string;sport:string;entityKey:string})=>`${row.sport}:${row.provider}:${row.entityKey}`;
export async function validateOperationalPromotionSources(raw:unknown){
 const batch=operationalPromotionSchema.parse(raw);
 if(fingerprint(batch.nba.manifest)!==batch.nba.report.targetFingerprint)throw Error('NBA component differs from its reviewed target.');
 for(const proof of new Map([...batch.generic.sourceProofs,...batch.nba.manifest.sourceProofs].map(proof=>[proof.sha256,proof])).values()){
  if(proof.localPath){if(!['data/raw/recovered/mlb_positions_repaired.csv','data/raw/recovered/mlb_2016_2026_final.csv'].includes(proof.localPath)||await hashFile(proof.localPath)!==proof.sha256)throw Error('Reviewed recovered source changed.');}
  else if(sha(await readFile(`data/provider_previews/objects/${proof.sha256}`))!==proof.sha256)throw Error('Reviewed immutable provider object changed.');
 }
 const known=new Set(batch.generic.sourceProofs.map(proof=>proof.sha256));
 for(const observation of batch.generic.observations)if(observation.normalized.kind!=='PLAYER_SNAPSHOT'||!known.has(observation.normalized.sourceFingerprint))throw Error('Generic target lacks a declared immutable source.');
 for(const observation of batch.calendar.observations){const n=observation.normalized;if(n.kind!=='SEASON_DATE_SNAPSHOT'||fingerprint(observation.raw.reviewedFacts)!==n.reviewedFactsFingerprint)throw Error('Calendar fact fingerprint mismatch.');const fact=observation.raw.reviewedFacts as Record<string,unknown>;if(fact.sport!==observation.sport||fact.seasonStartYear!==n.seasonStartYear||fact.regularSeasonStartsOn!==n.regularSeasonStartsOn||fact.regularSeasonEndsOn!==n.regularSeasonEndsOn||fact.sourceZone!==n.sourceZone||fact.sourceReference!==observation.sourceReference)throw Error('Calendar normalized fields differ from reviewed primary-source facts.');}
 const recovered=parse(await readFile('data/raw/recovered/mlb_positions_repaired.csv'),{columns:true,skip_empty_lines:true}) as Record<string,string>[];
 let validatedDirect=false;
 const extra=JSON.parse(await readFile('data/position_enrichment/mlb_position_additional_source_proposal.json','utf8'));
 for(const observation of batch.generic.observations){const n=observation.normalized;if(n.kind!=='PLAYER_SNAPSHOT'||n.facet.type!=='POSITION_AGGREGATE')continue;const f=n.facet;
  if(f.sourceRows.every(line=>line.startsWith('recovered-mlb-position:'))){for(const proof of f.sourceRows){const [,line,hash]=proof.split(':'),data={...recovered[Number(line)-2]};if(!data.player_id||fingerprint(data)!==hash||data.player_id!==n.player.externalId||Number(data.season)!==f.evidenceSeasonStartYear||data.team_id!==f.sourceTeamId)throw Error('Independent MLB count proof differs from recovered row.');const supported=reconcileMlbCounts([{line:Number(line),data}]);if(!supported.positions.includes(f.code))throw Error('Recovered row does not independently prove the claimed position threshold.');const counts=supported.teams[0]?.counts;if(!counts||f.appearances!==counts[f.code]||f.starts!==(f.code==='SP'?counts.SP:f.code==='RP'?0:null))throw Error('MLB aggregate counts changed from explicit source fields.');}}
  else {if(!validatedDirect){await loadMlbPositionContinuation();validatedDirect=true;}const candidate=extra.historicalRoleCandidates.find((row:{sourcePlayerId:string})=>row.sourcePlayerId===n.player.externalId);const games=candidate?.explicit2026Pitching.games.filter((game:{started:boolean})=>f.code==='SP'?game.started:!game.started);if(!candidate||!['SP','RP'].includes(f.code)||f.evidenceSeasonStartYear!==2026||games.length!==f.appearances||f.starts!==(f.code==='SP'?games.length:0))throw Error('Distinct-game pitching count proof changed.');const proofRows=games.flatMap((game:{proofs:{sourceLine:number;rowSha256:string}[]})=>game.proofs.map(proof=>`recovered-mlb-stat:${proof.sourceLine}:${proof.rowSha256}`));if(fingerprint(proofRows)!==fingerprint(f.sourceRows))throw Error('Distinct-game source rows changed.');}
 }
 return batch;
}
export async function reconcileOperationalPromotionInTransaction(tx:Prisma.TransactionClient,raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 const batch=operationalPromotionSchema.parse(raw),reviewed=fingerprint(batch);
 if(approval&&approval.expectedFingerprint!==reviewed)throw Error('Operational promotion batch changed since exact review.');
 if(approval)for(const sport of ['NFL','MLB','NBA','NHL'] as const)await lockSport(tx,sport);
 const observations=[...batch.calendar.observations,...batch.nba.manifest.targets.map(target=>target.observation),...batch.generic.observations];
 const keys=observations.map(key);if(new Set(keys).size!==keys.length)throw Error('Duplicate operational source stream in reviewed target.');
 const existing=await tx.professionalDataObservation.findMany({where:{provider:{in:[...new Set(observations.map(row=>row.provider))]},category:{in:['PLAYER_SNAPSHOT','NBA_POSITION_SNAPSHOT','SEASON_DATE_SNAPSHOT']},entityKey:{in:observations.map(row=>row.entityKey)}},include:{decisions:{orderBy:{version:'desc'}}}});
 const existingByStream=new Map<string,typeof existing>();for(const row of existing){const stream=key(row);existingByStream.set(stream,[...(existingByStream.get(stream)??[]),row]);}
 const already=new Set(observations.filter(input=>(existingByStream.get(key(input))??[]).some(row=>row.revisionToken===input.revisionToken&&row.contentHash===contentFingerprint(input)&&row.decisions.some(decision=>decision.outcome==='ACCEPTED'))).map(key));
 if(already.size===observations.length){const competitive=batch.competitive?await applyCompetitiveStages(tx,batch.competitive as unknown as ReviewedCompetitiveStages,approval?{expectedFingerprint:fingerprint(batch.competitive)}:undefined,at):null;return{fingerprint:reviewed,changes:0,alreadyApplied:already.size,applied:false,observationAppends:0,decisionAppends:0,availabilityAppends:0,rookieAppends:0,seasonAppends:0,competitive};}
 const [seasonRows,teamRows,actors]=await Promise.all([tx.season.findMany({select:{id:true,sport:true,startYear:true}}),tx.proTeam.findMany({select:{id:true,sport:true,provider:true,externalId:true}}),tx.player.findMany({where:{id:{in:[...new Set([...batch.generic.canonicalGuards.map(guard=>guard.expectedPlayerId),...batch.nba.manifest.targets.map(target=>target.playerId)])]}},select:{id:true,sport:true,isSynthetic:true,isDemo:true}})]);
 const seasons=new Map(seasonRows.map(row=>[`${row.sport}:${row.startYear}`,row.id])),teams=new Map(teamRows.map(row=>[`${row.sport}:${row.provider}:${row.externalId}`,row.id])),actorMap=new Map(actors.map(row=>[row.id,row]));
 const identities=new Map<string,Awaited<ReturnType<typeof professionalPlayerIdentityState>>>();
 const identity=async(sport:import('@/generated/prisma/enums').Sport,reference:{provider:string;externalId:string})=>{const lookup=`${sport}:${reference.provider}:${reference.externalId}`;let result=identities.get(lookup);if(!result){result=await professionalPlayerIdentityState(tx,sport,{provider:reference.provider,externalId:reference.externalId},at);identities.set(lookup,result);}return result;};
 const guards=new Map(batch.generic.canonicalGuards.map(guard=>[key(guard),guard]));if(guards.size!==batch.generic.observations.length)throw Error('Generic canonical guards are incomplete or duplicated.');
 for(const input of batch.generic.observations){if(already.has(key(input)))continue;const n=input.normalized;if(n.kind!=='PLAYER_SNAPSHOT')throw Error('Unexpected generic observation category.');const guard=guards.get(key(input));if(!guard)throw Error('Missing canonical snapshot guard.');const current=await identity(input.sport,n.player);if(current.status!=='RESOLVED'||current.mapping?.playerId!==guard.expectedPlayerId||current.resolutionId!==guard.expectedResolutionId||actorMap.get(guard.expectedPlayerId)?.sport!==input.sport||actorMap.get(guard.expectedPlayerId)?.isSynthetic||actorMap.get(guard.expectedPlayerId)?.isDemo)throw Error('Reviewed player identity/head changed.');const season=seasons.get(`${input.sport}:${n.seasonStartYear}`);if(season!==guard.expectedSeasonId)throw Error('Reviewed target season changed.');if(n.facet.type==='TEAM_ASSIGNMENT'){const team=teams.get(`${input.sport}:${n.facet.team.provider}:${n.facet.team.externalId}`);if(team!==guard.expectedTeamId)throw Error('Reviewed canonical team changed.');}const head=(existingByStream.get(key(input))??[]).filter(row=>row.decisions[0]?.outcome==='ACCEPTED').sort((a,b)=>a.revisionOrdinal===b.revisionOrdinal?0:(a.revisionOrdinal??-1n)>(b.revisionOrdinal??-1n)?-1:1)[0];if((head?.id??null)!==guard.expectedAcceptedHeadId)throw Error('Reviewed accepted source head changed.');}
 for(const target of batch.nba.manifest.targets){if(already.has(key(target.observation)))continue;const current=await identity('NBA',{provider:target.expectedAlias.provider,externalId:target.expectedAlias.externalId});if(current.status!=='RESOLVED'||current.mapping?.playerId!==target.playerId||current.resolutionId!==target.expectedAlias.expectedResolutionId||actorMap.get(target.playerId)?.sport!=='NBA'||actorMap.get(target.playerId)?.isSynthetic||actorMap.get(target.playerId)?.isDemo)throw Error('Reviewed NBA alias changed.');const prior=await tx.professionalDataObservation.findMany({where:{sport:'NBA',category:'NBA_POSITION_SNAPSHOT',decisions:{some:{targets:{path:['playerId'],equals:target.playerId}}}},select:{id:true,contentHash:true}});if(fingerprint(prior.sort((a,b)=>a.id.localeCompare(b.id)))!==fingerprint(target.expectedPositionObservations))throw Error('Reviewed NBA position evidence changed.');}
 for(const input of batch.calendar.observations){if(already.has(key(input)))continue;if((existingByStream.get(key(input))??[]).some(row=>row.decisions[0]?.outcome==='ACCEPTED'))throw Error('A new calendar source head requires fresh exact review.');}
 const pending=observations.filter(input=>!already.has(key(input))),availabilityAppends=pending.filter(input=>input.normalized.kind==='PLAYER_SNAPSHOT'&&input.normalized.facet.type==='AVAILABILITY').length,rookieAppends=pending.filter(input=>input.normalized.kind==='PLAYER_SNAPSHOT'&&input.normalized.facet.type==='ROOKIE').length;
 const newSeasons=new Set<string>();for(const input of batch.calendar.observations){const n=input.normalized;if(n.kind!=='SEASON_DATE_SNAPSHOT')throw Error('Unexpected reviewed calendar category.');if(!seasons.has(`${input.sport}:${n.seasonStartYear}`))newSeasons.add(`${input.sport}:${n.seasonStartYear}`);}
 const report={fingerprint:reviewed,changes:pending.length,alreadyApplied:already.size,applied:Boolean(approval),observationAppends:pending.length,decisionAppends:pending.length,availabilityAppends,rookieAppends,seasonAppends:newSeasons.size};
 if(!approval){const competitive=batch.competitive?await applyCompetitiveStages(tx,batch.competitive as unknown as ReviewedCompetitiveStages,undefined,at):null;return{...report,competitive};}
 for(const input of pending){const result=await persistObservationInTransaction(tx,input,at);if(result.outcome!=='ACCEPTED')throw Error(`Operational target rejected atomically: ${input.sport}/${input.normalized.kind}: ${result.reason}`);}
 const competitive=batch.competitive?await applyCompetitiveStages(tx,batch.competitive as unknown as ReviewedCompetitiveStages,{expectedFingerprint:fingerprint(batch.competitive)},at):null;
 return{...report,competitive};
}
export async function reconcileOperationalPromotion(raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 if(approval)assertIsolatedIngestionDatabase();
 const batch=await validateOperationalPromotionSources(raw);
 return getDatabase().$transaction(async tx=>{if(!approval)await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileOperationalPromotionInTransaction(tx,batch,approval,at);},{isolationLevel:'Serializable',timeout:600000});
}
