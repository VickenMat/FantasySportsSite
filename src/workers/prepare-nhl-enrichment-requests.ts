import "dotenv/config";
import {mkdir,writeFile}from"node:fs/promises";
import{getDatabase}from"@/lib/db";
import{fingerprint}from"@/ingestion/contracts";
const db=getDatabase();
try{
 const stats=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  return tx.playerGameStat.findMany({where:{provider:"v9-historical",player:{sport:"NHL",isSynthetic:false}},orderBy:[{revision:"desc"},{id:"asc"}],distinct:["gameId","playerId","role"],select:{id:true,contentHash:true,role:true,normalized:true,raw:true,playerId:true,gameId:true,player:{select:{externalIds:{where:{sport:"NHL",provider:"v9-historical"},select:{externalId:true}}}},game:{select:{externalId:true}}}});
 });
 const counts:Record<string,number>={};
 const rows=stats.map(stat=>{
  const values=stat.normalized as Record<string,number|null>;
  const keys=stat.role==="GOALIE"?["goalie_win","shutout"]:["faceoff_wins","shorthanded_points_bonus"];
  const missingFields=keys.filter(k=>values[k]==null);
  const raw=stat.raw as Record<string,unknown>;
  const needsExplicitShutoutCredit=stat.role==="GOALIE"&&values.shutout===1&&raw.shutout==null;
  if(needsExplicitShutoutCredit&&!missingFields.includes("shutout"))missingFields.push("shutout");
  for(const k of missingFields)counts[k]=(counts[k]??0)+1;
  const identifiers=stat.player.externalIds.map(p=>p.externalId);
  return{priorStatId:stat.id,priorContentHash:stat.contentHash,canonicalPlayerId:stat.playerId,canonicalGameId:stat.gameId,sourceGameId:stat.game.externalId,sourcePlayerId:identifiers.length===1?identifiers[0]:null,role:stat.role,missingFields,needsExplicitShutoutCredit,identityStatus:identifiers.length===1?"EXPLICIT_CANONICAL_MAPPING":"QUARANTINED"};
 }).filter(row=>row.missingFields.length).sort((a,b)=>a.priorStatId.localeCompare(b.priorStatId));
 const report={importedStatRows:stats.length,requestedStatRows:rows.length,missingFieldCounts:counts,targetFingerprint:fingerprint(rows),availableSupplementaryValues:0,databaseWrites:0,sourcePolicy:"Acquire only these missing fields from a permitted source. Never infer integer faceoffs from percentages, shutouts from zero goals, or unknown goalie decisions from absence."};
 await mkdir("data/stat_enrichment",{recursive:true});await writeFile("data/stat_enrichment/nhl_targeted_requests.json",JSON.stringify({report,rows},null,2)+"\n");console.log(JSON.stringify(report,null,2));
}finally{await db.$disconnect();}
