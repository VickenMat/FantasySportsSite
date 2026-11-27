import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse';

// Aggregate archive readiness only. No scoring optimization or operational import.
const audit = JSON.parse(await readFile('reports/m2-5-analysis.json','utf8'));
const recovery = JSON.parse(await readFile('reports/m5-recovered-data-audit.json','utf8'));
const current = JSON.parse(await readFile('reports/m5-real-data-integration.json','utf8'));
let operational=null;try{operational=JSON.parse(await readFile('reports/m5-operational-application.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
async function sha(path) { const hash=createHash('sha256'); for await(const chunk of createReadStream(path))hash.update(chunk); return hash.digest('hex'); }
const archives=[];
for(const report of audit.reports){
 const path=`data/player_data/${report.source.path}`,actual=await sha(path);
 if(actual!==report.source.sha256)throw Error(`Accepted archive changed: ${report.sport}`);
 archives.push({sport:report.sport,file:report.source.path,sha256:actual,physicalRows:report.totals.rows,priorAcceptedRows:report.totals.acceptedRows,priorQuarantinedRows:report.totals.quarantinedRows,seasons:report.seasons.map(row=>({season:row.label,startYear:row.season,physicalRows:row.rows,acceptedRows:row.acceptedRows,quarantinedRows:row.quarantinedRows,players:row.players,games:row.games,coverage:row.coverage,coverageReason:row.coverageReason,priorMissingStatistics:row.missingStatistics}))});
}
const nhlPath='data/raw/recovered/nhl_2016_2027_final.csv';
const expected=recovery.sources.find(row=>row.file==='nhl_2016_2027_final.csv').sha256;
if(await sha(nhlPath)!==expected)throw Error('Recovered NHL source changed.');
const nhlSeasons=new Map();let nhlRows=0;
const number=value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
for await(const row of createReadStream(nhlPath).pipe(parse({columns:true,bom:true,skip_empty_lines:true,max_record_size:256*1024}))){
 nhlRows++;const season=String(row.season);if(!nhlSeasons.has(season))nhlSeasons.set(season,{season,rows:0,skaterRows:0,goalieRows:0,exactFaceoffMissing:0,shorthandedPointMissing:0,goalieWinMissing:0,shutoutEvidenceMissing:0,explicitPositiveShutoutCredits:0,zeroIceTimeGoalieRows:0,unknownIceTimeGoalieRows:0,legacy65MinuteInferenceCandidates:0});const out=nhlSeasons.get(season);out.rows++;
 if(row.category!=='goalies'){out.skaterRows++;if(number(row.faceoff_wins)===null)out.exactFaceoffMissing++;if(number(row.shorthanded_points_bonus)===null)out.shorthandedPointMissing++;continue;}
 out.goalieRows++;const match=/^(\d{1,3}):([0-5]\d)$/.exec(row.toi?.trim()??''),seconds=match?Number(match[1])*60+Number(match[2]):null;if(seconds===0)out.zeroIceTimeGoalieRows++;if(seconds===null)out.unknownIceTimeGoalieRows++;
 const win=number(row.goalie_win),decision=row.decision?.trim();if(win===null&&!['W','L','O'].includes(decision)&&seconds!==0)out.goalieWinMissing++;
 const credit=number(row.shutout),against=number(row.goalsAgainst);
 if(credit===1)out.explicitPositiveShutoutCredits++;
 if(credit===null&&!(against!==null&&against>0)&&seconds!==0)out.shutoutEvidenceMissing++;
 if(credit===null&&against===0&&seconds===3900&&String(row.starter).toLowerCase()==='true'&&String(row.game_id).slice(4,6)==='02')out.legacy65MinuteInferenceCandidates++;
}
if(nhlRows!==506116)throw Error('Unexpected NHL archive size.');
const mlbPath='data/raw/recovered/mlb_2016_2026_final.csv';
if(await sha(mlbPath)!==recovery.sources.find(row=>row.file==='mlb_2016_2026_final.csv').sha256)throw Error('Recovered MLB source changed.');
const mlbRoles=new Map(),mlbSeasons=new Map();let mlbRows=0;
for await(const row of createReadStream(mlbPath).pipe(parse({columns:true,bom:true,skip_empty_lines:true,max_record_size:256*1024}))){
 mlbRows++;const season=String(row.season).slice(0,4),category=String(row.category).toLowerCase();
 const role=category==='batting'?1:category==='pitching'?2:null;if(!role)throw Error('Unsupported MLB role category.');
 const player=String(row.player_id).replace(/\.0$/,''),game=String(row.game_id).replace(/\.0$/,''),key=`${season}:${game}:${player}`;
 const previous=mlbRoles.get(key)??0,next=previous|role;mlbRoles.set(key,next);
 if(!mlbSeasons.has(season))mlbSeasons.set(season,{season,physicalRoleRows:0,pairedAppearances:0,pairedPlayers:new Set()});const out=mlbSeasons.get(season);out.physicalRoleRows++;
 if(next===3&&previous!==3){out.pairedAppearances++;out.pairedPlayers.add(player);}
}
if(mlbRows!==794974)throw Error('Unexpected MLB archive size.');
const mlbArchiveRolePairs=[...mlbSeasons.values()].sort((a,b)=>a.season.localeCompare(b.season)).map(row=>({...row,pairedPlayers:row.pairedPlayers.size}));
const output={version:'m5-dataset-readiness-1',generatedAt:new Date().toISOString(),sourceAudit:'reports/m2-5-analysis.json',sourceAuditVersion:audit.reportVersion,archiveHashesFreshlyVerified:true,m6Started:false,v10Active:false,developmentWrites:0,physicalRows:archives.reduce((n,row)=>n+row.physicalRows,0),archives,nhlEvidenceAwareArchive:[...nhlSeasons.values()].sort((a,b)=>a.season.localeCompare(b.season)),mlbArchiveRolePairs,mlbCanonicalPlayerGames:mlbRoles.size,currentImportedCompleteness:operational?.actualDevelopmentCompleteness??current.actualDevelopmentCompleteness,operationalOverlay:operational?{report:"reports/m5-operational-application.json",acceptedProfessionalIdentities:operational.acceptedProfessionalIdentities,rosterOnlyNoArchiveIdentities:operational.rosterOnlyNoArchiveIdentities,identitiesWithoutAnyAcceptedStat:operational.identitiesWithoutAnyAcceptedStat,anyStatPlayers:operational.anyStatPlayers,postOperationalCohorts:operational.postOperationalCohorts,mlbHistoricalPositions:operational.mlbHistoricalPositions,currentEligibilityPromoted:operational.currentEligibilityPromoted,nbaPolicy:"NBA_GRANULAR_FAMILY_OBSERVED_V1",familyMappingMustBeModeledInM6:true}:null,positionRecovery:{mlb:recovery.mlb,nba:recovery.nba},currentImportedRoleSelection:{materializedAppearances:operational?213:197,remainingAmbiguousAppearances:operational?2:18,remainingAmbiguousPlayers:operational?2:18,fullArchivePairedRoleAppearances:mlbArchiveRolePairs.reduce((sum,row)=>sum+row.pairedAppearances,0),scope:'Validated role selections apply only to the imported 2026 target; other seasons need the same evidence policy, not hindsight score selection.'},cautions:['Current imported completeness is not a complete season or archive-wide completeness.','Prior NHL missing-stat audit predates the explicit shutout evidence correction; current evidence-aware counts are separately supplied.','NBA repaired minutes estimates are retrospective evidence, not dated authoritative eligibility.','NHL zero-TOI backup rows do not establish played-game participation.','Season coverage classifications are retained prior audit classifications, not fresh independent schedule verification.']};
await writeFile('reports/m5-dataset-readiness.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({archives:archives.length,seasons:archives.reduce((sum,row)=>sum+row.seasons.length,0),physicalRows:output.physicalRows,nhlRows,nhlUnknownShutouts:output.nhlEvidenceAwareArchive.reduce((sum,row)=>sum+row.shutoutEvidenceMissing,0),nhlZeroIceTimeGoalieRows:output.nhlEvidenceAwareArchive.reduce((sum,row)=>sum+row.zeroIceTimeGoalieRows,0),legacy65MinuteInferenceCandidates:output.nhlEvidenceAwareArchive.reduce((sum,row)=>sum+row.legacy65MinuteInferenceCandidates,0),mlbArchivePairedRoles:output.currentImportedRoleSelection.fullArchivePairedRoleAppearances,developmentWrites:0,m6Started:false}));
