/** Separate exact current-source discovery proposals; read-only PostgreSQL binding. */
import 'dotenv/config';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parse} from 'csv-parse/sync';
import {getDatabase} from '@/lib/db';
import {fingerprint} from '@/ingestion/contracts';
import {professionalPlayerIdentityState} from '@/ingestion/identity-resolutions';
import {validateNhlDirectDiscoverySource} from '@/server/reviewed-nhl-direct-discovery';
import {buildReviewedNbaRosterManifest} from '@/server/reviewed-roster-discovery';
const db=getDatabase(),root='data/operational_enrichment/direct_identity_discovery';
const normalize=(name:string)=>name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g,'');
const uuid=(sport:string,id:string)=>{const hash=createHash('sha256').update(`reviewed-current-direct-identity:${sport}:${id}`).digest('hex').slice(0,32);return`${hash.slice(0,8)}-${hash.slice(8,12)}-8${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20)}`;};
const nba=JSON.parse(await readFile('data/provider_previews/capability_review/nba_game_bindings/player_discovery_candidates.json','utf8')) as {candidates:{externalId:string;sourceSha256:string;sourceRows:{sourceLine:number;row:Record<string,string>}[]}[]};
const nhl=JSON.parse(await readFile('data/provider_previews/player_snapshot_review/nhl_discovery_candidates.json','utf8')) as {sourceProof:{sha256:string;sourceUrl:string};candidates:{sourcePlayerId:string;proposedPlayerId:string;records:{sourceLine:number;record:Record<string,string>}[]}[]};
const nbaSha=[...new Set(nba.candidates.map(row=>row.sourceSha256))];if(nbaSha.length!==1)throw Error('Expected one retained NBA discovery source.');
const nbaSourceUrl='https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_player_boxscores/player_boxscores_2027.csv';
for(const [sha,candidates] of [[nbaSha[0],nba.candidates.map(row=>({records:row.sourceRows.map(value=>({sourceLine:value.sourceLine,row:value.row}))}))],[nhl.sourceProof.sha256,nhl.candidates.map(row=>({records:row.records.map(value=>({sourceLine:value.sourceLine,row:value.record}))}))]] as const){const bytes=await readFile(`data/provider_previews/objects/${sha}`);if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Discovery source object changed.');const records=parse(bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];for(const candidate of candidates)for(const value of candidate.records)if(fingerprint(records[value.sourceLine-2])!==fingerprint(value.row))throw Error('Discovery source row differs from exact retained object.');}
try{
 const result=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const reviewer=await tx.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL},select:{id:true}}),players=await tx.player.findMany({where:{sport:{in:['NBA','NHL']}},select:{id:true,sport:true,displayName:true,isSynthetic:true,isDemo:true}});
  const audit=[];
  for(const [sport,id,names,proposedPlayerId,records] of [...nba.candidates.map(row=>['NBA',row.externalId,[...new Set(row.sourceRows.map(value=>`${value.row.first_name} ${value.row.family_name}`.trim()))],uuid('NBA',row.externalId),row.sourceRows.map(value=>({sourceLine:value.sourceLine,row:value.row}))] as const),...nhl.candidates.map(row=>['NHL',row.sourcePlayerId,[...new Set(row.records.map(value=>value.record.full_name))],row.proposedPlayerId,row.records.map(value=>({sourceLine:value.sourceLine,row:value.record}))] as const)]){
   const identity=await professionalPlayerIdentityState(tx,sport,{provider:'v9-historical',externalId:id},new Date()),collisions=players.filter(player=>player.sport===sport&&names.some(name=>normalize(name)===normalize(player.displayName))),idCollision=players.find(player=>player.id===proposedPlayerId);
   audit.push({sport,sourcePlayerId:id,proposedPlayerId,recordedNames:names,identity,collisions,idCollision:idCollision??null,records,status:identity.status==='MISSING'&&names.length===1&&!collisions.length&&!idCollision?'EXACT_DIRECT_ID_PROPOSAL_READY':'REVIEW_REQUIRED'});
  }
  const rows=audit.filter(row=>row.sport==='NBA'&&row.status==='EXACT_DIRECT_ID_PROPOSAL_READY').map(row=>({sourcePlayerId:row.sourcePlayerId,proposedPlayerId:row.proposedPlayerId,displayName:row.recordedNames[0],birthDate:null,sourceTeamId:row.records[0].row.team_id,sourceObservedPosition:row.records[0].row.position??'',status:'NEW_DIRECT_NBA_ID_REQUIRES_APPROVAL',nameCollisionIds:[],existingCanonicalPlayerId:null}));
  const nhlCandidates=audit.filter(row=>row.sport==='NHL'&&row.status==='EXACT_DIRECT_ID_PROPOSAL_READY').map(row=>({sourcePlayerId:row.sourcePlayerId,proposedPlayerId:row.proposedPlayerId,displayName:row.recordedNames[0],expectedPlayerId:null,expectedResolutionId:null,sourceRows:row.records.map(proof=>({sourceLine:proof.sourceLine,rowSha256:fingerprint(proof.row),record:proof.row}))}));
  const nhlManifest=nhlCandidates.length===4?await validateNhlDirectDiscoverySource({version:'reviewed-nhl-four-direct-discovery-1',reviewerUserId:reviewer.id,sourceProof:{sourceReference:nhl.sourceProof.sourceUrl,sha256:nhl.sourceProof.sha256,license:'CC-BY-4.0',licenseReference:'https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md'},candidates:nhlCandidates}):null;
  const nbaManifest=rows.length?buildReviewedNbaRosterManifest({rows},{rows:[]},[{sourceReference:nbaSourceUrl,sha256:nbaSha[0]}],reviewer.id):null;
  return{auditedAt:new Date().toISOString(),reviewerUserId:reviewer.id,sourceProofs:[{sport:'NBA',sourceReference:nbaSourceUrl,sha256:nbaSha[0]},{sport:'NHL',sourceReference:nhl.sourceProof.sourceUrl,sha256:nhl.sourceProof.sha256}],audit,nhlManifest,nhlFingerprint:nhlManifest?fingerprint(nhlManifest):null,nbaManifest,nbaFingerprint:nbaManifest?fingerprint(nbaManifest):null,developmentWrites:0,approvalRequired:true,eligibilityChanges:0,statisticsChanges:0,nhlInternalRemainingWork:'Populated-copy proof and exact approval; sport-scoped reconciler implemented and licensed evidence retained.'};
 },{isolationLevel:'RepeatableRead',timeout:120000});
 await mkdir(root,{recursive:true});await writeFile(`${root}/audit.json`,JSON.stringify(result,null,2)+'\n');if(result.nhlManifest)await writeFile(`${root}/reviewed_nhl_manifest.json`,JSON.stringify(result.nhlManifest,null,2)+'\n');if(result.nbaManifest)await writeFile(`${root}/reviewed_nba_manifest.json`,JSON.stringify(result.nbaManifest,null,2)+'\n');
 console.log(JSON.stringify({...result,audit:result.audit.map(({sport,sourcePlayerId,recordedNames,status,collisions,identity})=>({sport,sourcePlayerId,recordedNames,status,collisions:collisions.length,identity})),nhlManifest:result.nhlManifest?{candidates:result.nhlManifest.candidates.length}:null,nbaManifest:result.nbaManifest?{candidates:result.nbaManifest.candidates.length}:null},null,2));
}finally{await db.$disconnect();}
