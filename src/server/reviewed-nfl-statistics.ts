import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { professionalPlayerIdentityState } from '@/ingestion/identity-resolutions';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { normalizeHistoricalRow, type RawRow } from '@/imports/normalize';
import { lockSport } from './sport-lock';

const rowSchema=z.object({sourceLine:z.number().int().min(2),sourcePlayerId:z.string(),sourceGameId:z.string(),playerId:z.uuid(),gameId:z.uuid(),teamId:z.uuid(),role:z.literal('FOOTBALL'),newPlayerDependency:z.boolean(),observedPositions:z.array(z.string()),normalized:z.record(z.string(),z.number().nullable()),raw:z.record(z.string(),z.string()),sourceKnownAt:z.null(),existingCanonicalStatCount:z.literal(0)}).passthrough();
const bridgeSchema=z.object({sourceGameId:z.string(),canonicalGameId:z.uuid(),provider:z.literal('schedule-v5'),externalId:z.string(),seasonId:z.uuid(),officialWeek:z.number(),phase:z.string(),gameDate:z.string().nullable(),startsAt:z.string().nullable(),participants:z.array(z.object({teamId:z.uuid(),provider:z.string(),externalId:z.string(),code:z.string(),side:z.enum(['HOME','AWAY'])})),acceptedObservation:z.object({id:z.uuid(),contentHash:z.string(),sourceRecord:z.json()}),discovery:z.literal('EXISTING'),actualStartClaim:z.literal(false)}).passthrough();
const schema=z.object({version:z.literal('nfl-v5-existing-game-stat-continuation-1'),sourceProof:z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/)}).passthrough(),identityDependencyFingerprint:z.string(),gameBridges:z.array(bridgeSchema).min(1),rows:z.array(rowSchema).min(1).max(1000)}).passthrough();
type Approval={expectedFingerprint:string};
export type PlannedNflPlayerDependencies=ReadonlyMap<string,string>;
const provider='nflverse-reviewed-historical', importerVersion='nfl-v5-existing-game-stat-continuation-1';

/** Caller owns approval and transaction isolation; only exact absent historical records are appended. */
export async function reconcileReviewedNflStatisticsInTransaction(tx:Prisma.TransactionClient,raw:unknown,approval?:Approval,plannedPlayerDependencies:PlannedNflPlayerDependencies=new Map()){
 const manifest=schema.parse(raw),targetFingerprint=fingerprint(raw);
 if(approval?.expectedFingerprint!==undefined&&approval.expectedFingerprint!==targetFingerprint)throw Error('Reviewed NFL statistics manifest changed.');
 const bytes=await readFile(`data/provider_previews/objects/${manifest.sourceProof.sha256}`);
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sourceProof.sha256)throw Error('Reviewed NFL source body changed.');
 const sourceRows=parse(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes,{columns:true,skip_empty_lines:true,bom:true}) as RawRow[];
 const keys=manifest.rows.map(row=>`${row.gameId}:${row.playerId}`);
 if(new Set(keys).size!==keys.length)throw Error('Duplicate reviewed NFL statistic.');
 const batch=await tx.importBatch.findUnique({where:{sport_provider_contentHash_importerVersion:{sport:'NFL',provider,contentHash:targetFingerprint,importerVersion}}});
 const games=await tx.game.findMany({where:{id:{in:manifest.gameBridges.map(bridge=>bridge.canonicalGameId)}},include:{season:true,teams:{include:{team:true}},scheduleObservations:true}});
 const gameMap=new Map(games.map(game=>[game.id,game]));
 const existing=await tx.playerGameStat.findMany({where:{gameId:{in:manifest.rows.map(row=>row.gameId)},playerId:{in:manifest.rows.map(row=>row.playerId)},role:'FOOTBALL'}});
 const changes=[];let alreadyApplied=0;
 for(const row of manifest.rows){
  if(fingerprint(sourceRows[row.sourceLine-2])!==fingerprint(row.raw))throw Error('Reviewed NFL source line changed.');
  const normalized=normalizeHistoricalRow('NFL',row.raw,row.sourceLine),game=gameMap.get(row.gameId),bridge=manifest.gameBridges.find(value=>value.canonicalGameId===row.gameId);
  if(!game||!bridge||game.provider!=='schedule-v5'||game.externalId!==row.sourceGameId||bridge.sourceGameId!==row.sourceGameId||bridge.externalId!==game.externalId||bridge.seasonId!==game.seasonId||game.season.startYear!==normalized.season.startYear||game.week!==normalized.game.week||game.week!==bridge.officialWeek||game.phase!==normalized.game.phase||game.phase!==bridge.phase||(game.gameDate?.toISOString()??null)!==bridge.gameDate||(game.startsAt?.toISOString()??null)!==bridge.startsAt)throw Error('Reviewed NFL game tuple or accepted timestamp changed.');
  const participants=game.teams.map(link=>({teamId:link.teamId,provider:link.team.provider,externalId:link.team.externalId,code:link.team.code,side:link.side})).sort((a,b)=>a.side.localeCompare(b.side));
  if(fingerprint(participants)!==fingerprint(bridge.participants)||participants.length!==2||!participants.some(team=>team.teamId===row.teamId&&team.code===normalized.team.code&&team.side===normalized.team.side)||!participants.some(team=>team.code===normalized.opponent?.code&&team.side===normalized.opponent?.side))throw Error('Reviewed NFL participant changed.');
  const observation=game.scheduleObservations.find(value=>value.id===bridge.acceptedObservation.id);
  const schedule=observation?.sourceRecord as Record<string,unknown>|undefined;
  if(!schedule||schedule.game_id!==row.sourceGameId||String(schedule.season)!==row.raw.season||String(schedule.week)!==row.raw.week||schedule.home_team!==normalized.game.externalId.split('_')[3]||schedule.away_team!==normalized.game.externalId.split('_')[2])throw Error('Reviewed NFL schedule tuple lacks explicit source proof.');
  if(!observation||observation.contentHash!==bridge.acceptedObservation.contentHash||fingerprint(observation.sourceRecord)!==fingerprint(bridge.acceptedObservation.sourceRecord)||observation.scheduleExternalId!==row.sourceGameId||observation.scheduleProvider!=='schedule-v5')throw Error('Reviewed V5 source proof changed.');
  if(normalized.player.externalId!==row.sourcePlayerId||normalized.game.externalId!==row.sourceGameId||fingerprint(normalized.stats)!==fingerprint(row.normalized)||fingerprint(normalized.observedPositions)!==fingerprint(row.observedPositions))throw Error('Reviewed normalized NFL evidence changed.');
  const state=await professionalPlayerIdentityState(tx,'NFL',{provider:'v9-historical',externalId:row.sourcePlayerId},new Date());
  if(state.status!=='RESOLVED'||state.mapping?.playerId!==row.playerId){if(approval||!row.newPlayerDependency||state.mapping||state.status==='CONFLICT'||state.status==='RETRACTED'||plannedPlayerDependencies.get(row.sourcePlayerId)!==row.playerId)throw Error('Reviewed NFL player identity changed or lacks exact planned dependency.');}
  else if(!await tx.player.findFirst({where:{id:row.playerId,sport:'NFL',isDemo:false,isSynthetic:false},select:{id:true}}))throw Error('NFL historical target must be a real canonical player.');
  const prior=existing.filter(value=>value.gameId===row.gameId&&value.playerId===row.playerId);
  if(prior.length){if(prior.length===1&&batch&&prior[0].importBatchId===batch.id&&prior[0].contentHash===fingerprint(row)&&((prior[0].raw as {reviewedNflStatistics?:{targetFingerprint:string}}).reviewedNflStatistics?.targetFingerprint===targetFingerprint)){alreadyApplied++;continue;}throw Error('Existing canonical NFL statistics require a fresh review; no overwrite permitted.');}
  changes.push(row);
 }
 const report={fingerprint:targetFingerprint,changes:changes.length,alreadyApplied,applied:Boolean(approval),gameChanges:0,eligibilityChanges:0,scoreLedgerChanges:0};
 if(!approval||!changes.length)return report;
 const receipt=batch??await tx.importBatch.create({data:{sport:'NFL',provider,contentHash:targetFingerprint,importerVersion,sourceName:'Reviewed licensed NFL historical statistics on existing V5 games',summary:report}});
 await tx.playerGameStat.createMany({data:changes.map(row=>({gameId:row.gameId,playerId:row.playerId,teamId:row.teamId,importBatchId:receipt.id,provider:'v9-historical',role:'FOOTBALL',revision:1,contentHash:fingerprint(row),sourceLine:row.sourceLine,observedPositions:row.observedPositions,normalized:row.normalized,raw:{original:row.raw,reviewedNflStatistics:{targetFingerprint,sourceSha256:manifest.sourceProof.sha256,historicalPositionsOnly:true}},sourceKnownAt:null}))});
 return report;
}
export async function reconcileReviewedNflStatistics(raw:unknown,approval?:Approval,plannedPlayerDependencies?:PlannedNflPlayerDependencies){
 if(approval)assertIsolatedIngestionDatabase();
 return getDatabase().$transaction(async tx=>{if(approval)await lockSport(tx,'NFL');else await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileReviewedNflStatisticsInTransaction(tx,raw,approval,plannedPlayerDependencies);},{isolationLevel:'Serializable',timeout:120000});
}
