import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { sourceProduct } from '@/ingestion/open-data/read';
import { playerSnapshotsFromRelease, type SnapshotReleaseProof, type SnapshotReleaseRow } from '@/ingestion/open-data/player-snapshots';
import { playerSnapshotSchema } from '@/positions/player-snapshot-policy';
import { observedPolicyAdoptedAt } from '@/ingestion/evidence-policy';
import { fingerprint } from '@/ingestion/contracts';
import { getDatabase } from '@/lib/db';
import { professionalPlayerIdentityState } from '@/ingestion/identity-resolutions';
const directory='data/provider_previews/player_snapshot_review',at=new Date().toISOString(),policyAdoptedAt=observedPolicyAdoptedAt.toISOString();
const {mkdir}=await import('node:fs/promises');await mkdir(directory,{recursive:true});
const observations:ReturnType<typeof playerSnapshotsFromRelease>['observations']=[],holds:ReturnType<typeof playerSnapshotsFromRelease>['holds']=[],sourceProofs:SnapshotReleaseProof[]=[];
const add=(proof:SnapshotReleaseProof,rows:SnapshotReleaseRow[])=>{sourceProofs.push(proof);const result=playerSnapshotsFromRelease({proof,rows,at,policyAdoptedAt});observations.push(...result.observations);holds.push(...result.holds);};
for(const id of ['nfl-rosters-2026','nba-rosters-2027','nfl-injuries-2026','mlb-injuries-2026','nba-injuries-2027','nhl-injuries-2027']){
 const product=await sourceProduct(id),proof={id,sport:product.source.sport,sourceUrl:product.source.sourceUrl,sha256:product.proof.sha256,receivedAt:product.proof.receivedAt,artifactModifiedAt:product.proof.artifactModifiedAt};
 let rows=product.rows;
 if(id.includes('injuries'))rows=(await parquetReadObjects({file:await asyncBufferFromFile(product.path),compressors:{GZIP:(bytes,size)=>gunzipSync(bytes,{maxOutputLength:Math.max(1,size)}),ZSTD:(bytes,size)=>zstdDecompressSync(bytes,{maxOutputLength:Math.max(1,size)})}})).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value==null?'':String(value)])));
 add(proof,rows);
}
const nhlMetadata=JSON.parse(await readFile('data/provider_previews/capability_review/nhl_rosters_2027.csv.source.json','utf8'));
const nhlBytes=await readFile(`data/provider_previews/objects/${nhlMetadata.sha256}`);
if(createHash('sha256').update(nhlBytes).digest('hex')!==nhlMetadata.sha256)throw Error('Verified NHL roster object changed.');
add({id:'nhl-rosters-2027',sport:'NHL',sourceUrl:nhlMetadata.sourceUrl,sha256:nhlMetadata.sha256,receivedAt:nhlMetadata.receivedAt,artifactModifiedAt:nhlMetadata.artifactModifiedAt},parse(nhlBytes,{columns:true,skip_empty_lines:true}));
// Recovery uses independently proved thresholds, never historical observed-position fields.
const carry=JSON.parse(await readFile('data/position_enrichment/mlb_position_additional_source_proposal.json','utf8'));
const context=JSON.parse(await readFile('data/position_enrichment/generation_context.json','utf8'));
const roleContext=JSON.parse(await readFile('data/position_enrichment/mlb_nine_role_generation_context.json','utf8'));
const recovered=JSON.parse(await readFile('data/position_enrichment/mlb_recorded_threshold_candidates.json','utf8'));
const approvedHistorical=JSON.parse(await readFile('data/position_enrichment/mlb_review_manifest.json','utf8'));
const imported2026=new Set(approvedHistorical.rows.map((row:{playerExternalId:string})=>row.playerExternalId));
const reviewUrl='https://github.com/VickenMat/FantasySportsSite/blob/007586d/docs/M5_MLB_POSITION_HOLDS.md';
sourceProofs.push({id:'recovered-mlb-position-thresholds',sport:'MLB',sourceUrl:reviewUrl,sha256:context.sourceFingerprint,receivedAt:context.knownAt,artifactModifiedAt:null,localPath:'data/raw/recovered/mlb_positions_repaired.csv',proofKind:'ACCEPTED_RECOVERED_SOURCE_INPUT'});
sourceProofs.push({id:'recovered-mlb-exact-game-role-thresholds',sport:'MLB',sourceUrl:reviewUrl,sha256:carry.sourceFingerprints['data/raw/recovered/mlb_2016_2026_final.csv'],receivedAt:roleContext.knownAt,artifactModifiedAt:null,localPath:'data/raw/recovered/mlb_2016_2026_final.csv',proofKind:'ACCEPTED_RECOVERED_SOURCE_INPUT'});
function aggregate(id:string,evidenceYear:number,targetYear:number,code:string,teamId:string,countValue:number,sourceRows:string[],sourceFingerprint:string,firstObservedAt:string,raw:Record<string,unknown>){
 const basis=code==='SP'?'STARTING_PITCHING':code==='RP'?'RELIEF_PITCHING':code==='DH'?'DESIGNATED_HITTER':'FIELDING';
 const normalized=playerSnapshotSchema.parse({kind:'PLAYER_SNAPSHOT',player:{provider:'v9-historical',externalId:id},seasonStartYear:targetYear,sourceRecordId:`recovered-mlb:${id}:${evidenceYear}:${code}:${teamId}`,sourceFingerprint,sourceSnapshotDate:null,sourceDatePrecision:'SEASON',firstObservedAt,policyAdoptedAt,validFrom:new Date(Math.max(Date.parse(firstObservedAt),Date.parse(policyAdoptedAt))).toISOString(),validUntil:null,policyVersion:'approved-observed-player-snapshot-1',retracted:false,facet:{type:'POSITION_AGGREGATE',evidenceSeasonStartYear:evidenceYear,code,countBasis:basis,starts:code==='SP'?countValue:code==='RP'?0:null,appearances:countValue,scope:'INDEPENDENT_THRESHOLD',sourceTeamId:teamId,sourceRows,excludesDuplicateTeamTotals:true}});
 observations.push({provider:'reviewed-recovered-mlb-positions',sport:'MLB',entityKey:`player-snapshot:v9-historical:${id}:${targetYear}:POSITION_AGGREGATE:${code}:${evidenceYear}`,revisionToken:`${sourceFingerprint}:${id}:${evidenceYear}:${targetYear}:${code}`,revisionOrdinal:Date.parse(firstObservedAt),sourceReference:reviewUrl,observedAt:at,effectiveAt:null,publishedAt:null,raw:{sourceFingerprint,sourceProposalFingerprint:carry.sourceProposalFingerprint,...raw},normalized});
}
function recoveredCounts(id:string,evidenceYear:number,targetYears:number[],evidence:{positions:string[];teams:{teamId:string;counts:Record<string,number|null>;lines:number[]}[];sourceRows:{line:number;sha256:string}[]}){
 for(const code of evidence.positions){const eligible=evidence.teams.filter(team=>Number(team.counts[code]??-1)>=(code==='SP'?10:20)).sort((a,b)=>Number(b.counts[code])-Number(a.counts[code])||a.teamId.localeCompare(b.teamId));
  if(!eligible.length)throw Error('Recovered position lacks an independent threshold proof.');
  const team=eligible[0],sourceRows=team.lines.map(line=>{const proof=evidence.sourceRows.find(row=>row.line===line);if(!proof)throw Error('Recovered independent threshold lost its source-line proof.');return `recovered-mlb-position:${line}:${proof.sha256}`;});
  for(const target of targetYears)aggregate(id,evidenceYear,target,code,team.teamId,team.counts[code]!,sourceRows,context.sourceFingerprint,context.knownAt,{independentThreshold:team,allPreservedSourceRows:evidence.sourceRows,scope:'SOURCE_TEAM_LOWER_BOUND_NOT_SEASON_TOTAL'});
 }
}
for(const row of carry.priorSeasonCarryCandidates)recoveredCounts(row.sourcePlayerId,2025,[2026],row.prior2025CarryProposal);
for(const row of recovered.rows.filter((row:{playerExternalId:string;seasonStartYear:number;status:string})=>row.seasonStartYear===2026&&row.status==='RECORDED_THRESHOLD_SUPPORTED'&&imported2026.has(row.playerExternalId)))recoveredCounts(row.playerExternalId,2026,[2026,2027],row);
for(const row of carry.historicalRoleCandidates){const evidence=row.explicit2026Pitching;
 for(const code of evidence.independentlySupportedRolePositions){const games=evidence.games.filter((game:{started:boolean})=>code==='SP'?game.started:!game.started);
  if(games.length<(code==='SP'?10:20))throw Error('Distinct-game role threshold is incomplete.');
  const lines=games.flatMap((game:{proofs:{sourceLine:number;rowSha256:string}[]})=>game.proofs.map(proof=>`recovered-mlb-stat:${proof.sourceLine}:${proof.rowSha256}`)),teams=[...new Set(games.flatMap((game:{proofs:{sourceTeamId:string}[]})=>game.proofs.map(proof=>proof.sourceTeamId)))].sort().join(',');
  for(const target of [2026,2027])aggregate(row.sourcePlayerId,2026,target,code,teams,games.length,lines,carry.sourceFingerprints['data/raw/recovered/mlb_2016_2026_final.csv'],roleContext.knownAt,{basis:'EXPLICIT_DISTINCT_GAME_PITCHING_COUNTERS',games,allGameEvidence:evidence,sourceProposalFingerprint:carry.sourceProposalFingerprint});
 }
}
const manifest={version:'reviewed-player-snapshot-promotion-1',policyAdoptedAt,createdAt:at,sourceProofs,observations};
const counts=(rows:typeof observations)=>Object.fromEntries([...new Set(rows.map(row=>`${row.sport}:${row.normalized.facet.type}`))].sort().map(key=>[key,rows.filter(row=>`${row.sport}:${row.normalized.facet.type}`===key).length]));
await writeFile(`${directory}/source_proposal.json`,JSON.stringify(manifest,null,2)+'\n');
let report:Record<string,unknown>={sourceProposalFingerprint:fingerprint(manifest),observations:observations.length,sourceCounts:counts(observations),holds,developmentWrites:0,canonicalBound:false};
if(process.argv.includes('--bind-canonical')){
 const db=getDatabase();
 try{const bound=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const [aliases,teams,overlays,heads,seasons]=await Promise.all([
   tx.playerExternalId.findMany({include:{player:{select:{isSynthetic:true,isDemo:true}}}}),tx.proTeam.findMany(),
   tx.professionalDataObservation.findMany({where:{category:'IDENTITY_RESOLUTION',decisions:{some:{outcome:'ACCEPTED'}}},select:{sport:true,entityKey:true}}),
   tx.professionalDataObservation.findMany({where:{category:'PLAYER_SNAPSHOT',decisions:{some:{outcome:'ACCEPTED'}}},orderBy:[{revisionOrdinal:'desc'},{id:'asc'}],select:{id:true,provider:true,sport:true,entityKey:true}}),
   tx.season.findMany({select:{id:true,sport:true,startYear:true}}),
  ]);
  const aliasMap=new Map(aliases.map(alias=>[`${alias.sport}:${alias.provider}:${alias.externalId}`,alias])),teamMap=new Map(teams.map(team=>[`${team.sport}:${team.provider}:${team.externalId}`,team])),overlaySet=new Set(overlays.map(row=>`${row.sport}:${row.entityKey}`));
  const seasonMap=new Map(seasons.map(season=>[`${season.sport}:${season.startYear}`,season.id]));
  const actorMap=new Map(aliases.map(alias=>[alias.playerId,alias.player])),headMap=new Map<string,string>();for(const head of heads){const key=`${head.sport}:${head.provider}:${head.entityKey}`;if(!headMap.has(key))headMap.set(key,head.id);}
  const identityCache=new Map<string,Awaited<ReturnType<typeof professionalPlayerIdentityState>>>(),accepted=[],pending=[],guards=[];
  for(const observation of observations){const n=observation.normalized,key=`${observation.sport}:${n.player.provider}:${n.player.externalId}`,alias=aliasMap.get(key);
   let state=identityCache.get(key);
   if(!state){state=overlaySet.has(`${observation.sport}:identity-resolution:${fingerprint({sport:observation.sport,...n.player})}`)?await professionalPlayerIdentityState(tx,observation.sport,n.player,new Date(at)):{status:alias?'RESOLVED':'MISSING',mapping:alias?{...n.player,sport:observation.sport,playerId:alias.playerId,source:'LEGACY',resolutionObservationId:null}:null,resolutionId:null,revision:null};identityCache.set(key,state);}
   const resolvedActor=state.mapping?actorMap.get(state.mapping.playerId):undefined;
   if(state.status!=='RESOLVED'||!state.mapping||!resolvedActor||resolvedActor.isSynthetic||resolvedActor.isDemo){pending.push({sport:observation.sport,entityKey:observation.entityKey,reason:'EXPLICIT_REAL_CANONICAL_PLAYER_BRIDGE_MISSING_OR_CONFLICTED'});continue;}
   const seasonId=seasonMap.get(`${observation.sport}:${n.seasonStartYear}`);if(!seasonId){pending.push({sport:observation.sport,entityKey:observation.entityKey,reason:'TARGET_CANONICAL_SEASON_MISSING_REQUIRES_REVIEWED_CALENDAR'});continue;}
   const team=n.facet.type==='TEAM_ASSIGNMENT'?teamMap.get(`${observation.sport}:${n.facet.team.provider}:${n.facet.team.externalId}`):undefined;
   if(n.facet.type==='TEAM_ASSIGNMENT'&&!team){pending.push({sport:observation.sport,entityKey:observation.entityKey,reason:'CANONICAL_TEAM_IDENTITY_UNRESOLVED'});continue;}
   accepted.push(observation);guards.push({provider:observation.provider,sport:observation.sport,entityKey:observation.entityKey,expectedPlayerId:state.mapping.playerId,expectedSeasonId:seasonId,expectedResolutionId:state.resolutionId,expectedTeamId:team?.id??null,expectedAcceptedHeadId:headMap.get(`${observation.sport}:${observation.provider}:${observation.entityKey}`)??null});
  }
  return{accepted,pending,guards};
 },{isolationLevel:'RepeatableRead',timeout:60000});
 const exact={...manifest,observations:bound.accepted,canonicalGuards:bound.guards};
 await writeFile(`${directory}/reviewed_manifest.json`,JSON.stringify(exact,null,2)+'\n');report={...report,canonicalBound:true,fingerprint:fingerprint(exact),acceptedCounts:counts(bound.accepted),acceptedObservations:bound.accepted.length,pending:bound.pending,canonicalGuards:bound.guards};
 }finally{await db.$disconnect();}
}
await writeFile(`${directory}/preview.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,holds:holds.length,canonicalGuards:undefined,pending:Array.isArray(report.pending)?report.pending.length:undefined},null,2));
