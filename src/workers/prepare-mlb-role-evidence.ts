import'dotenv/config';
import{readFile,writeFile}from'node:fs/promises';
import{getDatabase}from'@/lib/db';
import{sourceProduct,integer}from'@/ingestion/open-data/read';
import{fingerprint}from'@/ingestion/contracts';
import{provenMlbRole}from'@/ingestion/open-data/mlb-role';
const db=getDatabase();
function original(value:unknown):Record<string,unknown>{let row=value as Record<string,unknown>;for(let i=0;i<10&&row?.original&&typeof row.original==='object';i++)row=row.original as Record<string,unknown>;return row;}
try{
 const source=await sourceProduct('mlb-plays-2026'),initial=JSON.parse(await readFile('data/stat_enrichment/mlb_role_reconciliation.json','utf8'));
 const targets=initial.rows as {gameId:string;playerId:string;sourceGameId:string;sourcePlayerId:string;ids:string[]}[];
 const games=new Map<string,{batters:Set<string>;pitchers:Set<string>;indices:Set<number>;rows:number}>();for(const r of source.rows){if(!games.has(r.game_pk))games.set(r.game_pk,{batters:new Set(),pitchers:new Set(),indices:new Set(),rows:0});const game=games.get(r.game_pk)!;game.batters.add(r.batter_id);game.pitchers.add(r.pitcher_id);game.indices.add(Number(r.at_bat_index));game.rows++;}
 const [stats,batting]=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return Promise.all([tx.playerGameStat.findMany({where:{id:{in:targets.flatMap(r=>r.ids)}},include:{player:true}}),tx.playerGameStat.findMany({where:{provider:'v9-historical',role:'HITTER',gameId:{in:[...new Set(targets.map(r=>r.gameId))]}},orderBy:{revision:'desc'},distinct:['gameId','playerId','role']})]);});
 const gamePA=new Map<string,{sum:number;complete:boolean}>();for(const s of batting){if(!gamePA.has(s.gameId))gamePA.set(s.gameId,{sum:0,complete:true});const pa=integer(original(s.raw).plateAppearances),total=gamePA.get(s.gameId)!;if(pa===null)total.complete=false;else total.sum+=pa;}
 const rows=targets.map(target=>{
  const g=games.get(target.sourceGameId),hitter=stats.find(s=>target.ids.includes(s.id)&&s.role==='HITTER'),pitcher=stats.find(s=>target.ids.includes(s.id)&&s.role==='PITCHER'),box=gamePA.get(target.gameId);
  const b=Boolean(g?.batters.has(target.sourcePlayerId)),p=Boolean(g?.pitchers.has(target.sourcePlayerId));
  const complete=Boolean(g&&box?.complete&&box.sum===g.rows&&g.rows===g.indices.size&&Math.min(...g.indices)===0&&Math.max(...g.indices)===g.rows-1);
  const battingPA=integer(hitter?original(hitter.raw).plateAppearances:null),pitchingGames=integer(pitcher?original(pitcher.raw).gamesPitched:null);
  const pitchingStarts=integer(pitcher?original(pitcher.raw).gamesStarted:null);
  const exclusiveRole=complete&&p&&!b&&battingPA===0&&(pitchingGames??0)>0?'PITCHER':complete&&b&&!p&&pitchingGames===0&&(battingPA??0)>0?'HITTER':null;
  const role=provenMlbRole({bats:b,pitches:p,plateAppearances:battingPA,pitchingGames,pitchingStarts,complete});
  const status=exclusiveRole?'VALIDATED_EXCLUSIVE_ROLE':role?'VALIDATED_STARTER_PRIORITY':b&&p?'BOTH_ROLES_REQUIRE_PRODUCT_RULE':!complete?'SOURCE_COMPLETENESS_NOT_PROVEN':'PARTICIPATION_UNRESOLVED';
  return{...target,playerName:hitter?.player.displayName??pitcher?.player.displayName,role,status,battingPA,pitchingGames,pitchingStarts,rolePolicy:'Confirmed: starting pitcher takes PITCHER; otherwise HITTER when batting; exclusive pitching remains PITCHER',gameCompleteness:{complete,sourcePlays:g?.rows??0,boxPlateAppearances:box?.sum??null,uniqueIndices:g?.indices.size??0},source:source.proof,statTargets:[hitter,pitcher].filter(Boolean).map(s=>({id:s!.id,contentHash:s!.contentHash,role:s!.role})),existingLedgerRequiresSeparateReview:false};
 });
 const report={targetAppearances:rows.length,players:new Set(rows.map(r=>r.playerId)).size,validatedExclusiveRoles:rows.filter(r=>r.status==='VALIDATED_EXCLUSIVE_ROLE').length,validatedStarterPriorityRoles:rows.filter(r=>r.status==='VALIDATED_STARTER_PRIORITY').length,validatedRoles:rows.filter(r=>r.role).length,unresolvedBothRoles:rows.filter(r=>r.status==='BOTH_ROLES_REQUIRE_PRODUCT_RULE').length,otherUnresolved:rows.filter(r=>!r.role&&r.status!=='BOTH_ROLES_REQUIRE_PRODUCT_RULE').length,targetFingerprint:fingerprint(rows),developmentWrites:0};
 await writeFile('data/stat_enrichment/mlb_validated_role_manifest.json',JSON.stringify({report,rows},null,2)+'\n');console.log(JSON.stringify({report,decisionExamples:rows.filter(r=>r.status==='BOTH_ROLES_REQUIRE_PRODUCT_RULE').slice(0,5).map(r=>({player:r.playerName,sourceGameId:r.sourceGameId,battingPA:r.battingPA,pitchingGames:r.pitchingGames,pitchingStarts:r.pitchingStarts}))},null,2));
}finally{await db.$disconnect();}
