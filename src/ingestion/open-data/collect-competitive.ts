import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import type {PrismaClient} from '@/generated/prisma/client';
import { fingerprint } from '@/ingestion/contracts';
import { sourceProduct,nhlEvents,type SourceRow } from '@/ingestion/open-data/read';
import { openDataSources } from '@/ingestion/open-data/sources';
import { nflCompletedScheduleResult } from '@/ingestion/open-data/nfl-schedule-result';
import { buildNflCompetitiveRecords,buildNhlCompetitiveRecords,buildNbaCompetitiveRecords,type CanonicalCompetitiveGame,type CompetitiveSourceProof,type CompetitiveGameStage } from '@/ingestion/open-data/competitive-records';
import { historicalStatsForScoring } from '@/scoring/historical-evidence';
import type { StatValues } from '@/scoring/engine';
import {canonicalSourcePlayerAliases} from './canonical-player-aliases';
import {competitiveRevisionOrdinal} from './competitive-revision-receipt';
import {reconcileNhlEvents} from './nhl-evidence';
import {proveNhlGoalieDecisions} from './nhl-goalie-decisions';
import {buildFutureNhlCompetitiveRecords} from './nhl-source-statistics';
import {validNbaGameBridge} from '@/ingestion/open-data/nba-game-binding';


async function retained(path:string,metadataPath:string){
 const bytes=await readFile(path),meta=JSON.parse(await readFile(metadataPath,'utf8'));
 if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error(`Retained source changed: ${path}`);
 const proof:CompetitiveSourceProof={sha256:meta.sha256,sourceUrl:meta.sourceReference??meta.sourceUrl,receivedAt:meta.receivedAt,artifactModifiedAt:meta.artifactModifiedAt??meta.lastModified??null};
 return{path,proof,rows:parse(path.endsWith('.gz')?gunzipSync(bytes):bytes,{columns:true,skip_empty_lines:true,bom:true}) as SourceRow[]};
}
/** Decode exact retained bodies against a read-only repeatable canonical snapshot.
 * No network or database mutation. Optional first-validation receipts are local artifacts only. */
export async function collectReadOnlyCompetitiveStages(db:PrismaClient,options:{sport?:'NFL'|'NBA'|'NHL';extendedNba?:boolean;currentRegisteredSources?:boolean;futureNhl?:boolean;validatedAt?:string;receiptDirectory?:string}={}){
 const extendedNba=(options.extendedNba??true)&&(!options.sport||options.sport==='NBA');
 const inactive={path:'',proof:{sha256:'',sourceUrl:'',receivedAt:'',artifactModifiedAt:null},rows:[] as SourceRow[]};
 const load=(id:string,sport:string)=>!options.sport||options.sport===sport?sourceProduct(id):Promise.resolve(inactive);
 const [nfl,info,skaters,goalies]=await Promise.all([load('nfl-statistics-2026','NFL'),load('nhl-game-info-2027','NHL'),load('nhl-skaters-2027','NHL'),load('nhl-goalies-2027','NHL')]);
 const futureNhl=(options.futureNhl??true)&&(!options.sport||options.sport==='NHL');
 const [nhlScoring,nhlEventProduct]=futureNhl?await Promise.all([sourceProduct('nhl-scoring-2027'),nhlEvents()]):[inactive,inactive];
 const nhlEvidence=futureNhl?reconcileNhlEvents(skaters.rows,nhlEventProduct.rows,nhlScoring.rows,info.rows,goalies.rows):null;
 const scheduleSource=openDataSources.find(source=>source.sport==='NFL'&&(source.id.includes('schedule')||source.sourceUrl.endsWith('/games.csv')));
 const nflSchedule=options.sport&&options.sport!=='NFL'?inactive:scheduleSource?await sourceProduct(scheduleSource.id):await retained('data/provider_previews/nflverse/season-2026/schedule.csv','data/provider_previews/nflverse/season-2026/schedule.source.json');
 const nbaRoot='data/provider_previews/capability_review/nba_products';
 const [nbaBox,nbaSchedule]=options.sport&&options.sport!=='NBA'?[inactive,inactive]:await Promise.all(options.currentRegisteredSources===false?[retained(`${nbaRoot}/player_boxscores_2027.csv`,`${nbaRoot}/player_boxscores_2027.csv.inspection.json`),retained(`${nbaRoot}/nba_schedule_2027.csv.gz`,`${nbaRoot}/nba_schedule_2027.csv.gz.inspection.json`)]:[sourceProduct('nba-boxscores-2027'),sourceProduct('nba-schedule-results-2027')]);
 const crosswalk=extendedNba?await retained('data/provider_previews/sportsdataverse/schedule-crosswalks/nba_schedule_crosswalk_2027.csv','data/provider_previews/sportsdataverse/schedule-crosswalks/nba_schedule_crosswalk_2027.csv.source.json'):null;
 const canonical=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;const[games,players,stats]=await Promise.all([
  tx.game.findMany({where:{sport:{in:options.sport?[options.sport]:['NFL','NBA','NHL']},season:{startYear:2026}},include:{season:true,teams:{include:{team:true}},scheduleObservations:{select:{id:true,contentHash:true,sourceRecord:true,scheduleExternalId:true,scheduleProvider:true,gameDate:true,retrievedAt:true,importBatch:{select:{status:true,importerVersion:true}}}}}}),
  canonicalSourcePlayerAliases(tx,options.sport?[options.sport]:['NFL','NBA','NHL'],options.validatedAt?new Date(options.validatedAt):new Date()),
  tx.playerGameStat.findMany({where:{provider:'v9-historical',game:{sport:'NHL',season:{startYear:2026}},player:{isSynthetic:false,isDemo:false}},orderBy:[{revision:'desc'},{recordedAt:'desc'}],distinct:['gameId','playerId','role'],select:{id:true,contentHash:true,gameId:true,playerId:true,teamId:true,role:true,normalized:true,raw:true,provider:true}})
 ]);return{games,players,stats};},{isolationLevel:'RepeatableRead',timeout:120000});
 const proofs=[nfl.proof,nflSchedule.proof,info.proof,skaters.proof,goalies.proof,nbaBox.proof,nbaSchedule.proof,...(crosswalk?[crosswalk.proof]:[]),...(futureNhl?[nhlScoring.proof,nhlEventProduct.proof]:[])].filter(proof=>proof.sha256);
 const sourceBundleFingerprint=fingerprint({proofs:proofs.map(proof=>({sha256:proof.sha256,sourceUrl:proof.sourceUrl})),canonicalPlayers:[...canonical.players].sort((a,b)=>`${a.sport}:${a.externalId}`.localeCompare(`${b.sport}:${b.externalId}`)),games:canonical.games.map(game=>({id:game.id,teams:game.teams.map(link=>({teamId:link.teamId,side:link.side})).sort((a,b)=>a.teamId.localeCompare(b.teamId)),startsAt:game.startsAt?.toISOString()??null})).sort((a,b)=>a.id.localeCompare(b.id)),nhlAcceptedHeads:canonical.stats.map(stat=>({id:stat.id,hash:stat.contentHash})).sort((a,b)=>a.id.localeCompare(b.id))});
 let validatedAt=options.validatedAt??new Date().toISOString();
 if(options.receiptDirectory){
  await mkdir(options.receiptDirectory,{recursive:true});
  const receiptPath=`${options.receiptDirectory}/first-validation-${sourceBundleFingerprint}.json`;
  try{await writeFile(receiptPath,JSON.stringify({sourceBundleFingerprint,validatedAt,semantics:'LOCAL_FIRST_VALIDATION_OF_EXACT_RETAINED_SOURCES_AND_CURRENT_CANONICAL_BINDINGS; not actual game or official publication time'},null,2)+'\n',{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;validatedAt=JSON.parse(await readFile(receiptPath,'utf8')).validatedAt;}
 }
 const players=new Map(canonical.players.map(player=>[`${player.sport}:${player.externalId}`,player.playerId])),externalByPlayer=new Map(canonical.players.map(player=>[player.playerId,player.externalId]));
 const dto=(game:typeof canonical.games[number]):CanonicalCompetitiveGame=>{
  const observations=game.scheduleObservations.filter(observation=>observation.scheduleProvider==='schedule-v5'&&observation.scheduleExternalId===game.externalId&&observation.importBatch.status==='COMPLETE'&&observation.importBatch.importerVersion==='schedule-v5-1');
  const records=observations.map(observation=>({observation,record:observation.sourceRecord as Record<string,string>}));
  const tuples=new Set(records.map(({record})=>`${record.home_team}:${record.away_team}`));
  const supported=tuples.size===1?records[0]:null;
  return{id:game.id,provider:game.provider,externalId:game.externalId,sport:game.sport,seasonYear:game.season.startYear,phase:game.phase,week:game.week,gameDate:game.gameDate?.toISOString().slice(0,10)??null,scheduledStartsAt:game.startsAt?.toISOString()??null,...(supported?{participantSideEvidence:{observationId:supported.observation.id,contentHash:supported.observation.contentHash,home:supported.record.home_team,away:supported.record.away_team}}:{}),teams:game.teams.map(link=>({id:link.teamId,provider:link.team.provider,externalId:link.team.externalId,code:link.team.code??'',side:link.side==='UNKNOWN'&&supported?link.team.code===supported.record.home_team?'HOME' as const:link.team.code===supported.record.away_team?'AWAY' as const:'UNKNOWN' as const:link.side})).sort((a,b)=>a.side.localeCompare(b.side))};
 };
 const stages:CompetitiveGameStage[]=[],holds:{sport:string;sourceGameId:string;reason:string}[]=[];
 const match=(sport:string,id:string,home:string,away:string)=>canonical.games.filter(game=>game.sport===sport&&game.externalId===id&&game.teams.length===2&&dto(game).teams.some(team=>team.side==='HOME'&&team.code===home)&&dto(game).teams.some(team=>team.side==='AWAY'&&team.code===away));
 const sportPlayers=(sport:string)=>new Map(canonical.players.filter(player=>player.sport===sport).map(player=>[player.externalId,player.playerId]));
 for(const row of nflSchedule.rows){if(row.season!=='2026'||nflCompletedScheduleResult(row,validatedAt).status!=='FINAL')continue;const matched=match('NFL',row.game_id,row.home_team,row.away_team);if(matched.length!==1){holds.push({sport:'NFL',sourceGameId:row.game_id,reason:'MISSING_OR_AMBIGUOUS_EXISTING_CANONICAL_GAME_TUPLE'});continue;}const statistics=nfl.rows.filter(stat=>stat.game_id===row.game_id);if(!statistics.length){holds.push({sport:'NFL',sourceGameId:row.game_id,reason:'NO_RETAINED_STAT_ROWS_FOR_COMPLETED_GAME'});continue;}try{stages.push(buildNflCompetitiveRecords({game:dto(matched[0]),schedule:row,statistics,players:sportPlayers('NFL'),proofs:[nfl.proof,nflSchedule.proof],validatedAt}));}catch(error){holds.push({sport:'NFL',sourceGameId:row.game_id,reason:error instanceof Error?error.message:'BUILD_FAILED'});}}
 for(const row of info.rows){const matched=match('NHL',row.game_id,row.home_team_abbr,row.away_team_abbr);if(matched.length!==1){holds.push({sport:'NHL',sourceGameId:row.game_id,reason:'MISSING_OR_AMBIGUOUS_EXISTING_CANONICAL_GAME_TUPLE'});continue;}const game=matched[0],stats=canonical.stats.filter(stat=>stat.gameId===game.id).map(stat=>({id:stat.id,contentHash:stat.contentHash,sourcePlayerId:externalByPlayer.get(stat.playerId)??'',playerId:stat.playerId,teamId:stat.teamId,role:stat.role,stats:historicalStatsForScoring({...stat,normalized:stat.normalized as StatValues}),raw:stat.raw}));try{if(!stats.length&&futureNhl&&nhlEvidence){const boxGoalies=goalies.rows.filter(box=>box.game_id===row.game_id),ends=nhlEventProduct.rows.filter(event=>event.game_id===row.game_id&&event.event_type==='GAME_END');if(nhlEvidence.rejected.some(rejected=>rejected.gameId===row.game_id)||ends.length!==1)throw Error('UNRESOLVED_COMPLETE_NHL_EVENT_SOURCE');const decisions=proveNhlGoalieDecisions(boxGoalies,row,ends[0]);stages.push(buildFutureNhlCompetitiveRecords({game:dto(game),info:row,skaters:skaters.rows.filter(box=>box.game_id===row.game_id),goalies:boxGoalies,players:sportPlayers('NHL'),eventFields:nhlEvidence.accepted,goalieDecisions:decisions.accepted?decisions.decisions:undefined,proofs:[info.proof,skaters.proof,goalies.proof,nhlScoring.proof,nhlEventProduct.proof],validatedAt}));}else stages.push(buildNhlCompetitiveRecords({game:dto(game),info:row,skaters:skaters.rows.filter(box=>box.game_id===row.game_id),goalies:goalies.rows.filter(box=>box.game_id===row.game_id),canonicalStats:stats,proofs:[info.proof,skaters.proof,goalies.proof],validatedAt}));}catch(error){holds.push({sport:'NHL',sourceGameId:row.game_id,reason:error instanceof Error?error.message:'BUILD_FAILED'});}}
 for(const row of nbaSchedule.rows){
  const box=nbaBox.rows.filter(box=>box.game_id===row.game_id);if(!box.length)continue;
  let candidates=match('NBA',row.game_id,row.home_team_abbreviation,row.away_team_abbreviation).map(dto);
  let bridgeUsed=false;
  if(crosswalk&&candidates.length!==1){
   const bridges=crosswalk.rows.filter(bridge=>bridge.nba_game_id===row.game_id);
   if(bridges.length===1){const bridge=bridges[0];candidates=canonical.games.filter(game=>game.sport==='NBA'&&game.externalId===bridge.espn_game_id).flatMap(game=>{
    const accepted=game.scheduleObservations.filter(obs=>obs.scheduleProvider==='schedule-v5'&&obs.scheduleExternalId===bridge.espn_game_id&&obs.importBatch.status==='COMPLETE'&&obs.importBatch.importerVersion==='schedule-v5-1').sort((a,b)=>+b.retrievedAt-+a.retrievedAt);
    if(!accepted.length||accepted.some(obs=>+obs.retrievedAt===+accepted[0].retrievedAt&&obs.contentHash!==accepted[0].contentHash))return[];
    const observation=accepted[0],record=observation.sourceRecord as Record<string,string>;
    if(observation.gameDate.toISOString().slice(0,10)!==row.game_date||record.home_team_id!==bridge.home_espn_team_id||record.away_team_id!==bridge.away_espn_team_id)return[];
    const bound={...dto(game),gameIdentityEvidence:{sourceGameId:row.game_id,sourceSha256:crosswalk.proof.sha256,crosswalk:bridge,observationId:observation.id,observationHash:observation.contentHash}};
    return validNbaGameBridge(bound,row,bound.gameIdentityEvidence)?[bound]:[];
   });bridgeUsed=candidates.length===1;}
  }
  if(candidates.length!==1){holds.push({sport:'NBA',sourceGameId:row.game_id,reason:'MISSING_OR_AMBIGUOUS_EXISTING_CANONICAL_GAME_TUPLE'});continue;}
  try{stages.push(buildNbaCompetitiveRecords({game:candidates[0],schedule:row,box,players:sportPlayers('NBA'),proofs:[nbaBox.proof,nbaSchedule.proof,...(bridgeUsed&&crosswalk?[crosswalk.proof]:[])],validatedAt}));}catch(error){holds.push({sport:'NBA',sourceGameId:row.game_id,reason:error instanceof Error?error.message:'BUILD_FAILED'});}
 }
 void players;
 const sourceFiles=[{path:nfl.path,sha256:nfl.proof.sha256},{path:nflSchedule.path,sha256:nflSchedule.proof.sha256},{path:info.path,sha256:info.proof.sha256},{path:skaters.path,sha256:skaters.proof.sha256},{path:goalies.path,sha256:goalies.proof.sha256},{path:nbaBox.path,sha256:nbaBox.proof.sha256},{path:nbaSchedule.path,sha256:nbaSchedule.proof.sha256},...(crosswalk?[{path:crosswalk.path,sha256:crosswalk.proof.sha256}]:[]),...(futureNhl?[{path:nhlScoring.path,sha256:nhlScoring.proof.sha256},{path:nhlEventProduct.path,sha256:nhlEventProduct.proof.sha256}]:[])].filter(source=>source.path);
 // A semantic source revision keeps its original ordering even when another body changes.
 const persisted=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return tx.professionalDataObservation.findMany({where:{sport:{in:options.sport?[options.sport]:['NFL','NBA','NHL']},category:{in:['GAME_STATE','STAT']}},select:{provider:true,sport:true,category:true,entityKey:true,revisionToken:true,revisionOrdinal:true}});},{isolationLevel:'RepeatableRead',timeout:120000});
 const oldOrdinals=new Map<string,bigint>();
 for(const row of persisted){if(row.revisionOrdinal===null)continue;const key=`${row.provider}:${row.sport}:${row.category}:${row.entityKey}:${row.revisionToken}`,old=oldOrdinals.get(key);if(old!==undefined&&old!==row.revisionOrdinal)throw Error('Conflicting existing semantic revision ordinals require review.');oldOrdinals.set(key,row.revisionOrdinal);}
 for(const stage of stages){const firstOrdinal=await competitiveRevisionOrdinal(stage.sourceFingerprint,stage.observedAt);for(const record of stage.records){const old=oldOrdinals.get(`${record.provider}:${record.sport}:${record.normalized.kind}:${record.entityKey}:${record.revisionToken}`);record.revisionOrdinal=old!==undefined?Number(old):firstOrdinal;}}
 return {stages,holds,proofs,sourceFiles,sourceBundleFingerprint,validatedAt,nhlAcceptedCanonicalUnknownShutoutRows:canonical.stats.filter(stat=>stat.role==='GOALIE'&&historicalStatsForScoring({...stat,normalized:stat.normalized as StatValues}).shutout==null).length};
}
