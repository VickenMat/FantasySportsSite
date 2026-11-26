import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { playerStatistics } from '@/server/player-statistics';
import { applicableRules } from '@/scoring/engine';
import { ubpV9Rules } from '@/scoring/ubp-v9';
import { fingerprint } from '@/ingestion/contracts';

const db=getDatabase();afterAll(()=>db.$disconnect());
it('excludes only proven non-playing goalie rows, leaves unknown GP/average unknown and preserves all source rows',async()=>{
  const tag=randomUUID(),season=await db.season.upsert({where:{sport_startYear:{sport:'NHL',startYear:2087}},create:{sport:'NHL',startYear:2087,label:'2087-88'},update:{}});
  const team=await db.proTeam.create({data:{sport:'NHL',provider:tag,externalId:'team',displayName:'Isolated participation team'}});
  const batch=await db.importBatch.create({data:{sport:'NHL',provider:tag,contentHash:fingerprint({tag}),importerVersion:'participation-fixture',sourceName:'Explicit isolated appearance evidence',summary:{fixture:true}}});
  const preset=await db.scoringPreset.findUniqueOrThrow({where:{version:'ubp-v9-experimental'}});
  const normalized=Object.fromEntries(applicableRules(ubpV9Rules,'GOALIE').map(rule=>[rule.statKey,0]));
  const players=[];
  for(const[name,times]of[['known',['12:00','0:00']],['unknown',['12:00',null]],['backup',['0:00']]]as const){
    const player=await db.player.create({data:{sport:'NHL',displayName:`${name} ${tag}`,isSynthetic:true}});players.push(player);
    for(const[index,time]of times.entries()){
      const game=await db.game.create({data:{sport:'NHL',provider:tag,externalId:`${name}-${index}`,seasonId:season.id,phase:'REGULAR'}});
      await db.gameTeam.create({data:{gameId:game.id,teamId:team.id}});
      await db.playerGameStat.create({data:{provider:'v9-historical',gameId:game.id,playerId:player.id,teamId:team.id,role:'GOALIE',importBatchId:batch.id,revision:1,sourceLine:index+1,contentHash:fingerprint({tag,name,index}),observedPositions:['G'],normalized,raw:time===null?{}:{toi:time}}});
    }
  }
  const before=await db.playerGameStat.findMany({where:{importBatchId:batch.id},orderBy:{id:'asc'}});
  const values=await playerStatistics({playerIds:players.map(player=>player.id),seasonId:season.id,presetId:preset.id});
  expect(values.get(players[0].id)).toMatchObject({gamesPlayed:1,knownPlayedGames:1,unknownParticipationGames:0,didNotPlayRecords:1,scoredGames:1,totalTenths:0n,averageTenths:0});
  expect(values.get(players[1].id)).toMatchObject({gamesPlayed:null,knownPlayedGames:1,unknownParticipationGames:1,didNotPlayRecords:0,totalTenths:0n,averageTenths:null});
  expect(values.get(players[2].id)).toMatchObject({gamesPlayed:0,didNotPlayRecords:1,scoredGames:0,totalTenths:0n,averageTenths:null});
  expect(await db.playerGameStat.findMany({where:{importBatchId:batch.id},orderBy:{id:'asc'}})).toEqual(before);
  expect(await db.scoreLedger.count({where:{playerId:{in:players.map(player=>player.id)}}})).toBe(0);
});
