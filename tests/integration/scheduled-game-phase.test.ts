import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { createLeague } from '@/server/league';
import { provisionCompetitionSchedule } from '@/server/competition';
import { verifiedRegularSeasonGames } from '@/server/scheduled-game-phase';
const db=getDatabase();afterAll(()=>db.$disconnect());
it('includes accepted V5 regular games with preserved UNKNOWN phase, excludes conflicts/postseason, and keeps attribution idempotent',async()=>{
 const user=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}}),league=await createLeague(user.id,{name:`Synthetic phase source ${randomUUID()}`,sports:['MLB'],maxTeams:2,historical:true,seasonYear:2087,fillWithComputers:true,competitionType:'CUMULATIVE'}),sport=await db.leagueSport.findUniqueOrThrow({where:{leagueId_sport:{leagueId:league.id,sport:'MLB'}}}),competition=await db.sportCompetition.findFirstOrThrow({where:{leagueId:league.id}});
 const batch=await db.scheduleImportBatch.create({data:{importerVersion:'schedule-v5-1',bundleHash:`synthetic-${randomUUID()}`,status:'COMPLETE',completedAt:new Date(),sourceManifest:{synthetic:true}}});
 const games=await Promise.all(['UNKNOWN','UNKNOWN','UNKNOWN','REGULAR'].map((phase,index)=>db.game.create({data:{sport:'MLB',seasonId:sport.seasonId,provider:`synthetic-phase-${league.id}`,externalId:String(index),phase:phase as 'UNKNOWN'|'REGULAR',startsAt:new Date(`2087-04-0${index+1}T19:00:00Z`)}})));
 const observe=(index:number,phase:'REGULAR'|'POSTSEASON',kind:string,version:string)=>db.gameScheduleObservation.create({data:{importBatchId:batch.id,gameId:games[index].id,sport:'MLB',scheduleProvider:'schedule-v5',scheduleExternalId:`synthetic-${games[index].id}`,gameKey:`synthetic-${games[index].id}`,phase,gameDate:new Date(`2087-04-0${index+1}T00:00:00Z`),startsAt:games[index].startsAt,status:'scheduled',source:'synthetic test only',retrievedAt:new Date('2086-11-01T00:00:00Z'),contentHash:version+randomUUID(),sourceRecord:{game_type:kind,synthetic:true}}});
 await observe(0,'REGULAR','regular','regular');await observe(1,'POSTSEASON','postseason','post');await observe(2,'REGULAR','regular','conflict-reg');await observe(2,'POSTSEASON','postseason','conflict-post');
 const eligible=await db.$transaction(tx=>verifiedRegularSeasonGames(tx,sport.seasonId));expect(eligible.map(game=>game.id).sort()).toEqual([games[0].id,games[3].id].sort());
 await provisionCompetitionSchedule(user.id,competition.id);const assigned=await db.leagueGameAssignment.findMany({where:{leagueId:league.id},orderBy:{gameId:'asc'}});expect(assigned.map(row=>row.gameId).sort()).toEqual([games[0].id,games[3].id].sort());
 const periods=await db.competitionPeriodGame.findMany({where:{gameId:{in:games.map(game=>game.id)}}});await provisionCompetitionSchedule(user.id,competition.id);expect(await db.leagueGameAssignment.findMany({where:{leagueId:league.id},orderBy:{gameId:'asc'}})).toEqual(assigned);expect(await db.competitionPeriodGame.findMany({where:{gameId:{in:games.map(game=>game.id)}}})).toEqual(periods);
 expect((await db.game.findUniqueOrThrow({where:{id:games[0].id}})).phase).toBe('UNKNOWN');expect(await db.gameScheduleObservation.count({where:{importBatchId:batch.id}})).toBe(4);
});
