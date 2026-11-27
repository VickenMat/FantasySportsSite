import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {it,expect,afterAll} from 'vitest';
import {getDatabase} from '@/lib/db';
import {createLeague} from '@/server/league';
import {pendingGameCompletionHold,waiverHoldUntil} from '@/server/waiver-holds';
import {playerGameCandidateCtes} from '@/server/professional-team-membership';
import {professionalGamePlayers} from '@/server/professional-game-players';
import {assertOperationalPlayerUnlocked} from '@/server/operational-lineup-lock';
import {persistObservation} from '@/ingestion/persist';
import type {Observation} from '@/ingestion/contracts';
const db=getDatabase(),owned=new Set<string>();let nextYear=2091;
afterAll(async()=>{try{if(owned.size)await db.league.deleteMany({where:{id:{in:[...owned]}}});}finally{await db.$disconnect();}});
async function fixture(){
 const year=nextYear++,instant=(day:number,hour=0)=>new Date(Date.UTC(year+1,0,day,hour)),tag=randomUUID(),user=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}});
 const league=await createLeague(user.id,{name:`Synthetic NBA explicit-team proof ${tag}`,sports:['NBA'],historical:true,seasonYear:year,maxTeams:2,fillWithComputers:true});owned.add(league.id);
 const ls=await db.leagueSport.findFirstOrThrow({where:{leagueId:league.id}}),competition=await db.sportCompetition.findFirstOrThrow({where:{leagueId:league.id}});
 const native=await db.proTeam.create({data:{sport:'NBA',provider:'v9-historical',externalId:`161061${year}`,code:'SYN',displayName:'Synthetic shared display name'}}),other=await db.proTeam.create({data:{sport:'NBA',provider:'v9-historical',externalId:`161061${year+100}`,code:'ALT',displayName:'Synthetic alternate club'}}),espn=await db.proTeam.create({data:{sport:'NBA',provider:'schedule-v5',externalId:String(9000+year),code:'SYN',displayName:native.displayName}});
 const future=await db.game.create({data:{sport:'NBA',provider:'schedule-v5',externalId:`future-${tag}`,seasonId:ls.seasonId,phase:'REGULAR',startsAt:instant(10,12)}});await db.gameTeam.create({data:{gameId:future.id,teamId:espn.id,side:'HOME'}});
 const period=await db.scoringPeriod.create({data:{leagueId:league.id,leagueSportId:ls.id,competitionId:competition.id,sport:'NBA',number:999,startsAt:instant(10),endsAt:instant(12)}});await db.competitionPeriodGame.create({data:{gameId:future.id,sportCompetitionId:competition.id,scoringPeriodId:period.id}});
 const batch=await db.scheduleImportBatch.create({data:{importerVersion:'schedule-v5-1',bundleHash:tag,status:'COMPLETE',sourceManifest:{synthetic:true}}});
 const observe=async(gameId:string,externalId:string,home:string,away:string,day=1)=>db.gameScheduleObservation.create({data:{gameId,sport:'NBA',importBatchId:batch.id,scheduleProvider:'schedule-v5',scheduleExternalId:externalId,gameKey:`NBA:${externalId}`,phase:'REGULAR',gameDate:instant(day),startsAt:instant(day,12),status:'Scheduled',source:'Explicit isolated accepted-ID fixture',retrievedAt:instant(2),importedAt:instant(2),contentHash:randomUUID(),sourceRecord:{game_id:externalId,home_team_id:home,away_team_id:away,synthetic:true}}});
 await observe(future.id,future.externalId,espn.externalId,String(10000+year),10);
 const archive=await db.game.create({data:{sport:'NBA',provider:'v9-historical',externalId:`archive-${tag}`,seasonId:ls.seasonId,phase:'REGULAR',startsAt:instant(1,12)}});await db.gameTeam.createMany({data:[{gameId:archive.id,teamId:native.id,side:'HOME'},{gameId:archive.id,teamId:other.id,side:'AWAY'}]});
 const scheduleId=`accepted-native-${tag}`;await observe(archive.id,scheduleId,espn.externalId,String(10000+year));
 const player=await db.player.create({data:{sport:'NBA',displayName:`Synthetic no-box team member ${tag}`,isSynthetic:true}}),provider=`synthetic-team-${tag}`;
 await db.playerExternalId.create({data:{sport:'NBA',playerId:player.id,provider,externalId:'athlete'}});
 const membership:Observation={provider,sport:'NBA',entityKey:`player-snapshot:${provider}:athlete:${year}:TEAM_ASSIGNMENT`,revisionToken:'1',revisionOrdinal:1,sourceReference:'https://fixture.invalid/explicit-team-roster',observedAt:instant(3).toISOString(),effectiveAt:null,publishedAt:null,raw:{synthetic:true},normalized:{kind:'PLAYER_SNAPSHOT',player:{provider,externalId:'athlete'},seasonStartYear:year,sourceRecordId:tag,sourceFingerprint:'a'.repeat(64),sourceSnapshotDate:null,sourceDatePrecision:'OBSERVED',firstObservedAt:instant(3).toISOString(),policyAdoptedAt:'2026-11-27T00:18:32.000Z',validFrom:instant(3).toISOString(),validUntil:instant(20).toISOString(),policyVersion:'approved-observed-player-snapshot-1',retracted:false,facet:{type:'TEAM_ASSIGNMENT',team:{provider:'v9-historical',externalId:native.externalId},sourceTeamId:native.externalId,assignment:'ROSTERED'}}};
 const apply=(input:Observation)=>db.$transaction(tx=>persistObservation(tx,input,new Date(input.observedAt)));expect((await apply(membership)).outcome).toBe('ACCEPTED');
 const bridge=(knownAt=instant(2))=>db.historicalGameCrosswalk.create({data:{sport:'NBA',archiveGameId:archive.externalId,canonicalGameId:archive.id,scheduleExternalId:scheduleId,gameKey:scheduleId,status:'MATCHED',importBatchId:batch.id,importedAt:knownAt}});
 return{year,league,ls,batch,native,other,espn,archive,future,player,provider,membership,apply,bridge,observe,instant,pending:(at:Date)=>db.$transaction(tx=>pendingGameCompletionHold(tx,player.id,at)),locked:(at:Date)=>db.$transaction(tx=>assertOperationalPlayerUnlocked(tx,league.id,player.id,at)),linked:(at:Date)=>db.$transaction(tx=>professionalGamePlayers(tx,future.id,at))};
}
it('requires accepted explicit NBA/native side-ID proof and preserves separate completion holds and game locks',async()=>{
 const f=await fixture(),during=f.instant(10,13);
 expect(await f.pending(during)).toBe(false);expect((await f.linked(during)).links.has(f.player.id)).toBe(false);await expect(f.locked(during)).resolves.toBeUndefined(); // Matching display names/codes alone prove nothing.
 await f.bridge();expect(await f.pending(during)).toBe(true);expect((await f.linked(f.instant(10,12))).links.has(f.player.id)).toBe(true);await expect(f.locked(during)).rejects.toThrow(/player is locked/);
 const final:Observation={provider:f.provider,sport:'NBA',entityKey:`game-state:${f.future.id}`,revisionToken:'final',revisionOrdinal:1,sourceReference:'https://fixture.invalid/final',observedAt:f.instant(10,15).toISOString(),effectiveAt:null,publishedAt:null,raw:{synthetic:true},normalized:{kind:'GAME_STATE',evidencePolicy:'CONSERVATIVE_OBSERVED_V1',game:{provider:'schedule-v5',externalId:f.future.externalId},status:'FINAL',scheduledStartsAt:f.future.startsAt!.toISOString(),actualStartsAt:null,completedAt:null}};
 expect((await f.apply(final)).outcome).toBe('ACCEPTED');expect(await f.pending(f.instant(10,16))).toBe(false);await expect(f.locked(f.instant(10,16))).resolves.toBeUndefined();expect(await db.$transaction(tx=>waiverHoldUntil(tx,f.league.id,f.player.id,f.instant(10,16)))).toEqual(f.instant(11,15));
});
it('keeps broad historical team candidates while exact affiliation retraction and independent bridge knowledge remain authoritative',async()=>{
 const f=await fixture();await f.bridge(f.instant(11));expect(await f.pending(f.instant(10,13))).toBe(false);expect(await f.pending(f.instant(11,13))).toBe(true);expect((await f.linked(f.instant(10,12))).links.has(f.player.id)).toBe(false); // A later bridge does not supply a prelock snapshot link.
 const withdrawn={...f.membership,revisionToken:'2',revisionOrdinal:2,observedAt:f.instant(9).toISOString(),normalized:{...f.membership.normalized as Extract<Observation['normalized'],{kind:'PLAYER_SNAPSHOT'}>,validFrom:f.instant(9).toISOString(),retracted:true}};expect((await f.apply(withdrawn)).outcome).toBe('ACCEPTED');
 const [candidate]=await db.$queryRaw<{linked:boolean}[]>`WITH ${playerGameCandidateCtes(f.player.id,f.instant(11,13))} SELECT EXISTS(SELECT 1 FROM candidate_games WHERE id=${f.future.id}::uuid) AS linked`;
 expect(candidate.linked).toBe(true);expect(await f.pending(f.instant(11,13))).toBe(false);
});
it('rejects ambiguous accepted NBA identity edges without matching names or choosing the first duplicate',async()=>{
 const f=await fixture();await f.bridge();const otherGame=await db.game.create({data:{sport:'NBA',provider:'v9-historical',externalId:randomUUID(),seasonId:f.ls.seasonId,phase:'REGULAR',startsAt:f.instant(1,12)}});await db.gameTeam.createMany({data:[{gameId:otherGame.id,teamId:f.other.id,side:'HOME'},{gameId:otherGame.id,teamId:f.native.id,side:'AWAY'}]});const key=randomUUID();await f.observe(otherGame.id,key,f.espn.externalId,String(10000+f.year));
 await db.historicalGameCrosswalk.create({data:{sport:'NBA',archiveGameId:otherGame.externalId,canonicalGameId:otherGame.id,scheduleExternalId:key,status:'MATCHED',importBatchId:f.batch.id,importedAt:f.instant(2)}});
 expect(await f.pending(f.instant(10,13))).toBe(false);expect((await f.linked(f.instant(10,12))).links.has(f.player.id)).toBe(false);
});
