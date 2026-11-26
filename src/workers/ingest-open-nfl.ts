import { stableSourceProof } from '@/ingestion/open-data/provenance';
import'dotenv/config';
import{writeFile}from'node:fs/promises';
import{getDatabase}from'@/lib/db';
import{sourceProduct}from'@/ingestion/open-data/read';
import{normalizeHistoricalRow,nflTeamCode}from'@/imports/normalize';
import{assertIsolatedIngestionDatabase}from'@/ingestion/persist';
import{projectOpenData}from'@/ingestion/open-data/project';
import{selectAndScoreSource}from'@/ingestion/source-selection';
import{statEntityKey}from'@/ingestion/statistics';
import{fingerprint,type Observation}from'@/ingestion/contracts';
assertIsolatedIngestionDatabase();
const db=getDatabase(),provider='nflverse-open-data';
const product=await sourceProduct('nfl-statistics-2026'),rosters=await sourceProduct('nfl-rosters-2026');
const at=()=>new Date();
try{
 const [players,games,teams]=await Promise.all([db.playerExternalId.findMany({where:{provider:'v9-historical',sport:'NFL',player:{isSynthetic:false}},include:{player:true}}),db.game.findMany({where:{provider:{in:['v9-historical','schedule-v5']},sport:'NFL',season:{startYear:2026}},include:{teams:{include:{team:true}}}}),db.proTeam.findMany({where:{provider:'v9-historical',sport:'NFL'}})]);
 const playerMap=new Map(players.map(p=>[p.externalId,p])),teamMap=new Map(teams.map(t=>[t.externalId,t]));
 const gameGroups=new Map<string,typeof games>();for(const game of games)gameGroups.set(game.externalId,[...(gameGroups.get(game.externalId)??[]),game]);
 const gameMap=new Map([...gameGroups].filter(([,values])=>values.length===1).map(([key,values])=>[key,values[0]]));
 const counts={received:product.rows.length,normalized:0,invalid:0,missingCanonical:0,unsupportedPosition:0};
 const statistics:Observation[]=[],identities=new Map<string,Observation>(),teamIdentities=new Map<string,Observation>();
 const base={provider,sport:'NFL' as const,revisionToken:product.proof.sha256,revisionOrdinal:Date.parse(product.proof.artifactModifiedAt??'')||null,sourceReference:product.source.sourceUrl,observedAt:product.proof.receivedAt,effectiveAt:null,publishedAt:null};
 for(const [index,row]of product.rows.entries()){
  let normalized;try{normalized=normalizeHistoricalRow('NFL',row,index+2);counts.normalized++;}catch{counts.invalid++;continue;}
  if(!['QB','RB','FB','WR','TE'].includes(row.position)){counts.unsupportedPosition++;continue;}
  const player=playerMap.get(normalized.player.externalId),game=gameMap.get(normalized.game.externalId);
  const team=game?.teams.find(participant=>nflTeamCode(participant.team.code??participant.team.externalId)===normalized.team.externalId)?.team;
  const identityTeam=teamMap.get(normalized.team.externalId);
  if(!player||!game||!team||!identityTeam||game.week!==normalized.game.week||game.phase!==normalized.game.phase){counts.missingCanonical++;continue;}
  identities.set(player.playerId,{...base,entityKey:`player:${normalized.player.externalId}`,raw:{...row,sourceProof:stableSourceProof(product.proof)},normalized:{kind:'PLAYER',externalId:normalized.player.externalId,displayName:normalized.player.displayName,links:[{provider:'v9-historical',externalId:normalized.player.externalId}],discovery:'EXISTING'}});
  teamIdentities.set(identityTeam.id,{...base,entityKey:`team:${normalized.team.externalId}`,raw:{sourceProof:stableSourceProof(product.proof)},normalized:{kind:'TEAM_IDENTITY',externalId:normalized.team.externalId,displayName:identityTeam.displayName,code:identityTeam.code,links:[{provider:'v9-historical',externalId:identityTeam.externalId}],discovery:'EXISTING'}});
  statistics.push({...base,entityKey:statEntityKey(game.id,player.playerId,'FOOTBALL'),raw:{...row,sourceProof:stableSourceProof(product.proof)},normalized:{kind:'STAT',player:{provider,externalId:normalized.player.externalId},game:{provider:game.provider,externalId:game.externalId},team:{provider:team.provider,externalId:team.externalId},role:'FOOTBALL',phase:'FINAL',publicationSemantics:'UNVERIFIED',initialPublishedAt:null,stats:normalized.stats}});
 }
 const project=(stream:string,records:Observation[])=>projectOpenData(provider,'NFL',stream,product.proof.sha256,records);
 const started=Date.now(),identityResult=await project('PLAYER',[...identities.values()]),teamResult=await project('TEAM_IDENTITY',[...teamIdentities.values()]),statResult=await project('STAT',statistics);
 const scoringPolicy={version:'nflverse-ccby4-isolated-2026-1',sources:[{provider,priority:0,maxAgeMs:2*86400000,allowProvisional:true,permission:'ISOLATED_OPEN_DATA' as const}]};
 const scoreCounts:Record<string,number>={},scoreTimes:number[]=[];let completeScores=0,incompleteScores=0;
 // Bound the real scoring demonstration; the full normalized snapshot remains staged.
 for(const record of statistics.filter(record=>record.raw.position==='QB'&&record.normalized.kind==='STAT'&&record.normalized.stats.receptions===0).slice(0,100)){
  const match=/^stat:([^:]+):([^:]+):/.exec(record.entityKey)!;const start=Date.now();const result=await selectAndScoreSource({sport:'NFL',gameId:match[1],playerId:match[2]},scoringPolicy,at());scoreTimes.push(Date.now()-start);scoreCounts[result.status]=(scoreCounts[result.status]??0)+1;if('entry' in result&&result.entry){if(result.entry.missingStats.length)incompleteScores++;else completeScores++;}
 }
 const rosterMatches=rosters.rows.filter(r=>playerMap.has(r.gsis_id));
 if(scoreTimes.length!==100||completeScores!==100||incompleteScores!==0)throw Error('The bounded NFL sample did not produce 100 complete V9 scores.');
 const report={provider,permission:'CC-BY-4.0_ISOLATED_ONLY',counts,identityResult,teamResult,statResult,scoring:scoreCounts,scoringSampleScope:'QB with zero receptions; no unresolved TE eligibility assumption',completeScores,incompleteScores,scoringMeasurements:{sample:scoreTimes.length,minMs:Math.min(...scoreTimes),maxMs:Math.max(...scoreTimes),meanMs:scoreTimes.reduce((a,b)=>a+b,0)/scoreTimes.length},pipelineElapsedMs:Date.now()-started,rosterRecordsReceived:rosters.rows.length,rosterCanonicalMatches:rosterMatches.length,sourceProofs:[product.proof,rosters.proof],officialPublicationKnown:false,actualCompletionKnown:false,competitiveFinalizationEnabled:false,targetFingerprint:fingerprint(statistics.map(s=>s.entityKey)),developmentWrites:0};
 await writeFile('data/provider_previews/nflverse/season-2026/isolated_acceptance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await db.$disconnect();}
