import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { fetchPublicData } from '@/ingestion/http';
import { getDatabase } from '@/lib/db';
import { sourceProduct } from '@/ingestion/open-data/read';
import { fingerprint } from '@/ingestion/contracts';

const directory='data/provider_previews/capability_review';
await mkdir(directory,{recursive:true});
async function download(url:string,path:string,maxBytes:number){
  try { const bytes=await readFile(path); return {bytes,requests:0,sha256:createHash('sha256').update(bytes).digest('hex')}; }
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const response=await fetchPublicData({sourceUrl:url,allowedHosts:['api.github.com','github.com','release-assets.githubusercontent.com'],permission:'OPEN_DATA_PREVIEW',maxBytes,timeoutMs:60000});
  if(response.status==='PENDING_PERMISSION')throw Error('Public redistribution preview is disabled.');
  await writeFile(path,response.cache.body);
  const metadata={url,requests:response.requests,sha256:createHash('sha256').update(response.cache.body).digest('hex'),receivedAt:response.receivedAt,artifactModifiedAt:response.cache.lastModified,officialPublishedAt:null};
  await writeFile(path+'.source.json',JSON.stringify(metadata,null,2)+'\n');
  return {bytes:response.cache.body,...metadata};
}
const releases=[];
for(const tag of ['espn_nfl_injuries','espn_nba_injuries','espn_nhl_injuries','espn_mlb_injuries']){
  const metadata=await download(`https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/${tag}`,`${directory}/${tag}.release.json`,3*1024*1024);
  const release=JSON.parse(Buffer.from(metadata.bytes).toString()) as {assets:{name:string;size:number;updated_at:string;browser_download_url:string}[]};
  const season=tag.includes('nfl')||tag.includes('mlb')?'2026':'2027';
  const candidates=release.assets.filter(asset=>/\.(csv|parquet)$/.test(asset.name)&&asset.name.includes(season));
  releases.push({tag,assets:candidates});
  for(const asset of candidates){
    if(asset.size>8*1024*1024)continue;
    await mkdir(`${directory}/${tag}`,{recursive:true});
    const path=`${directory}/${tag}/${asset.name}`;
    const result=await download(asset.browser_download_url,path,8*1024*1024);
    const rows=asset.name.endsWith('.parquet')?await parquetReadObjects({file:await asyncBufferFromFile(path),compressors:{GZIP:(bytes,size)=>gunzipSync(bytes,{maxOutputLength:Math.max(1,size)}),ZSTD:(bytes,size)=>zstdDecompressSync(bytes,{maxOutputLength:Math.max(1,size)})}}):parse(result.bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
    const stringify=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item,2)+'\n';
    await writeFile(`${directory}/${tag}.inspection.json`,stringify({tag,asset,sha256:result.sha256,rows:rows.length,columns:Object.keys(rows[0]??{}),examples:rows.slice(0,3)}));
    await writeFile(`${directory}/${tag}.rows.json`,stringify(rows));
  }
}
const crosswalkResult=await download('https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_crosswalk/nba_player_crosswalk_2027.csv',`${directory}/nba_player_crosswalk_2027.csv`,1024*1024);
const crosswalk=parse(crosswalkResult.bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
const teamResult=await download('https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_crosswalk/nba_team_crosswalk_2027.csv',`${directory}/nba_team_crosswalk_2027.csv`,1024*1024);
const teamCrosswalk=parse(teamResult.bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
const priorRosterResult=await download('https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_rosters/rosters_2026.csv',`${directory}/nba_rosters_2026.csv`,1024*1024);
const priorRoster=parse(priorRosterResult.bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
const [nfl,roster,nba,espn,nhl,goalies]=await Promise.all(['nfl-statistics-2026','nfl-rosters-2026','nba-rosters-2027','nba-listed-2027','nhl-skaters-2027','nhl-goalies-2027'].map(sourceProduct));
const count=(rows:Record<string,string>[],key:string)=>Object.fromEntries([...new Set(rows.map(row=>row[key]??''))].sort().map(value=>[value,rows.filter(row=>(row[key]??'')===value).length]));
const db=getDatabase();
try{
  const players=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return tx.playerExternalId.findMany({where:{provider:'v9-historical',player:{isSynthetic:false,isDemo:false}},include:{player:true}});});
  const nbaIds=new Set(nba.rows.map(row=>row.player_id));
  const dob=(value:string)=>{const match=/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec((value??'').toUpperCase());const month=match?['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(match[1]):-1;return match&&month>=0?`${match[3]}-${String(month+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`:null;};
  const group=(rows:Record<string,string>[],key:string)=>{const map=new Map<string,Record<string,string>[]>();for(const row of rows)map.set(row[key],[...(map.get(row[key])??[]),row]);return map;};
  const official=group(nba.rows,'player_id'),historical=group(priorRoster,'player_id'),espnProfiles=group(espn.rows,'athlete_id');
  const bridges=crosswalk.map(row=>{
    const current=official.get(row.nba_player_id)??[],bio=current.length?current:historical.get(row.nba_player_id)??[],profiles=espnProfiles.get(row.espn_athlete_id)??[];
    const officialBirthDates=[...new Set(bio.map(profile=>dob(profile.birth_date)).filter(Boolean))],espnBirthDates=[...new Set(profiles.map(profile=>profile.date_of_birth?.slice(0,10)).filter(Boolean))];
    const birthDateMatches=officialBirthDates.length===1&&espnBirthDates.length===1&&officialBirthDates[0]===espnBirthDates[0];
    const nbaTargets=new Set(crosswalk.filter(other=>other.espn_athlete_id===row.espn_athlete_id&&other.nba_player_id).map(other=>other.nba_player_id));
    const espnTargets=new Set(crosswalk.filter(other=>other.nba_player_id===row.nba_player_id&&other.espn_athlete_id).map(other=>other.espn_athlete_id));
    const mappedTeams=new Set(current.flatMap(profile=>teamCrosswalk.filter(team=>team.nba_team_id===profile.team_id).map(team=>team.espn_team_id))),actualTeams=new Set(profiles.map(profile=>profile.team_id));
    const teamMatches=mappedTeams.size===1&&actualTeams.size===1&&[...mappedTeams][0]===[...actualTeams][0];
    const nbaJerseys=new Set(current.map(profile=>profile.num).filter(Boolean)),espnJerseys=new Set(profiles.map(profile=>profile.jersey).filter(Boolean));
    const jerseyConflict=nbaJerseys.size>0&&espnJerseys.size>0&&(nbaJerseys.size!==1||espnJerseys.size!==1||[...nbaJerseys][0]!==[...espnJerseys][0]);
    const status=!row.nba_player_id||!row.espn_athlete_id?'MISSING_EXPLICIT_ID_PAIR':nbaTargets.size!==1||espnTargets.size!==1?'CONFLICTING_ID_PAIR':!bio.length||!profiles.length?'MISSING_INDEPENDENT_BIO':!birthDateMatches?'BIRTH_DATE_CONFLICT_OR_MISSING':current.length&&(!teamMatches||jerseyConflict)?'CURRENT_TEAM_OR_JERSEY_CONFLICT':current.length?'VERIFIED_DOB_CURRENT_TEAM':'VERIFIED_HISTORICAL_DOB_CURRENT_ESPN_PROFILE';
    return{nbaPlayerId:row.nba_player_id,espnAthleteId:row.espn_athlete_id,sourceMatchMethod:row.match_method,status,officialBirthDates,espnBirthDates,currentOfficialRows:current.length,historicalOfficialRows:bio.length,espnProfileRows:profiles.length,teamMatches,jerseyConflict,canonicalPlayerId:players.find(player=>player.sport==='NBA'&&player.externalId===row.nba_player_id)?.playerId??null};
  });
  await writeFile(`${directory}/nba_identity_bridges.json`,JSON.stringify({crosswalkSha256:crosswalkResult.sha256,officialCurrentSha256:nba.proof.sha256,officialPriorSha256:priorRosterResult.sha256,statusCounts:Object.fromEntries([...new Set(bridges.map(row=>row.status))].map(status=>[status,bridges.filter(row=>row.status===status).length])),rows:bridges,developmentWrites:0},null,2)+'\n');
  const discoveryState=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return{aliases:await tx.playerExternalId.findMany({where:{sport:'NBA',provider:'v9-historical'},include:{player:true}}),players:await tx.player.findMany({where:{sport:'NBA'},select:{id:true,displayName:true,isSynthetic:true,isDemo:true}})};});
  const proposedDiscoveries=nba.rows.filter(row=>!players.some(player=>player.sport==='NBA'&&player.externalId===row.player_id)).map(row=>{
    const existing=discoveryState.aliases.find(alias=>alias.externalId===row.player_id),collisions=discoveryState.players.filter(player=>player.displayName.trim().toLowerCase()===row.player.trim().toLowerCase());
    const hex=createHash('sha256').update(`fantasy-evolution-reviewed-nba-2027:${row.player_id}`).digest('hex');
    const proposedPlayerId=`${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    return{sourcePlayerId:row.player_id,proposedPlayerId,displayName:row.player,birthDate:dob(row.birth_date),sourceTeamId:row.team_id,sourceObservedPosition:row.position,eligibilityPositions:[],existingCanonicalPlayerId:existing?.playerId??null,nameCollisionIds:collisions.map(player=>player.id),status:existing?'EXISTING_ID_REQUIRES_REVIEW':collisions.length?'NAME_COLLISION_REQUIRES_REVIEW':'NEW_DIRECT_NBA_ID_REQUIRES_APPROVAL'};
  }).sort((a,b)=>a.sourcePlayerId.localeCompare(b.sourcePlayerId));
  await writeFile(`${directory}/nba_discovery_manifest.json`,JSON.stringify({version:'nba-direct-id-discovery-2027-1',sourceReference:nba.source.sourceUrl,sourceSha256:nba.proof.sha256,targetFingerprint:fingerprint(proposedDiscoveries),expectedNewPlayers:proposedDiscoveries.filter(row=>row.status==='NEW_DIRECT_NBA_ID_REQUIRES_APPROVAL').length,developmentWrites:0,currentEligibilityChanges:0,rows:proposedDiscoveries},null,2)+'\n');
  const review={developmentWrites:0,sourceReleases:releases,nfl:{statisticsRows:nfl.rows.length,positions:count(nfl.rows,'position'),rosterPositions:count(roster.rows,'position'),rosterColumns:Object.keys(roster.rows[0]??{}),status:count(roster.rows,'status')},nba:{sourceRows:nba.rows.length,positions:count(nba.rows,'position'),espnPositions:count(espn.rows,'position_abbreviation'),espnPositionNames:count(espn.rows,'position_name'),espnStatuses:count(espn.rows,'status_name'),crosswalk:{rows:crosswalk.length,columns:Object.keys(crosswalk[0]??{}),examples:crosswalk.slice(0,2),sha256:crosswalkResult.sha256},teamCrosswalk:{rows:teamCrosswalk.length,columns:Object.keys(teamCrosswalk[0]??{}),example:teamCrosswalk[0]},priorRoster:{rows:priorRoster.length,sha256:priorRosterResult.sha256},unmatchedImported:players.filter(player=>player.sport==='NBA'&&!nbaIds.has(player.externalId)).map(player=>({canonicalPlayerId:player.playerId,sourcePlayerId:player.externalId,name:player.player.displayName})),candidateDiscoveries:nba.rows.filter(row=>!players.some(player=>player.sport==='NBA'&&player.externalId===row.player_id))},nhl:{skaterRows:nhl.rows.length,skaterPositions:count(nhl.rows,'position'),goalieRows:goalies.rows.length,goalieColumns:Object.keys(goalies.rows[0]??{}),goalieDecisions:count(goalies.rows,'decision')}};
  await writeFile(`${directory}/current_evidence_review.json`,JSON.stringify(review,null,2)+'\n');
  console.log(JSON.stringify({nfl:review.nfl,nba:{sourceRows:review.nba.sourceRows,positions:review.nba.positions,unmatchedImported:review.nba.unmatchedImported,candidateDiscoveries:review.nba.candidateDiscoveries.length,crosswalk:review.nba.crosswalk},nhl:review.nhl},null,2));
}finally{await db.$disconnect();}
