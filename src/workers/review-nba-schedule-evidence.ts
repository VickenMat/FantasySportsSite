import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { fetchPublicData } from '@/ingestion/http';
import { csvRecords } from '@/ingestion/recovered-archives';
import { fingerprint } from '@/ingestion/contracts';
import { hashFile } from '@/imports/csv';
import { getDatabase } from '@/lib/db';

// Targeted licensed crosswalk supplements only; accepted V5 inputs are immutable.
const release = JSON.parse(await readFile('data/provider_previews/sportsdataverse/nba_crosswalk.release.json', 'utf8'));
const directory = 'data/provider_previews/sportsdataverse/schedule-crosswalks';
await mkdir(directory, { recursive: true });
const digest = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
const targets = ['0021900888','0021900894','0021900886','0021900848','401909450','401909451','401909452','401909453','401909454'];
type SourceProof={sourceUrl:string;sha256:string;bytes:number;requests:number;requestCount?:number;receivedAt:string;artifactUpdatedAt:string;lastModified:string|null;etag:string|null;license:string;licenseReference:string;officialPublishedAt:null};
type Product={season:number;source:SourceProof;newRequests:number;rows:number;columns:string[];matches:{target:string;records:Record<string,string>[]}[]};
const products:Product[] = [];
for (const season of [2020, 2027]) {
  const filename = `nba_schedule_crosswalk_${season}.csv`;
  const asset = release.assets.find((row: { name: string }) => row.name === filename);
  if (!asset || asset.size > 512 * 1024 || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) throw Error('Expected bounded fingerprinted crosswalk release.');
  const path = `${directory}/${filename}`, metadataPath = `${directory}/${filename.replace(/\.csv$/,'')}.source.json`;
  let body: Uint8Array, metadata:SourceProof, newRequests = 0;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return readFile(`${path}.source.json`,'utf8');})); body = await readFile(path);
    if (digest(body) !== metadata.sha256 || metadata.sourceUrl !== asset.browser_download_url) throw Error('Crosswalk cache changed.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const response = await fetchPublicData({ sourceUrl: asset.browser_download_url, allowedHosts: ['github.com','release-assets.githubusercontent.com'], maxBytes: 512 * 1024, timeoutMs: 60000, permission: 'OPEN_DATA_PREVIEW' });
    if (response.status === 'PENDING_PERMISSION') throw Error('Crosswalk retrieval disabled.');
    body = response.cache.body;
    newRequests = response.requests;
    if (`sha256:${digest(body)}` !== asset.digest) throw Error('Crosswalk release fingerprint mismatch.');
    metadata = { sourceUrl: asset.browser_download_url, sha256: digest(body), bytes: body.length, requests: response.requests, receivedAt: response.receivedAt, artifactUpdatedAt: asset.updated_at, lastModified: response.cache.lastModified, etag: response.cache.etag, license: 'CC-BY-4.0', licenseReference: 'https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md', officialPublishedAt: null };
    await writeFile(path, body); await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  }
  const rows = parse(body, { columns: true, skip_empty_lines: true, bom: true }) as Record<string,string>[];
  metadata.requestCount=metadata.requests;
  await writeFile(metadataPath,JSON.stringify(metadata,null,2)+'\n');
  const matches = targets.map(target => ({ target, records: rows.filter(row => Object.values(row).some(value => value === target || /^\d+$/.test(value) && value.padStart(10,'0') === target)) }));
  await mkdir('data/provider_previews/objects', { recursive: true });
  const objectPath = `data/provider_previews/objects/${metadata.sha256}`;
  try { await writeFile(objectPath, body, { flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || digest(await readFile(objectPath)) !== metadata.sha256) throw error; }
  products.push({ season, source: metadata, newRequests, rows: rows.length, columns: Object.keys(rows[0] ?? {}), matches });
}
await mkdir('data/schedule_enrichment', { recursive: true });
const archivePath='data/raw/recovered/nba_2016-2027_final.csv', schedulePath='data/schedule_data/game_schedules.parquet';
const sourceFingerprints={archive:await hashFile(archivePath),v5Schedule:await hashFile(schedulePath)};
if(sourceFingerprints.archive!=='4f9b193fe1bb896817925395987609dc07e86086d376cda7c30e5a31dd4dc81b'||sourceFingerprints.v5Schedule!=='1724f7cc6143615036aee574de27aced3b9789de046a68b4991c399b6816671c')throw Error('Accepted evidence fingerprint changed.');
const archive=new Map<string,{date:string;teams:Map<string,{points:number;rows:number}>}>();
for await(const row of csvRecords(archivePath)){
  const id=row.GAME_ID.replace(/\.0$/,'').padStart(10,'0');if(!targets.slice(0,4).includes(id))continue;
  if(!row.PTS?.trim()||!Number.isInteger(Number(row.PTS))||Number(row.PTS)<0)throw Error('Target game has unknown scoring totals.');
  const game=archive.get(id)??{date:row.GAME_DATE.slice(0,10),teams:new Map()};if(game.date!==row.GAME_DATE.slice(0,10))throw Error('Archive date conflict.');
  const team=game.teams.get(row.TEAM_ID)??{points:0,rows:0};team.points+=Number(row.PTS);team.rows++;game.teams.set(row.TEAM_ID,team);archive.set(id,game);
}
const schedule=await parquetReadObjects({file:await asyncBufferFromFile(schedulePath),columns:['sport','season','game_id','game_date','start_time_utc','home_team','away_team','home_team_id','away_team_id','home_score','away_score','status','source']});
const candidateRows=products[0].matches.filter(row=>row.records.length).map(match=>{
  if(match.records.length!==1)throw Error('Ambiguous NBA identity record.');const source=match.records[0],record=archive.get(match.target)!;
  const sameTeams=schedule.filter(row=>row.sport==='NBA'&&String(row.home_team_id)===source.home_espn_team_id&&String(row.away_team_id)===source.away_espn_team_id&&Math.abs(Date.parse(String(row.game_date))-Date.parse(source.game_date))<=86400000);
  const home=record.teams.get(source.nba_home_team_id),away=record.teams.get(source.nba_away_team_id);
  const candidates=sameTeams.filter(row=>home&&away&&Number(row.home_score)===home.points&&Number(row.away_score)===away.points);
  return{archiveGameId:match.target,sourceDate:source.game_date,archiveDate:record.date,nbaHomeTeamId:source.nba_home_team_id,nbaAwayTeamId:source.nba_away_team_id,homeEspnTeamId:source.home_espn_team_id,awayEspnTeamId:source.away_espn_team_id,homePoints:home?.points??null,awayPoints:away?.points??null,archivePlayerRows:[...record.teams.values()].reduce((sum,value)=>sum+value.rows,0),yahooGameId:source.yahoo_game_id,status:'PROPOSED_CORROBORATED_NOT_APPROVED',evidenceFingerprints:{...sourceFingerprints,licensedCrosswalk:products[0].source.sha256},directEspnBridgePresent:Boolean(source.espn_game_id),sameTeamNearbyDateCandidates:sameTeams.length,matchingScoreCandidates:candidates.map(row=>({scheduleExternalId:String(row.game_id),scheduleDate:String(row.game_date),acceptedV5StartsAt:row.start_time_utc instanceof Date?row.start_time_utc.toISOString():String(row.start_time_utc),status:String(row.status),source:String(row.source)})),dateConflictRetained:true,actualStartVerified:false,completionInstantVerified:false,officialPublicationVerified:false};
});
let canonicalTargets:unknown[]=[];
if(process.argv.includes('--canonical-targets')){
 const db=getDatabase();try{canonicalTargets=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;const output=[];for(const row of candidateRows){const candidate=row.matchingScoreCandidates[0];if(row.matchingScoreCandidates.length!==1)continue;const prior=await tx.historicalGameCrosswalk.findFirst({where:{sport:'NBA',archiveGameId:row.archiveGameId},orderBy:{importedAt:'desc'}});const games=await tx.game.findMany({where:{sport:'NBA',OR:[{provider:'schedule-v5',externalId:candidate.scheduleExternalId},{provider:'v9-historical',externalId:row.archiveGameId}]},select:{id:true,provider:true,externalId:true,seasonId:true,gameDate:true,startsAt:true,_count:{select:{gameStats:true,leagueAssignments:true,scoreLedgers:true,lineupSnapshots:true}}},orderBy:{provider:'asc'}});output.push({...row,priorCrosswalk:prior,games});}return output;},{timeout:30000});}finally{await db.$disconnect();}
}
const report={version:'nba-crosswalk-evidence-1',developmentWrites:0,v5Changes:0,newRequests:products.reduce((sum,row)=>sum+row.newRequests,0),sourceFingerprints,products,candidateRows,canonicalTargets};
await writeFile('data/schedule_enrichment/nba_crosswalk_review.json',JSON.stringify(report,null,2)+'\n');
const serializableTargets=JSON.parse(JSON.stringify(canonicalTargets));
if(canonicalTargets.length)await writeFile('data/schedule_enrichment/nba_candidate_bridge_manifest.json',JSON.stringify({version:'nba-corroborated-identity-candidates-1',status:'PROPOSED_CORROBORATED_NOT_APPROVED',fingerprint:fingerprint(serializableTargets),sourceFingerprints,sources:products.map(row=>row.source),rows:serializableTargets,developmentWrites:0},null,2)+'\n');
console.log(JSON.stringify({products:products.map(row=>({season:row.season,records:row.rows,sha256:row.source.sha256})),newRequests:report.newRequests,corroboratedIdentityCandidates:candidateRows.filter(row=>row.matchingScoreCandidates.length===1).length,resolvedCrosswalks:0,resolvedStarts:0,canonicalTargets:canonicalTargets.length,developmentWrites:0}));
