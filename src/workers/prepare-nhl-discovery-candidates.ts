/** Four bounded current-release identity proposals. Read-only canonical collision audit; no creation. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
const ids=['8477573','8479406','8482451','8484821'],path='data/provider_previews/capability_review/nhl_rosters_2027.csv',proof=JSON.parse(await readFile(path+'.source.json','utf8')),bytes=await readFile(`data/provider_previews/objects/${proof.sha256}`);
if(createHash('sha256').update(bytes).digest('hex')!==proof.sha256)throw Error('NHL source object changed.');
const rows=parse(bytes,{columns:true,skip_empty_lines:true}) as Record<string,string>[];
const db=getDatabase();try{
 const names=[...new Set(rows.filter(row=>ids.includes(row.player_id)).map(row=>row.full_name))];
 const state=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return{aliases:await tx.playerExternalId.findMany({where:{sport:'NHL',provider:'v9-historical',externalId:{in:ids}}}),nameCollisions:await tx.player.findMany({where:{sport:'NHL',OR:names.map(name=>({displayName:{equals:name,mode:'insensitive'}}))},select:{id:true,displayName:true,isSynthetic:true,isDemo:true,externalIds:{select:{provider:true,externalId:true}},_count:{select:{gameStats:true,rosterEntries:true}}}})};},{isolationLevel:'RepeatableRead'});
 const candidates=ids.map(id=>{const records=rows.flatMap((row,index)=>row.player_id===id?[{sourceLine:index+2,rowSha256:fingerprint(row),record:row}]:[]),names=[...new Set(records.map(row=>row.record.full_name))],latest=records.map(row=>row.record.game_date).sort().at(-1),aliases=state.aliases.filter(row=>row.externalId===id),nameCollisions=state.nameCollisions.filter(row=>names.some(name=>row.displayName.toLocaleLowerCase()===name.toLocaleLowerCase()));
  const digest=createHash('sha256').update(`reviewed-nhl-direct-identity:${id}`).digest('hex').slice(0,32),proposedPlayerId=`${digest.slice(0,8)}-${digest.slice(8,12)}-8${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20)}`;
  return{sourcePlayerId:id,sourceNamespace:'NHL_OFFICIAL_PLAYER_ID',proposedAliasProvider:'v9-historical',proposedPlayerId,recordedNames:names,latestSourceDate:latest??null,sourceDatePrecision:'DAY',firstObservedAt:proof.receivedAt,actualEffectiveAt:null,officialPublishedAt:null,expectedExistingAliases:aliases,nameCollisions,records,status:aliases.length?'CANONICAL_ALIAS_ALREADY_EXISTS_REVIEW':names.length!==1||nameCollisions.length?'HOLD_IDENTITY_CONFLICT_REVIEW':'DIRECT_ID_DISCOVERY_PROPOSED_REQUIRES_EXACT_REVIEW',ownershipChanges:0,canonicalCreationApplied:false};});
 const report={version:'nhl-four-direct-discovery-candidates-1',sourceProof:proof,candidates,developmentWrites:0,nameOnlyMerges:0,approvalRequired:true,proposedScopeOnly:true};
 await writeFile('data/provider_previews/player_snapshot_review/nhl_discovery_candidates.json',JSON.stringify({...report,fingerprint:fingerprint(report)},null,2)+'\n');
 console.log(JSON.stringify({fingerprint:fingerprint(report),candidates:candidates.map(({sourcePlayerId,recordedNames,status,nameCollisions,records})=>({sourcePlayerId,recordedNames,status,nameCollisions:nameCollisions.length,sourceRows:records.length})),developmentWrites:0},null,2));
}finally{await db.$disconnect();}
