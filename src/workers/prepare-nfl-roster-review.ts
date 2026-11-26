import 'dotenv/config';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { sourceProduct } from '@/ingestion/open-data/read';
import { fingerprint } from '@/ingestion/contracts';
import type { ReviewedNflRosterManifest } from '@/server/reviewed-nfl-roster';

const db=getDatabase();
try{
 const source=await sourceProduct('nfl-rosters-2026');
 const state=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return{aliases:await tx.playerExternalId.findMany({where:{sport:'NFL',provider:'v9-historical'},include:{player:true}}),players:await tx.player.findMany({where:{sport:'NFL'},select:{id:true,displayName:true,isSynthetic:true,isDemo:true}})};});
 const groups=new Map<string,{row:Record<string,string>;line:number}[]>(),held:unknown[]=[];
 for(const[index,row]of source.rows.entries()){if(!/^00-\d{7}$/.test(row.gsis_id)){held.push({line:index+2,sourcePlayerId:row.gsis_id,status:'MISSING_STANDARD_GSIS_ID'});continue;}groups.set(row.gsis_id,[...(groups.get(row.gsis_id)??[]),{row,line:index+2}]);}
 const nameIds=new Map<string,Set<string>>();for(const[id,rows]of groups)for(const{row}of rows){const key=row.full_name.trim().toLowerCase();nameIds.set(key,new Set([...(nameIds.get(key)??[]),id]));}
 const candidates:ReviewedNflRosterManifest['candidates']=[],resolved:{gsisId:string;playerId:string;row:Record<string,string>;sourceRows:number[];existing:boolean}[]=[];
 for(const[gsisId,records]of groups){
  const signatures=new Set(records.map(({row})=>fingerprint([row.full_name,row.birth_date,row.team,row.position,row.espn_id])));
  if(signatures.size!==1){held.push({sourcePlayerId:gsisId,sourceRows:records.map(row=>row.line),status:'CONFLICTING_SOURCE_ID_RECORDS'});continue;}
  const row=records[0].row,existing=state.aliases.find(alias=>alias.externalId===gsisId);
  if(existing){if(existing.player.isSynthetic||existing.player.isDemo){held.push({sourcePlayerId:gsisId,canonicalPlayerId:existing.playerId,status:'EXISTING_SYNTHETIC_OR_DEMO_ID_REQUIRES_REVIEW'});continue;}resolved.push({gsisId,playerId:existing.playerId,row,sourceRows:records.map(row=>row.line),existing:true});continue;}
  const collision=state.players.filter(player=>player.displayName.trim().toLowerCase()===row.full_name.trim().toLowerCase()),sameNameIds=[...(nameIds.get(row.full_name.trim().toLowerCase())??[])];
  const related=sameNameIds.flatMap(id=>groups.get(id)??[]),dates=related.map(record=>record.row.birth_date);
  const sameNameDistinct=sameNameIds.length<=1||dates.every(date=>/^\d{4}-\d{2}-\d{2}$/.test(date))&&new Set(dates).size===sameNameIds.length;
  const distinctNameProofs:NonNullable<ReviewedNflRosterManifest['candidates'][number]['distinctNameProofs']>=[];
  let collisionsResolved=true;
  for(const other of collision){if(other.isSynthetic||other.isDemo){distinctNameProofs.push({otherCanonicalPlayerId:other.id,otherGsisId:null,otherBirthDate:null,basis:'EXISTING_SYNTHETIC_OR_DEMO_RECORD',sourceRows:records.map(record=>record.line)});continue;}const anchors=state.aliases.filter(alias=>alias.playerId===other.id&&groups.has(alias.externalId));if(anchors.length!==1){collisionsResolved=false;continue;}const old=groups.get(anchors[0].externalId)!;const oldDates=new Set(old.map(record=>record.row.birth_date));const oldDate=[...oldDates][0];if(!/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)||oldDates.size!==1||!/^\d{4}-\d{2}-\d{2}$/.test(oldDate)||row.birth_date===oldDate){collisionsResolved=false;continue;}distinctNameProofs.push({otherCanonicalPlayerId:other.id,otherGsisId:anchors[0].externalId,otherBirthDate:oldDate,basis:'DISTINCT_GSIS_AND_BIRTH_DATE',sourceRows:[...records,...old].map(record=>record.line)});}
  if(!row.full_name.trim()||!collisionsResolved||!sameNameDistinct){held.push({sourcePlayerId:gsisId,displayName:row.full_name,nameCollisionIds:collision.map(player=>player.id),status:'NAME_COLLISION_OR_MISSING_NAME_REQUIRES_REVIEW'});continue;}
  if(!/^[A-Z]{2,4}$/.test(row.team)){held.push({sourcePlayerId:gsisId,sourceTeamId:row.team,status:'SOURCE_TEAM_CODE_REQUIRES_REVIEW'});continue;}
  const hex=createHash('sha256').update(`fantasy-evolution-reviewed-nfl-2026:${gsisId}`).digest('hex'),proposedPlayerId=`${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  candidates.push({sourcePlayerId:gsisId,proposedPlayerId,displayName:row.full_name.trim(),birthDate:row.birth_date||null,sourceTeamId:row.team,sourceObservedPosition:row.position,distinctNameProofs});
  resolved.push({gsisId,playerId:proposedPlayerId,row,sourceRows:records.map(row=>row.line),existing:false});
 }
 const espnGroups=new Map<string,typeof resolved>();
 for(const record of resolved){if(!/^[1-9]\d*$/.test(record.row.espn_id)){held.push({sourcePlayerId:record.gsisId,status:'MISSING_ESPN_ID',existing:record.existing});continue;}espnGroups.set(record.row.espn_id,[...(espnGroups.get(record.row.espn_id)??[]),record]);}
 const bridges:ReviewedNflRosterManifest['bridges']=[];
 for(const[espnAthleteId,records]of espnGroups){if(new Set(records.map(row=>row.gsisId)).size!==1||new Set(records.map(row=>row.playerId)).size!==1){held.push({espnAthleteId,sourcePlayerIds:records.map(row=>row.gsisId),status:'CONFLICTING_SAME_ROW_ESPN_ID'});continue;}const record=records[0];bridges.push({gsisId:record.gsisId,espnAthleteId,playerId:record.playerId,birthDate:record.row.birth_date||null,basis:'EXPLICIT_SAME_ROW_GSIS_ESPN',sourceRows:records.flatMap(row=>row.sourceRows).sort((a,b)=>a-b)});}
 candidates.sort((a,b)=>a.sourcePlayerId.localeCompare(b.sourcePlayerId));bridges.sort((a,b)=>a.espnAthleteId.localeCompare(b.espnAthleteId));
 const report={version:'nfl-roster-review-2026-1',sourceProof:{sourceReference:source.source.sourceUrl,sha256:source.proof.sha256},sourceRows:source.rows.length,standardGsisIds:groups.size,existingRealCanonicalPlayers:resolved.filter(row=>row.existing).length,expectedNewPlayers:candidates.length,expectedEspnAliases:bridges.length,expectedNewAliases:candidates.length+bridges.length,positions:Object.fromEntries([...new Set(candidates.map(row=>row.sourceObservedPosition))].sort().map(position=>[position,candidates.filter(row=>row.sourceObservedPosition===position).length])),candidates,bridges,held,targetFingerprint:fingerprint({candidates,bridges}),developmentWrites:0,currentEligibilityChanges:0};
 await writeFile('data/provider_previews/capability_review/nfl_roster_review.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,candidates:undefined,bridges:undefined,heldCount:held.length,held:held.slice(0,10)},null,2));
}finally{await db.$disconnect();}
