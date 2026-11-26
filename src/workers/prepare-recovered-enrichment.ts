import { mkdir, readFile, writeFile } from "node:fs/promises";
import { csvRecords, canonicalId } from "@/ingestion/recovered-archives";
import { classifyNbaPosition, parsePositionList, reconcileMlbCounts, type RecoveredPositionRow } from "@/ingestion/position-recovery";
import { fingerprint } from "@/ingestion/contracts";
import { hashFile } from "@/imports/csv";
const root="data/raw/recovered", output="data/position_enrichment";
await mkdir(output,{recursive:true});await mkdir("data/stat_enrichment",{recursive:true});
const inventory=JSON.parse(await readFile(`${output}/recovered_inventory.json`,"utf8")) as {file:string;sha256:string}[];
for(const file of inventory)if(await hashFile(`${root}/${file.file}`)!==file.sha256)throw new Error(`Recovered source changed: ${file.file}`);
async function grouped(name:string) {
 const groups=new Map<string,RecoveredPositionRow[]>();let line=1;
 for await(const raw of csvRecords(`${root}/${name}`)) {
  line++;const data=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,String(value??"")])) as Record<string,string>;
  data.player_id=canonicalId(data.player_id);data.team_id=canonicalId(data.team_id);
  const key=`${data.player_id}:${data.season.slice(0,4)}`;
  const list=groups.get(key)??[];list.push({line,data});groups.set(key,list);
 }
 return groups;
}
const mlb=await grouped("mlb_positions_repaired.csv"),nba=await grouped("nba_positions_repaired.csv");
const rosterColumns=["season","player_id","player_name","team_id","team","position","position_source"];
const rosterHash=(data:Record<string,string>)=>fingerprint(rosterColumns.map(k=>data[k]??""));
const rosterRows=new Map<string,number>();let originalRosterRows=0;
for await(const raw of csvRecords(`${root}/_nba_player_positions_2016_2026.csv`)){
 const data=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,String(value??"")])) as Record<string,string>;
 data.player_id=canonicalId(data.player_id);data.team_id=canonicalId(data.team_id);
 const hash=rosterHash(data);rosterRows.set(hash,(rosterRows.get(hash)??0)+1);originalRosterRows++;
}
let matchedRosterRows=0;
for(const rows of nba.values())for(const {data}of rows){const hash=rosterHash(data),remaining=rosterRows.get(hash)??0;if(remaining){matchedRosterRows++;rosterRows.set(hash,remaining-1);}}
const mlbRows=[...mlb].map(([key,rows])=>({key,playerExternalId:rows[0].data.player_id,seasonStartYear:Number(rows[0].data.season.slice(0,4)),sourceRows:rows.map(r=>({line:r.line,sha256:fingerprint(r.data),listedPositions:parsePositionList(r.data.verified_eligible_positions??"")})),...reconcileMlbCounts(rows)}));
const nbaRows=[...nba].map(([key,rows])=>({key,playerExternalId:rows[0].data.player_id,seasonStartYear:Number(rows[0].data.season.slice(0,4)),records:rows.map(r=>({line:r.line,sha256:fingerprint(r.data),...classifyNbaPosition(r.data)}))}));
const conflicts=(groups:Map<string,RecoveredPositionRow[]>,populated:boolean)=>[...groups.values()].filter(rows=>new Set(rows.map(r=>parsePositionList(r.data.verified_eligible_positions??"").join(",")).filter(s=>!populated||s)).size>1).length;
const embedded={rows:0,populated:0,withSameSeasonRepair:0,exactTeamEstimateMatch:0,seasonEstimateUnionMatch:0,withoutRepair:0,currentSeasonRows:0,currentSeasonPlayers:new Set<string>()};
for await(const row of csvRecords(`${root}/nba_2016-2027_final.csv`)) {
 embedded.rows++;const positions=parsePositionList(String(row.position??""));const year=String(row.SOURCE_SEASON??row.SEASON_YEAR).slice(0,4),id=canonicalId(row.PLAYER_ID);
 if(year==="2026"){embedded.currentSeasonRows++;embedded.currentSeasonPlayers.add(id);}
 if(!positions.length)continue;embedded.populated++;
 const repairs=nba.get(`${id}:${year}`);if(!repairs){embedded.withoutRepair++;continue;}embedded.withSameSeasonRepair++;
 const expected=positions.join(",");
 if(repairs.some(r=>r.data.team_id===canonicalId(row.TEAM_ID)&&parsePositionList(r.data.verified_eligible_positions??"").join(",")===expected))embedded.exactTeamEstimateMatch++;
 if([...new Set(repairs.flatMap(r=>parsePositionList(r.data.verified_eligible_positions??"")))].sort().join(",")===expected)embedded.seasonEstimateUnionMatch++;
}
const goalieDecisions:Record<string,number>={};let goalieRows=0;
for await(const row of csvRecords(`${root}/nhl_2016_2027_final.csv`))if(row.category==="goalies"){goalieRows++;const decision=String(row.decision||"UNKNOWN");goalieDecisions[decision]=(goalieDecisions[decision]??0)+1;}
const summary={sourceFingerprints:inventory,mlb:{playerSeasons:mlbRows.length,conflictingPopulatedLists:conflicts(mlb,true),statusCounts:Object.fromEntries([...new Set(mlbRows.map(r=>r.status))].map(s=>[s,mlbRows.filter(r=>r.status===s).length])),requiresTeamScopeValidation:mlbRows.filter(r=>r.possibleCombinedRequiresScopeVerification.length).length},nba:{playerSeasons:nbaRows.length,conflictingPopulatedLists:conflicts(nba,true),conflictsIncludingEmpty:conflicts(nba,false),embedded:{...embedded,currentSeasonPlayers:embedded.currentSeasonPlayers.size},qualityCounts:Object.fromEntries(["ESTIMATED","MANUAL_REVIEW","UNMATCHED"].map(q=>[q,nbaRows.flatMap(r=>r.records).filter(r=>r.quality===q).length]))},nhl:{goalieRows,goalieDecisions,missingFields:["exactFaceoffWins","shorthandedPoints","explicitShutoutEvidence"],supplementaryValuesRecovered:0,reason:"Recovered statistics normalize identically to accepted archive. Decision absence remains unknown; no percentages or zero-goals inference."},currentEligibilityChanges:0};
await writeFile(`${output}/mlb_recorded_threshold_candidates.json`,JSON.stringify({sourceFingerprint:inventory.find(r=>r.file==="mlb_positions_repaired.csv")?.sha256,rows:mlbRows},null,2)+"\n");
await writeFile(`${output}/nba_historical_estimates.json`,JSON.stringify({sourceFingerprint:inventory.find(r=>r.file==="nba_positions_repaired.csv")?.sha256,rows:nbaRows},null,2)+"\n");
await writeFile("data/stat_enrichment/nhl_recovery_gaps.json",JSON.stringify(summary.nhl,null,2)+"\n");
await writeFile(`${output}/reconciliation_summary.json`,JSON.stringify({...summary,originalNbaRosterComparison:{originalRows:originalRosterRows,matchedRows:matchedRosterRows,unmatchedRows:originalRosterRows-matchedRosterRows},derivedFingerprints:{mlb:await hashFile(`${output}/mlb_recorded_threshold_candidates.json`),nba:await hashFile(`${output}/nba_historical_estimates.json`)}},null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
