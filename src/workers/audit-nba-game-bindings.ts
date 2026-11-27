import 'dotenv/config';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {parse} from 'csv-parse/sync';
import {getDatabase} from '@/lib/db';
const db=getDatabase();
try {
 const base='data/provider_previews/capability_review/nba_products';
 const schedule=parse(gunzipSync(await readFile(`${base}/nba_schedule_2027.csv.gz`)),{columns:true,skip_empty_lines:true}) as Record<string,string>[];
 const boxes=parse(await readFile(`${base}/player_boxscores_2027.csv`),{columns:true,skip_empty_lines:true}) as Record<string,string>[];
 const crosswalk=parse(await readFile('data/provider_previews/sportsdataverse/schedule-crosswalks/nba_schedule_crosswalk_2027.csv'),{columns:true,skip_empty_lines:true}) as Record<string,string>[];
 const boxIDs=new Set(boxes.map(row=>row.game_id));
 const games=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return tx.game.findMany({where:{sport:'NBA',season:{startYear:2026}},include:{teams:{include:{team:true}},scheduleObservations:{include:{importBatch:{select:{status:true,importerVersion:true}}}},historicalCrosswalks:true}});},{isolationLevel:'RepeatableRead',timeout:120000});
 const results=schedule.filter(row=>boxIDs.has(row.game_id)).map(row=>{
  const exact=games.filter(game=>game.externalId===row.game_id);
  const ids=games.filter(game=>game.externalId.replace(/^0+/,'')===row.game_id.replace(/^0+/,'')||game.scheduleObservations.some(obs=>obs.scheduleExternalId.replace(/^0+/,'')===row.game_id.replace(/^0+/,''))||game.historicalCrosswalks.some(c=>c.archiveGameId===row.game_id));
  const tuple=games.filter(game=>game.gameDate?.toISOString().slice(0,10)===row.game_date&&game.teams.some(t=>t.team.code===row.home_team_abbreviation)&&game.teams.some(t=>t.team.code===row.away_team_abbreviation));
  const explicit=crosswalk.filter(x=>x.nba_game_id===row.game_id&&x.game_date===row.game_date&&x.nba_home_team_id===row.home_team_id&&x.nba_away_team_id===row.away_team_id).flatMap(x=>games.filter(g=>g.externalId===x.espn_game_id).map(g=>({crosswalk:x,gameId:g.id,teams:g.teams.map(t=>({id:t.team.externalId,code:t.team.code,side:t.side})),observations:g.scheduleObservations})));
  return {source:row,explicit,exact:exact.map(g=>g.id),idCandidates:ids.map(g=>({id:g.id,externalId:g.externalId,provider:g.provider,date:g.gameDate,teams:g.teams.map(t=>({code:t.team.code,side:t.side})),observations:g.scheduleObservations,crosswalk:g.historicalCrosswalks})),tupleCandidates:tuple.map(g=>({id:g.id,externalId:g.externalId,provider:g.provider,date:g.gameDate,teams:g.teams.map(t=>({code:t.team.code,side:t.side})),observations:g.scheduleObservations}))};
 });
 const missing=results.filter(r=>r.exact.length!==1);await mkdir('data/provider_previews/capability_review/nba_game_bindings',{recursive:true});
 const report={sourceGames:results.length,missingExact:missing.length,explicitMappings:missing.filter(r=>r.explicit.length===1).length,numericEquivalent:missing.filter(r=>r.idCandidates.length===1).length,tupleOnly:missing.filter(r=>!r.idCandidates.length&&r.tupleCandidates.length===1).length,missing};
 await writeFile('data/provider_previews/capability_review/nba_game_bindings/report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,missing:missing.map(r=>({id:r.source.game_id,date:r.source.game_date,home:r.source.home_team_abbreviation,away:r.source.away_team_abbreviation,idCandidates:r.idCandidates.map(g=>({externalId:g.externalId,id:g.id,obs:g.observations.slice(0,1).map(o=>o.sourceRecord)})),tupleIDs:r.tupleCandidates.map(g=>g.externalId)}))}));
}finally{await db.$disconnect();}
