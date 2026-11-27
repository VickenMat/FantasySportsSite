import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { getDatabase } from '@/lib/db';
import { fingerprint, contentFingerprint, observationSchema } from '@/ingestion/contracts';
import { assertIsolatedIngestionDatabase, persistObservationInTransaction } from '@/ingestion/persist';
import { bodyHash } from '@/ingestion/open-data/storage';
import { nflCompletedScheduleResult } from '@/ingestion/open-data/nfl-schedule-result';
import { resolveMlbScheduleRows } from '@/ingestion/open-data/mlb-schedule-result';
import { validNbaGameBridge } from '@/ingestion/open-data/nba-game-binding';
import type { SourceRow } from '@/ingestion/open-data/read';
import { openDataSources } from '@/ingestion/open-data/sources';
import { lockSport } from './sport-lock';
const sport = z.enum(['NFL','MLB','NBA','NHL']);
const source = z.object({ id: z.string(), path: z.string().regex(/^data\/provider_previews\/(?:objects\/[a-f0-9]{64}|sportsdataverse\/schedule-crosswalks\/[A-Za-z0-9_.-]+\.csv)$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), sourceUrl: observationSchema.shape.sourceReference, receivedAt: z.iso.datetime({offset:true}), artifactModifiedAt: z.string().nullable() }).strict();
const canonical = z.object({ id:z.uuid(),sport,provider:z.enum(['schedule-v5','v9-historical']),externalId:z.string(),seasonId:z.uuid(),seasonYear:z.literal(2026),phase:z.enum(['REGULAR','UNKNOWN']),week:z.number().int().nullable(),gameDate:z.string().nullable(),startsAt:z.iso.datetime({offset:true}).nullable(),teams:z.array(z.object({id:z.uuid(),provider:z.string(),externalId:z.string(),code:z.string().nullable(),side:z.enum(['HOME','AWAY','UNKNOWN'])}).strict()).length(2) }).strict();
const v5 = z.object({id:z.uuid(),contentHash:z.string(),sourceRecord:z.record(z.string(),z.json())}).strict();
const head = z.object({id:z.uuid(),contentHash:z.string(),decisionId:z.uuid().nullable(),outcome:z.string().nullable(),targetsFingerprint:z.string()}).strict();
export const finalCompletionBootstrapSchema = z.object({version:z.literal('reviewed-final-only-completion-bootstrap-1'),preparedAt:z.iso.datetime({offset:true}),sourceFiles:z.array(source),targets:z.array(z.object({game:canonical,v5,sourceId:z.string(),sourceGameId:z.string(),expectedStateHeads:z.array(head),observation:observationSchema}).strict()),preservedCompletionHeads:z.array(z.object({id:z.uuid(),gameId:z.uuid(),fingerprint:z.string()}).strict())}).strict();
export type FinalCompletionBootstrap = z.infer<typeof finalCompletionBootstrapSchema>;
export type BootstrapGame = z.infer<typeof canonical>;
export type BootstrapSource = z.infer<typeof source>;
export function canonicalBootstrapGame(game:{id:string;sport:BootstrapGame['sport'];provider:string;externalId:string;seasonId:string;phase:string;week:number|null;gameDate:Date|null;startsAt:Date|null;season:{startYear:number};teams:{teamId:string;side:string;team:{provider:string;externalId:string;code:string|null}}[]}):BootstrapGame {
  return canonical.parse({id:game.id,sport:game.sport,provider:game.provider,externalId:game.externalId,seasonId:game.seasonId,seasonYear:game.season.startYear,phase:game.phase,week:game.week,gameDate:game.gameDate?.toISOString().slice(0,10)??null,startsAt:game.startsAt?.toISOString()??null,teams:game.teams.map(link=>({id:link.teamId,provider:link.team.provider,externalId:link.team.externalId,code:link.team.code,side:link.side})).sort((a,b)=>a.id.localeCompare(b.id))});
}
function participants(game:BootstrapGame,proof:FinalCompletionBootstrap['targets'][number]['v5']){
  const r=proof.sourceRecord;
  const home=String(game.sport==='NFL'?r.home_team:r.home_team_id),away=String(game.sport==='NFL'?r.away_team:r.away_team_id);
  if(game.sport!=='NFL'&&(!/^\d+$/.test(home)||!/^\d+$/.test(away)))throw Error('Numeric accepted V5 participant identities are required.');
  const native=(side:'home'|'away')=>String(r[`${side}_team`]);
  const matches=(team:BootstrapGame['teams'][number],side:'home'|'away')=>team.externalId===(side==='home'?home:away)||(game.sport==='NHL'&&team.provider==='v9-historical'&&team.externalId===native(side));
  if(home===away)throw Error('Distinct accepted V5 participants required.');
  // Historical NBA Games already carry official NBA IDs; that namespace is
  // validated below against the explicit official-to-ESPN publisher crosswalk.
  if(game.sport!=='NBA'&&(!game.teams.some(team=>matches(team,'home'))||!game.teams.some(team=>matches(team,'away'))))throw Error('Accepted V5 participants differ from canonical team identities.');
  return{home,away,teams:game.teams.map(team=>({...team,side:matches(team,'home')?'HOME' as const:matches(team,'away')?'AWAY' as const:'UNKNOWN' as const}))};
}
/** FINAL only, source-native identifiers plus both participants. No score/role completeness requirement. */
export function proveFinalBootstrapBinding(game:BootstrapGame,proof:FinalCompletionBootstrap['targets'][number]['v5'],sourceId:string,sourceGameId:string,rows:Map<string,SourceRow[]>,at:string){
  const v=proof.sourceRecord,p=participants(game,proof);
  if((game.sport!=='NBA'&&String(v.game_id)!==game.externalId)||String(v.season)!=='2026'||!['regular','REGULAR'].includes(String(v.game_type)))throw Error('Accepted V5 sport-season/phase/game tuple differs.');
  if(['Cancelled','CANCELLED','Canceled','CANCELED'].includes(String(v.status)))throw Error('A FINAL claim conflicts with accepted V5 cancellation evidence.');
  const sourceRows=rows.get(sourceId);if(!sourceRows)throw Error('Declared final source is unavailable.');
  if(game.sport==='NFL'){
    if(sourceId!=='nfl-results-2026')throw Error('NFL result source changed.');const matches=sourceRows.filter(row=>row.game_id===sourceGameId&&row.season==='2026');if(matches.length!==1)throw Error('NFL result ID missing or duplicated.');const row=matches[0];
    if(game.externalId!==sourceGameId||row.game_type!=='REG'||Number(row.week)!==game.week||row.home_team!==p.home||row.away_team!==p.away||nflCompletedScheduleResult(row,at).status!=='FINAL')throw Error('NFL composite ID/week/native participants/final result do not agree.');
    return{sourceRecord:row,participantNamespace:'NFL_NATIVE_TEAM_CODE',participantIds:{home:p.home,away:p.away},sourceDate:row.gameday};
  }
  if(game.sport==='NHL'){
    if(sourceId!=='nhl-game-info-2027'||game.externalId!==sourceGameId)throw Error('NHL source/canonical game ID changed.');const matches=sourceRows.filter(row=>row.game_id===sourceGameId);if(matches.length!==1)throw Error('NHL game-info ID missing or duplicated.');const row=matches[0];
    if(row.season!=='20262027'||row.game_type!=='R'||!['OFF','FINAL'].includes(row.game_state)||!/^\d+$/.test(row.home_score)||!/^\d+$/.test(row.away_score)||row.home_score===row.away_score||row.game_date>at.slice(0,10))throw Error('NHL explicit regular-season final evidence incomplete.');
    const inventory=(rows.get('nhl-goalies-2027')??[]).filter(value=>value.game_id===sourceGameId),side=(name:string)=>[...new Set(inventory.filter(value=>value.home_away===name).map(value=>value.team_id))];
    if(side('home').length!==1||side('away').length!==1||side('home')[0]!==p.home||side('away')[0]!==p.away||inventory.some(value=>value.team_abbrev!==(value.home_away==='home'?row.home_team_abbr:row.away_team_abbr)))throw Error('NHL independent same-game numeric participant inventory disagrees.');
    return{sourceRecord:row,participantNamespace:'NHL_OFFICIAL_TEAM_ID',participantIds:{home:p.home,away:p.away},numericParticipantProofs:inventory.map(value=>({game_id:value.game_id,home_away:value.home_away,team_id:value.team_id,player_id:value.player_id})),sourceDate:row.game_date};
  }
  if(game.sport==='NBA'){
    if(sourceId!=='nba-schedule-results-2027')throw Error('NBA source changed.');const matches=sourceRows.filter(row=>row.game_id===sourceGameId);if(matches.length!==1)throw Error('NBA result ID missing or duplicated.');const row=matches[0],bridges=(rows.get('nba-crosswalk-2027')??[]).filter(value=>value.nba_game_id===sourceGameId&&value.espn_game_id===String(v.game_id));
    if(row.season!=='2027'||row.season_type!=='regular-season'||!['W','L'].includes(row.home_wl)||!['W','L'].includes(row.away_wl)||row.home_wl===row.away_wl||!/^\d+$/.test(row.home_pts)||!/^\d+$/.test(row.away_pts)||Number(row.home_pts)===Number(row.away_pts)||(Number(row.home_pts)>Number(row.away_pts))!==(row.home_wl==='W')||row.game_date>at.slice(0,10)||bridges.length!==1)throw Error('NBA explicit final result/unique publisher bridge incomplete.');
    const bridge=bridges[0],official=game.externalId===sourceGameId&&game.provider==='v9-historical';const canonicalTeams=official?game.teams.map(team=>({...team,externalId:team.externalId===row.home_team_id?bridge.home_espn_team_id:team.externalId===row.away_team_id?bridge.away_espn_team_id:'UNRESOLVED',side:team.externalId===row.home_team_id?'HOME':team.externalId===row.away_team_id?'AWAY':'UNKNOWN'})):p.teams;if(String(v.home_team_id)!==bridge.home_espn_team_id||String(v.away_team_id)!==bridge.away_espn_team_id||(!official&&game.externalId!==bridge.espn_game_id)||!validNbaGameBridge({...game,externalId:String(v.game_id),teams:canonicalTeams},row,{sourceGameId,sourceSha256:proof.contentHash,crosswalk:bridge,observationId:proof.id,observationHash:proof.contentHash}))throw Error('NBA declared game bridge/numeric participants/date proof disagrees.');
    return{sourceRecord:row,participantNamespace:'NBA_OFFICIAL_TO_ESPN_EXPLICIT_CROSSWALK',participantIds:{home:p.home,away:p.away},crosswalk:bridge,sourceDate:row.game_date};
  }
  if(sourceId!=='mlb-schedules-2026'||game.externalId!==sourceGameId)throw Error('MLB source/canonical game ID changed.');
  const resolved=resolveMlbScheduleRows(sourceRows.filter(row=>row.game_pk===sourceGameId),at);if(resolved.status!=='FINAL'||!('row'in resolved)||!('phase'in resolved)||resolved.phase!=='REGULAR'||!('seasonYear'in resolved)||resolved.seasonYear!==2026||!('homeTeamId'in resolved)||resolved.homeTeamId!==p.home||!('awayTeamId'in resolved)||resolved.awayTeamId!==p.away)throw Error('MLB canonical ID/regular phase/numeric participants/final-state evidence disagrees.');
  return{sourceRecord:resolved.row,participantNamespace:'MLBAM_TEAM_ID',participantIds:{home:p.home,away:p.away},supersededPostponedRows:resolved.supersededRows,sourceDate:resolved.row.game_date};
}
export async function validateFinalCompletionBootstrapSources(raw:unknown){
 const manifest=finalCompletionBootstrapSchema.parse(raw),rows=new Map<string,SourceRow[]>();
 if(new Set(manifest.targets.map(target=>target.game.id)).size!==manifest.targets.length)throw Error('Duplicate canonical bootstrap target.');
 for(const proof of manifest.sourceFiles){const registered=openDataSources.find(value=>value.id===proof.id);const expectedUrl=proof.id==='nba-crosswalk-2027'?'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_crosswalk/nba_schedule_crosswalk_2027.csv':registered?.sourceUrl;if(!expectedUrl||proof.sourceUrl!==expectedUrl||Date.parse(proof.receivedAt)>Date.parse(manifest.preparedAt))throw Error('Bootstrap source registry or receipt timing differs.');const bytes=await readFile(proof.path);if(bodyHash(bytes)!==proof.sha256)throw Error('Frozen completion bootstrap source bytes changed.');if(rows.has(proof.id))throw Error('Duplicate bootstrap source ID.');rows.set(proof.id,parse(proof.path.endsWith('.gz')||proof.id==='mlb-schedules-2026'||proof.id==='nba-schedule-results-2027'?gunzipSync(bytes):bytes,{columns:true,skip_empty_lines:true,bom:true}));}
 for(const target of manifest.targets){const binding=proveFinalBootstrapBinding(target.game,target.v5,target.sourceId,target.sourceGameId,rows,manifest.preparedAt),input=target.observation,n=input.normalized;
  const publisher=target.game.sport==='NFL'?'nflverse-open-data':'sportsdataverse-open-data';
  if(input.provider!==publisher||input.sport!==target.game.sport||input.revisionOrdinal!==Date.parse(manifest.preparedAt)||input.sourceReference!==manifest.sourceFiles.find(proof=>proof.id===target.sourceId)?.sourceUrl||n.kind!=='GAME_STATE'||n.status!=='FINAL'||n.evidencePolicy!=='CONSERVATIVE_OBSERVED_V1'||n.actualStartsAt!==null||n.completedAt!==null||input.effectiveAt!==null||input.publishedAt!==null||input.observedAt!==manifest.preparedAt||n.game.provider!==target.game.provider||n.game.externalId!==target.game.externalId||n.scheduledStartsAt!==target.game.startsAt||input.entityKey!==`game-state:${target.game.id}`||fingerprint(input.raw.finalBinding)!==fingerprint(binding))throw Error('Completion bootstrap observation differs from exact reviewed FINAL-only binding.');
 }
 return manifest;
}
export async function completionBootstrapStateHeads(tx:Prisma.TransactionClient,gameId:string){
 const rows=await tx.professionalDataObservation.findMany({where:{category:'GAME_STATE',entityKey:`game-state:${gameId}`},include:{decisions:{orderBy:{version:'desc'},take:1}}});
 return rows.map(row=>({id:row.id,contentHash:row.contentHash,decisionId:row.decisions[0]?.id??null,outcome:row.decisions[0]?.outcome??null,targetsFingerprint:fingerprint(row.decisions[0]?.targets??null)})).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function reconcileFinalCompletionBootstrapInTransaction(tx:Prisma.TransactionClient,raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 const manifest=finalCompletionBootstrapSchema.parse(raw),reviewed=fingerprint(manifest);if(approval&&approval.expectedFingerprint!==reviewed)throw Error('Completion bootstrap differs from exact approval.');
 if(approval)for(const value of ['NFL','MLB','NBA','NHL']as const)await lockSport(tx,value);
 for(const prior of manifest.preservedCompletionHeads){const row=await tx.gameCompletionEvidence.findUnique({where:{id:prior.id}});if(!row||fingerprint(JSON.parse(JSON.stringify(row)))!==prior.fingerprint)throw Error('A preserved first-final completion changed.');}
 let changes=0,alreadyApplied=0;const completionIds:string[]=[];
 for(const target of manifest.targets){const game=await tx.game.findUniqueOrThrow({where:{id:target.game.id},include:{season:true,teams:{include:{team:true}}}});if(fingerprint(canonicalBootstrapGame(game))!==fingerprint(target.game))throw Error('Accepted V5 canonical game tuple changed.');
  const v5row=await tx.gameScheduleObservation.findUnique({where:{id:target.v5.id},include:{importBatch:true}});if(!v5row||v5row.gameId!==game.id||v5row.contentHash!==target.v5.contentHash||fingerprint(v5row.sourceRecord)!==fingerprint(target.v5.sourceRecord)||v5row.phase!=='REGULAR'||v5row.importBatch.status!=='COMPLETE'||v5row.importBatch.importerVersion!=='schedule-v5-1')throw Error('Accepted V5 binding proof changed.');
  const existing=await tx.professionalDataObservation.findFirst({where:{provider:target.observation.provider,sport:target.game.sport,category:'GAME_STATE',entityKey:target.observation.entityKey,revisionToken:target.observation.revisionToken,contentHash:contentFingerprint(target.observation)},include:{decisions:{orderBy:{version:'desc'},take:1}}});
  if(existing?.decisions[0]?.outcome==='ACCEPTED'){const evidence=await tx.gameCompletionEvidence.findMany({where:{gameId:game.id,provider:'conservative-event-policy'}});if(!evidence.length)throw Error('Accepted bootstrap lost its immutable completion evidence.');alreadyApplied++;completionIds.push(...evidence.map(row=>row.id));continue;}
  if(fingerprint(await completionBootstrapStateHeads(tx,game.id))!==fingerprint(target.expectedStateHeads)||await tx.gameCompletionEvidence.count({where:{gameId:game.id}}))throw Error('Completion/source head changed since review.');
  changes++;if(approval){const result=await persistObservationInTransaction(tx,target.observation,at);if(result.outcome!=='ACCEPTED'||!(result.targets as{completionEvidenceId?:string}).completionEvidenceId)throw Error(`FINAL bootstrap rejected atomically: ${result.reason}`);completionIds.push((result.targets as{completionEvidenceId:string}).completionEvidenceId);}
 }
 return{fingerprint:reviewed,changes,alreadyApplied,observationAppends:changes,decisionAppends:changes,completionAppends:changes,applied:Boolean(approval),completionIds};
}
export async function reconcileFinalCompletionBootstrap(raw:unknown,approval?:{expectedFingerprint:string},at=new Date()){
 if(approval)assertIsolatedIngestionDatabase();const manifest=await validateFinalCompletionBootstrapSources(raw);
 return getDatabase().$transaction(async tx=>{if(!approval)await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileFinalCompletionBootstrapInTransaction(tx,manifest,approval,at);},{isolationLevel:'Serializable',timeout:600000});
}
