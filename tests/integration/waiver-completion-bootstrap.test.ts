import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {afterAll,expect,it} from 'vitest';
import {getDatabase} from '@/lib/db';
import {createLeague} from '@/server/league';
import {pendingGameCompletionHold,waiverHoldUntil} from '@/server/waiver-holds';
import {persistObservation} from '@/ingestion/persist';
const db=getDatabase(),owned=new Set<string>();
afterAll(async()=>{try{if(owned.size)await db.league.deleteMany({where:{id:{in:[...owned]}}});}finally{await db.$disconnect();}});
it('holds every unresolved current V5 game across explicit archive crosswalks, then keeps first-FINAL plus24h and independent release holds',async()=>{
 const user=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}}),league=await createLeague(user.id,{name:`Completion safety ${randomUUID()}`,sports:['NHL'],maxTeams:2,historical:true,seasonYear:2054,fillWithComputers:true});owned.add(league.id);
 const ls=await db.leagueSport.findFirstOrThrow({where:{leagueId:league.id}}),roster=await db.fantasyRoster.findFirstOrThrow({where:{leagueSportId:ls.id}}),provider=`completion-safety-${randomUUID()}`;
 const player=await db.player.create({data:{sport:'NHL',displayName:'Synthetic exact-crosswalk completion fixture',isSynthetic:true}}),team=await db.proTeam.create({data:{sport:'NHL',provider,externalId:randomUUID(),displayName:'Synthetic completion club'}});
 const batch=await db.scheduleImportBatch.create({data:{importerVersion:'schedule-v5-1',bundleHash:randomUUID(),status:'COMPLETE',sourceManifest:{synthetic:true}}});
 const statsBatch=await db.importBatch.create({data:{sport:'NHL',provider,contentHash:randomUUID(),sourceName:'Synthetic historical source',importerVersion:'fixture',summary:{}}});
 const make=async(day:number,status='Scheduled')=>{
  const canonical=await db.game.create({data:{sport:'NHL',provider:'schedule-v5',externalId:randomUUID(),seasonId:ls.seasonId,phase:'REGULAR',startsAt:new Date(`2054-01-${String(day).padStart(2,'0')}T12:00:00Z`)}});
  const historical=await db.game.create({data:{sport:'NHL',provider,externalId:randomUUID(),seasonId:ls.seasonId,phase:'UNKNOWN',startsAt:canonical.startsAt}});
  await db.gameTeam.create({data:{gameId:historical.id,teamId:team.id}});
  await db.playerGameStat.create({data:{gameId:historical.id,playerId:player.id,teamId:team.id,provider,importBatchId:statsBatch.id,role:'SKATER',revision:1,sourceLine:day,contentHash:randomUUID(),normalized:{},raw:{synthetic:true},observedPositions:['C']}});
  await db.gameScheduleObservation.create({data:{importBatchId:batch.id,gameId:canonical.id,sport:'NHL',scheduleProvider:'schedule-v5',scheduleExternalId:canonical.externalId,gameKey:canonical.externalId,phase:'REGULAR',gameDate:canonical.startsAt!,startsAt:canonical.startsAt,status,source:'Synthetic accepted V5 fixture',retrievedAt:new Date('2054-01-01T00:00:00Z'),contentHash:randomUUID(),sourceRecord:{synthetic:true}}});
  await db.historicalGameCrosswalk.create({data:{sport:'NHL',archiveGameId:historical.externalId,scheduleExternalId:canonical.externalId,canonicalGameId:canonical.id,status:'MATCHED',importBatchId:batch.id,importedAt:new Date('2054-01-01T00:00:00Z')}});
  return canonical;
 };
 const earlier=await make(2),later=await make(3),cancelled=await make(4,'Cancelled');
 const pending=(at:string)=>db.$transaction(tx=>pendingGameCompletionHold(tx,player.id,new Date(at)));
 const hold=(at:string)=>db.$transaction(tx=>waiverHoldUntil(tx,league.id,player.id,new Date(at)));
 expect(await pending('2054-01-02T13:00:00Z')).toBe(true); // zero promoted source receipts cannot bypass a started V5 game
 const final=async(game:typeof earlier,at:string)=>{const result=await db.$transaction(tx=>persistObservation(tx,{provider,sport:'NHL',entityKey:`game-state:${game.id}`,revisionToken:'1',revisionOrdinal:1,sourceReference:'https://fixture.invalid/final-bootstrap',observedAt:at,effectiveAt:null,publishedAt:null,raw:{synthetic:true},normalized:{kind:'GAME_STATE',evidencePolicy:'CONSERVATIVE_OBSERVED_V1',game:{provider:'schedule-v5',externalId:game.externalId},status:'FINAL',scheduledStartsAt:game.startsAt!.toISOString(),actualStartsAt:null,completedAt:null}},new Date(at)));expect(result.outcome,result.reason).toBe('ACCEPTED');};
 await final(later,'2054-01-03T15:00:00Z');
 expect(await pending('2054-01-05T00:00:00Z')).toBe(true); // later FINAL proves nothing about the earlier unresolved game
 await final(earlier,'2054-01-05T01:00:00Z');
 expect(await pending('2054-01-05T01:01:00Z')).toBe(false); // explicit cancellation supplies no hold
 expect(await hold('2054-01-05T01:01:00Z')).toEqual(new Date('2054-01-06T01:00:00Z'));
 expect((await hold('2054-01-06T01:01:00Z'))!.getTime()).toBeLessThan(new Date('2054-01-06T01:01:00Z').getTime());
 await db.rosterEntry.create({data:{leagueId:league.id,rosterId:roster.id,teamId:roster.teamId,playerId:player.id,sport:'NHL',seasonId:ls.seasonId,slot:'BENCH',acquiredAt:new Date('2054-01-01T00:00:00Z'),releasedAt:new Date('2054-01-06T12:00:00Z')}});
 expect(await hold('2054-01-06T13:00:00Z')).toEqual(new Date('2054-01-07T12:00:00Z'));
 expect(await db.gameCompletionEvidence.count({where:{gameId:cancelled.id}})).toBe(0);
});
