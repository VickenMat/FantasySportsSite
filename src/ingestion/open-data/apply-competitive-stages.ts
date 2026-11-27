import { readFile,realpath } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {validNbaGameBridge} from './nba-game-binding';
import type { Prisma } from '@/generated/prisma/client';
import { fingerprint,observationSchema,contentFingerprint } from '../contracts';
import { persistObservationInTransaction } from '../persist';
import { recalculateInTransaction } from '@/server/score-ledger';
import { getEligiblePositions } from '@/server/positions';
import { professionalGameProjection } from '@/server/professional-game-state';
import { historicalStatsForScoring } from '@/scoring/historical-evidence';
import type { StatValues } from '@/scoring/engine';
import { lockSport } from '@/server/sport-lock';
import { bindCompleteFinalBox,type CompetitiveGameStage } from './competitive-records';
import type { Sport } from '@/generated/prisma/enums';

type Tx=Prisma.TransactionClient;
type SourceHead={provider:string;sport:Sport;category:string;entityKey:string;observationId:string|null;contentHash:string|null;decisionVersion:number|null};
type LedgerHead={gameId:string;playerId:string;ledgerId:string|null;entryId:string|null};
export type ReviewedCompetitiveStages={version:'reviewed-competitive-stage-1';stages:CompetitiveGameStage[];sourceFiles:{path:string;sha256:string}[];expectedSourceHeads:SourceHead[];expectedLedgerHeads:LedgerHead[];requireCompleteBoxes:boolean};
async function sourceHead(tx:Tx,identity:Pick<SourceHead,'provider'|'sport'|'category'|'entityKey'>){const key={provider:identity.provider,sport:identity.sport,category:identity.category,entityKey:identity.entityKey};const head=await tx.professionalDataObservation.findFirst({where:key,orderBy:[{revisionOrdinal:'desc'},{observedAt:'desc'},{id:'desc'}],include:{decisions:{orderBy:{version:'desc'},take:1}}});return{...key,observationId:head?.id??null,contentHash:head?.contentHash??null,decisionVersion:head?.decisions[0]?.version??null};}
async function ledgerHead(tx:Tx,gameId:string,playerId:string){const ledger=await tx.scoreLedger.findFirst({where:{gameId,playerId,preset:{version:'ubp-v9-experimental'}},include:{entries:{orderBy:{sequence:'desc'},take:1}}});return{gameId,playerId,ledgerId:ledger?.id??null,entryId:ledger?.entries[0]?.id??null};}
export async function buildReviewedCompetitiveStages(tx:Tx,stages:CompetitiveGameStage[],sourceFiles:ReviewedCompetitiveStages['sourceFiles'],requireCompleteBoxes=false):Promise<ReviewedCompetitiveStages>{
 const expectedSourceHeads:SourceHead[]=[],expectedLedgerHeads:LedgerHead[]=[];
 for(const stage of stages)for(const record of stage.records){expectedSourceHeads.push(await sourceHead(tx,{provider:record.provider,sport:record.sport,category:record.normalized.kind,entityKey:record.entityKey}));if(record.normalized.kind==='STAT'){const match=/^stat:([^:]+):([^:]+):/.exec(record.entityKey);if(!match)throw Error('Invalid canonical statistical stream.');expectedLedgerHeads.push(await ledgerHead(tx,match[1],match[2]));}}
 return{version:'reviewed-competitive-stage-1',stages,sourceFiles,expectedSourceHeads,expectedLedgerHeads,requireCompleteBoxes};
}
/** Lower-level exact reviewed transaction entry; caller owns development authorization.
 * All source files, stream heads, identities and score heads are checked before writes. */
export async function applyCompetitiveStages(tx:Tx,manifest:ReviewedCompetitiveStages,approval?:{expectedFingerprint:string},at=new Date()){
 if(manifest.version!=='reviewed-competitive-stage-1'||!manifest.stages.length||manifest.stages.length>10)throw Error('Review a bounded one-to-ten-game competitive stage batch.');
 const targetFingerprint=fingerprint(manifest);if(approval&&approval.expectedFingerprint!==targetFingerprint)throw Error('Reviewed competitive source target changed.');
 const base=await realpath(resolve('data/provider_previews'));
 for(const source of manifest.sourceFiles){const path=await realpath(resolve(source.path));if(!path.startsWith(base+sep)||! /^[a-f0-9]{64}$/.test(source.sha256))throw Error('Competitive source proof must reference retained workspace data.');if(createHash('sha256').update(await readFile(path)).digest('hex')!==source.sha256)throw Error('Reviewed immutable competitive source body changed.');}
 const receipt=await tx.professionalDataObservation.findFirst({where:{provider:'internal-reviewed-source',category:'COMPETITIVE_STAGE_BATCH',entityKey:`competitive-stage-batch:${targetFingerprint}`,contentHash:targetFingerprint},include:{decisions:{orderBy:{version:'desc'},take:1}}});
 if(receipt?.decisions[0]?.outcome==='ACCEPTED')return{fingerprint:targetFingerprint,alreadyApplied:true,sourceObservations:0,newStatistics:0,newScoreEntries:0,completeBoxes:0,pendingBoxes:0,applied:false};
 for(const stage of manifest.stages){
  const game=await tx.game.findUniqueOrThrow({where:{id:stage.game.id},include:{season:true,teams:{include:{team:true}}}});
  if(game.provider!==stage.game.provider||game.externalId!==stage.game.externalId||game.sport!==stage.game.sport||game.season.startYear!==stage.game.seasonYear||game.phase!==stage.game.phase||game.week!==stage.game.week||(game.startsAt?.toISOString()??null)!==stage.game.scheduledStartsAt||(game.gameDate?.toISOString().slice(0,10)??null)!==stage.game.gameDate)throw Error('Reviewed canonical professional game changed.');
  if(game.teams.length!==stage.game.teams.length||game.teams.some(link=>!stage.game.teams.some(team=>team.id===link.teamId&&team.code===link.team.code&&team.provider===link.team.provider&&team.externalId===link.team.externalId&&(link.side==='UNKNOWN'||link.side===team.side))))throw Error('Reviewed canonical game participants changed.');
  if(stage.game.participantSideEvidence){const proof=await tx.gameScheduleObservation.findUnique({where:{id:stage.game.participantSideEvidence.observationId}});if(!proof||proof.gameId!==game.id||proof.contentHash!==stage.game.participantSideEvidence.contentHash)throw Error('Accepted participant side proof changed.');}
  if(stage.game.gameIdentityEvidence){
   const bridge=stage.game.gameIdentityEvidence,source=manifest.sourceFiles.find(source=>source.sha256===bridge.sourceSha256);
   if(stage.game.sport!=='NBA'||!source)throw Error('Explicit NBA game bridge lacks retained source bytes.');
   const rows=parse(await readFile(source.path),{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
   const matches=rows.filter(row=>row.nba_game_id===bridge.sourceGameId);
   if(matches.length!==1||fingerprint(matches[0])!==fingerprint(bridge.crosswalk)||!validNbaGameBridge(stage.game,stage.records[0].raw.sourceRecord as Record<string,string>,bridge))throw Error('Reviewed NBA game ID bridge changed or is ambiguous.');
   const proof=await tx.gameScheduleObservation.findUnique({where:{id:bridge.observationId},include:{importBatch:true}});
   if(!proof||proof.gameId!==game.id||proof.contentHash!==bridge.observationHash||proof.scheduleExternalId!==bridge.crosswalk.espn_game_id||proof.scheduleProvider!=='schedule-v5'||proof.importBatch.status!=='COMPLETE'||proof.importBatch.importerVersion!=='schedule-v5-1'||proof.gameDate.toISOString().slice(0,10)!==bridge.crosswalk.game_date)throw Error('Reviewed accepted V5 game bridge changed.');
   const sourceRecord=proof.sourceRecord as Record<string,unknown>;
   if(sourceRecord.home_team_id!==bridge.crosswalk.home_espn_team_id||sourceRecord.away_team_id!==bridge.crosswalk.away_espn_team_id)throw Error('Reviewed V5 participant IDs differ from the explicit NBA bridge.');
   const latest=await tx.gameScheduleObservation.findMany({where:{gameId:game.id,scheduleProvider:'schedule-v5',scheduleExternalId:proof.scheduleExternalId,importBatch:{status:'COMPLETE',importerVersion:'schedule-v5-1'}},orderBy:{retrievedAt:'desc'}});
   if(latest.some(row=>row.retrievedAt>=proof.retrievedAt&&(row.contentHash!==proof.contentHash)))throw Error('Newer or conflicting V5 game bridge requires fresh review.');
  }
  const hashes=(stage.records[0]?.raw.sourceProofs??[]) as {sha256:string}[];if(!hashes.length||hashes.some(proof=>!manifest.sourceFiles.some(source=>source.sha256===proof.sha256)))throw Error('Every staged source proof requires its exact retained bytes.');
 }
 const records=manifest.stages.flatMap(stage=>stage.records.map(record=>observationSchema.parse(record)));
 if(new Set(records.map(record=>`${record.provider}:${record.sport}:${record.entityKey}`)).size!==records.length)throw Error('Duplicate source stream in reviewed competitive target.');
 for(const stage of manifest.stages)for(const record of stage.records)if(!('game' in record.normalized)||!record.normalized.game||record.normalized.game.provider!==stage.game.provider||record.normalized.game.externalId!==stage.game.externalId||record.revisionToken!==stage.sourceFingerprint||(record.normalized.kind==='STAT'&&!record.entityKey.startsWith(`stat:${stage.game.id}:`)))throw Error('Source record escaped its reviewed canonical game binding.');
 if(manifest.expectedSourceHeads.length!==records.length)throw Error('Every reviewed source stream requires an exact old head.');
 for(const record of records){if(!['GAME_STATE','STAT'].includes(record.normalized.kind)||new Date(record.observedAt)>at)throw Error('Only already observed game-state and statistical records qualify.');const expected=manifest.expectedSourceHeads.find(head=>head.provider===record.provider&&head.sport===record.sport&&head.category===record.normalized.kind&&head.entityKey===record.entityKey);if(!expected||fingerprint(await sourceHead(tx,expected))!==fingerprint(expected))throw Error('Reviewed competitive source stream head changed.');}
 for(const expected of manifest.expectedLedgerHeads)if(fingerprint(await ledgerHead(tx,expected.gameId,expected.playerId))!==fingerprint(expected))throw Error('Reviewed global scoring head changed.');
 for(const record of records){if(record.normalized.kind!=='STAT'||typeof record.raw.historicalStatId!=='string')continue;const prior=await tx.playerGameStat.findUnique({where:{id:record.raw.historicalStatId}});if(!prior||prior.contentHash!==record.raw.priorContentHash||prior.role!==record.normalized.role||prior.provider!=='v9-historical'||record.entityKey!==`stat:${prior.gameId}:${prior.playerId}:${prior.role}`||fingerprint(historicalStatsForScoring({...prior,normalized:prior.normalized as StatValues}))!==fingerprint(record.normalized.stats))throw Error('Reviewed accepted historical statistical evidence changed.');const latest=await tx.playerGameStat.findFirst({where:{gameId:prior.gameId,playerId:prior.playerId,role:prior.role,provider:prior.provider},orderBy:{revision:'desc'}});if(latest?.id!==prior.id)throw Error('A newer accepted historical revision requires fresh source review.');}
 const expectedStatCount=records.filter(record=>record.normalized.kind==='STAT').length;
 if(new Set(manifest.expectedLedgerHeads.map(head=>`${head.gameId}:${head.playerId}`)).size!==manifest.expectedLedgerHeads.length)throw Error('Duplicate reviewed ledger head.');
 if(records.some(record=>record.normalized.kind==='STAT'&&!manifest.expectedLedgerHeads.some(head=>record.entityKey.startsWith(`stat:${head.gameId}:${head.playerId}:`))))throw Error('A source scoring pair lacks its exact expected head.');
 if(manifest.expectedLedgerHeads.length!==expectedStatCount)throw Error('Each source athlete requires its reviewed existing ledger head.');
 const report={fingerprint:targetFingerprint,alreadyApplied:false,sourceObservations:records.length,newStatistics:expectedStatCount,newScoreEntries:expectedStatCount,completeBoxes:0,pendingBoxes:manifest.stages.length,applied:Boolean(approval)};
 if(!approval)return report;
 for(const sport of ['NFL','MLB','NBA','NHL'] as const)if(manifest.stages.some(stage=>stage.game.sport===sport))await lockSport(tx,sport);
 const[startClock]=await tx.$queryRaw<{at:Date}[]>`SELECT clock_timestamp() AS at`;
 const promotionAt=new Date(Math.max(+at,Date.now(),+startClock.at));
 let newScoreEntries=0,completeBoxes=0,pendingBoxes=0,historicalTeContextUsed=0,newStatistics=0,sourceObservations=0;
 let completedProcessingAt=new Date(Math.max(+at,Date.now())),clockFloor=+completedProcessingAt;
 for(const stage of manifest.stages){
  const bindings=[];let incomplete=false;
  for(const record of stage.records){const result=await persistObservationInTransaction(tx,record,promotionAt);if(!['ACCEPTED','DUPLICATE'].includes(result.outcome))throw Error(`Reviewed source promotion rejected: ${result.reason}`);const old=manifest.expectedSourceHeads.find(head=>head.provider===record.provider&&head.sport===record.sport&&head.entityKey===record.entityKey);if(result.observationId!==old?.observationId)sourceObservations++;if(record.normalized.kind==='STAT'&&result.outcome==='ACCEPTED')newStatistics++;if(record.normalized.kind!=='STAT')continue;const targets=result.targets as {statId?:string;playerId?:string};if(!targets.statId||!targets.playerId)throw Error('Materialized source has no exact canonical stat target.');
   const[game]=await tx.$queryRaw<{startsAt:Date|null}[]>`SELECT source_start."resolvedStart" AS "startsAt" FROM "Game" game ${professionalGameProjection(promotionAt)} WHERE game.id=${stage.game.id}::uuid`;
   let teEligible:boolean|undefined;if(record.normalized.role==='FOOTBALL'&&game?.startsAt){const position=await getEligiblePositions({playerId:targets.playerId,sport:'NFL',seasonYear:stage.game.seasonYear,asOf:game.startsAt},tx);if(position.available)teEligible=position.positions.includes('TE');}
   if(record.normalized.role==='FOOTBALL'&&teEligible===undefined&&record.normalized.phase==='FINAL'){
    const sourceRow=record.raw.sourceRecord as Record<string,unknown>|undefined,recorded=sourceRow?.position,observed=record.raw.historicalObservedPositions as string[]|undefined;
    if(typeof recorded==='string'&&['QB','RB','FB','WR','TE'].includes(recorded)&&observed?.includes(recorded)){teEligible=recorded==='TE';historicalTeContextUsed++;}
   }
   const scored=await recalculateInTransaction(tx,stage.game.sport,{gameId:stage.game.id,playerId:targets.playerId,role:record.normalized.role,sourceProvider:record.provider,teEligible,sourceChangeReason:`Explicit exact reviewed competitive-stage target ${targetFingerprint}`,reason:'Reviewed real batch source through preserved V9; source publication and actual completion remain unknown; recorded game position may support historical TE scoring context only, never lineup eligibility'});if(scored.changed)newScoreEntries++;if(scored.entry.missingStats.length)incomplete=true;
   const stat=await tx.playerGameStat.findUniqueOrThrow({where:{id:targets.statId}});if(stat.contentHash!==contentFingerprint(record)||scored.entry.statId!==stat.id)throw Error('Scored source head differs from exact staged normalized evidence.');
   clockFloor=Math.max(clockFloor,+stat.recordedAt,+scored.entry.calculatedAt);
   bindings.push({playerId:targets.playerId,role:record.normalized.role,statId:stat.id,statHash:stat.contentHash,scoreEntryId:scored.entry.id,calculatedAt:scored.entry.calculatedAt.toISOString(),recordedAt:stat.recordedAt.toISOString(),sourceProvider:record.provider,stats:record.normalized.stats});
  }
  if(!stage.completeBoxBindingReady||incomplete){pendingBoxes++;continue;}
  const[serverClock]=await tx.$queryRaw<{at:Date}[]>`SELECT clock_timestamp() AS at`;
  completedProcessingAt=new Date(Math.max(+at,clockFloor,Date.now(),+serverClock.at));
  const box=bindCompleteFinalBox(stage,bindings,completedProcessingAt.toISOString()),result=await persistObservationInTransaction(tx,box,completedProcessingAt);if(['ACCEPTED','DUPLICATE'].includes(result.outcome))completeBoxes++;else{if(manifest.requireCompleteBoxes)throw Error(`Complete-box gate rejected the controlled stage: ${result.reason}`);pendingBoxes++;}
 }
 if(manifest.requireCompleteBoxes&&pendingBoxes)throw Error('Reviewed controlled acceptance requires every source box complete.');
 const[finishedClock]=await tx.$queryRaw<{at:Date}[]>`SELECT clock_timestamp() AS at`;
 completedProcessingAt=new Date(Math.max(+completedProcessingAt,+at,clockFloor,Date.now(),+finishedClock.at));
 const summary={...report,sourceObservations,newStatistics,targetStatRows:expectedStatCount,observationsAcceptedAt:promotionAt.toISOString(),completedProcessingAt:completedProcessingAt.toISOString(),newScoreEntries,completeBoxes,pendingBoxes,historicalTeContextUsed,historicalPositionPolicy:'RECORDED_GAME_SCORING_CONTEXT_ONLY; no current eligibility grants'},first=manifest.stages[0];
 const saved=await tx.professionalDataObservation.create({data:{provider:'internal-reviewed-source',sport:first.game.sport,category:'COMPETITIVE_STAGE_BATCH',entityKey:`competitive-stage-batch:${targetFingerprint}`,revisionToken:targetFingerprint,contentHash:targetFingerprint,sourceReference:'https://github.com/VickenMat/FantasySportsSite',observedAt:completedProcessingAt,effectiveAt:null,publishedAt:null,raw:{sourceFiles:manifest.sourceFiles,reviewFingerprint:targetFingerprint},normalized:{gameIds:manifest.stages.map(stage=>stage.game.id),summary}}});
 await tx.professionalDataDecision.create({data:{observationId:saved.id,version:1,outcome:'ACCEPTED',reason:'Exact reviewed source bodies, canonical stream heads and ledger heads; no source time fabricated.',targets:summary,decidedAt:completedProcessingAt}});
 return summary;
}
