import "dotenv/config";
import{randomUUID}from"node:crypto";
import{afterAll,expect,it}from"vitest";
import{getDatabase}from"@/lib/db";
import{synchronizeProvider}from"@/ingestion/sync";
import{LocalPageAdapter}from"@/ingestion/adapters";
import type{Observation,ProviderPolicy}from"@/ingestion/contracts";
import{eligibleRookieIds}from"@/server/rookies";
import{professionalTeamHistory}from"@/server/professional-team-history";
import{irEligiblePlayers}from"@/server/roster-availability";
const db=getDatabase();afterAll(()=>db.$disconnect());const at=new Date("2032-01-03T00:00:00Z");
async function fixture(sport:Observation["sport"]="NBA"){
 const provider=`lifecycle-${randomUUID()}`;
 const player=await db.player.create({data:{sport,displayName:`Synthetic lifecycle ${randomUUID()}`,isSynthetic:true}});
 await db.playerExternalId.create({data:{sport,provider,externalId:"1",playerId:player.id}});
 const season=await db.season.upsert({where:{sport_startYear:{sport,startYear:2032}},create:{sport,startYear:2032,label:"2032"},update:{}});
 const game=await db.game.create({data:{sport,seasonId:season.id,provider,externalId:randomUUID(),phase:"REGULAR"}});
 const base={provider,sport,entityKey:"player:1",revisionToken:"1",revisionOrdinal:1,sourceReference:"https://fixture.invalid/lifecycle",observedAt:at.toISOString(),effectiveAt:"2032-01-01T00:00:00Z",publishedAt:"2032-01-02T00:00:00Z",raw:{synthetic:true}};
 const reference={provider,externalId:"1"};
 const run=(records:Observation[],time=at)=>{const p:ProviderPolicy={provider,sport,stream:records[0].normalized.kind,minIntervalMs:1000,maxRequests:100,leaseMs:5000,permission:"FIXTURE_ONLY"};return synchronizeProvider(new LocalPageAdapter({records,nextCursor:"committed"}),p,()=>time);};
 return{provider,player,season,game,base,reference,run};
}
it("maps source availability independently for all sports and preserves ownership on retirement",async()=>{
 const rosterBefore=await db.rosterEntry.count();
 for(const sport of["NFL","MLB","NBA","NHL"]as const){
  const f=await fixture(sport);
  const observation:Observation={...f.base,normalized:{kind:"AVAILABILITY",player:f.reference,game:null,designation:"RETIRED",irEligible:false,expiresAt:null}};
  const result=await f.run([observation]);expect(result.status==="PROCESSED"&&result.decisions[0].outcome).toBe("ACCEPTED");
  expect((await db.playerAvailabilityEvidence.findFirstOrThrow({where:{playerId:f.player.id}})).designation).toBe("RETIRED");
  expect((await f.run([observation],new Date(+at+1001))).status).toBe("PROCESSED");
  expect(await db.playerAvailabilityEvidence.count({where:{playerId:f.player.id}})).toBe(1);
  const unknown:Observation={...observation,revisionToken:"2",revisionOrdinal:2,normalized:{...observation.normalized as Extract<Observation["normalized"],{kind:"AVAILABILITY"}>,designation:"UNKNOWN",irEligible:true}};
  const rejected=await f.run([unknown],new Date(+at+2002));expect(rejected.status==="PROCESSED"&&rejected.decisions[0].outcome).toBe("QUARANTINED");
  const suspended:Observation={...observation,revisionToken:"3",revisionOrdinal:3,publishedAt:"2032-01-02T12:00:00Z",normalized:{...observation.normalized as Extract<Observation["normalized"],{kind:"AVAILABILITY"}>,designation:"SUSPENDED",irEligible:true}};
  await f.run([suspended],new Date(+at+3003));expect((await irEligiblePlayers(db,[f.player.id],at)).has(f.player.id)).toBe(sport==="NFL");
 }
 expect(await db.rosterEntry.count()).toBe(rosterBefore);
});
it("retains professional team history, resolves dated source revisions and exposes cross-source disagreement",async()=>{
 const f=await fixture();
 const teamA=await db.proTeam.create({data:{sport:"NBA",provider:f.provider,externalId:"team-a",displayName:"Synthetic A"}});
 const teamB=await db.proTeam.create({data:{sport:"NBA",provider:f.provider,externalId:"team-b",displayName:"Synthetic B"}});
 const initial:Observation={...f.base,normalized:{kind:"TEAM_ASSIGNMENT",player:f.reference,team:{provider:f.provider,externalId:"team-a"},seasonStartYear:2032,assignment:"ROSTERED"}};
 const first=await f.run([initial]);expect(first.status==="PROCESSED"&&first.decisions[0].outcome).toBe("ACCEPTED");
 const changed:Observation={...initial,revisionToken:"2",revisionOrdinal:2,publishedAt:"2032-01-02T12:00:00Z",effectiveAt:"2032-01-01T12:00:00Z",normalized:{...initial.normalized as Extract<Observation["normalized"],{kind:"TEAM_ASSIGNMENT"}>,team:{provider:f.provider,externalId:"team-b"}}};
 await f.run([changed],new Date(+at+1001));
 const past=await professionalTeamHistory({playerId:f.player.id,sport:"NBA",asOf:new Date("2032-01-02T01:00:00Z")});expect(past.current?.teamId).toBe(teamA.id);
 const current=await professionalTeamHistory({playerId:f.player.id,sport:"NBA",asOf:at});expect(current.current?.teamId).toBe(teamB.id);expect(current.history).toHaveLength(2);expect(current.history.filter(r=>r.superseded)).toHaveLength(1);
 const otherPlayer=await db.player.create({data:{sport:"NBA",displayName:`Synthetic wrong actor ${randomUUID()}`,isSynthetic:true}});await db.playerExternalId.create({data:{sport:"NBA",provider:f.provider,externalId:"2",playerId:otherPlayer.id}});
 const wrongActor:Observation={...changed,revisionToken:"3",revisionOrdinal:3,normalized:{...changed.normalized as Extract<Observation["normalized"],{kind:"TEAM_ASSIGNMENT"}>,player:{provider:f.provider,externalId:"2"}}};
 const rejected=await f.run([wrongActor],new Date(+at+2002));expect(rejected.status==="PROCESSED"&&rejected.decisions[0].outcome).toBe("QUARANTINED");expect((await professionalTeamHistory({playerId:otherPlayer.id,sport:"NBA",asOf:at})).status).toBe("UNKNOWN");
 const provider=`alternate-${randomUUID()}`;
 const conflict=await synchronizeProvider(new LocalPageAdapter({records:[{...initial,provider}],nextCursor:null}),{provider,sport:"NBA",stream:"TEAM_ASSIGNMENT",minIntervalMs:1000,maxRequests:5,leaseMs:5000,permission:"FIXTURE_ONLY"},()=>at);
 expect(conflict.status).toBe("PROCESSED");
 expect(await professionalTeamHistory({playerId:f.player.id,sport:"NBA",asOf:at})).toMatchObject({status:"CONFLICT",current:null,fantasyOwnershipChanged:false});
});
it("keeps missing publication pending and atomically rolls back evidence with a rejected page",async()=>{
 const f=await fixture();const observation:Observation={...f.base,publishedAt:null,normalized:{kind:"AVAILABILITY",player:f.reference,game:null,designation:"OUT",irEligible:false,expiresAt:null}};
 const pending=await f.run([observation]);expect(pending.status==="PROCESSED"&&pending.decisions[0].outcome).toBe("PENDING_DATA");
 const accepted={...observation,revisionToken:"2",revisionOrdinal:2,publishedAt:f.base.publishedAt};
 expect((await f.run([accepted,{...accepted,provider:"outside-page-scope"}],new Date(+at+1001))).status).toBe("BACKOFF");
 expect(await db.playerAvailabilityEvidence.count({where:{playerId:f.player.id}})).toBe(0);
 expect(await db.professionalDataObservation.count({where:{provider:f.provider}})).toBe(1);
 expect((await db.professionalSyncState.findFirstOrThrow({where:{provider:f.provider}})).cursor).toBe("committed");
});
it("records explicit rookie classifications and explicit completion instants without fabricating game starts",async()=>{
 const f=await fixture("NFL");
 const rookie:Observation={...f.base,normalized:{kind:"ROOKIE",player:f.reference,seasonStartYear:2032,eligible:true,classificationBasis:"Synthetic authoritative rookie classification"}};
 await f.run([rookie]);expect(await db.$transaction(tx=>eligibleRookieIds(tx,f.season.id,at))).toContain(f.player.id);
 const corrected:Observation={...rookie,revisionToken:"2",revisionOrdinal:2,publishedAt:"2032-01-02T12:00:00Z",normalized:{...rookie.normalized as Extract<Observation["normalized"],{kind:"ROOKIE"}>,eligible:false}};
 await f.run([corrected],new Date(+at+1001));expect(await db.$transaction(tx=>eligibleRookieIds(tx,f.season.id,at))).not.toContain(f.player.id);
 const completion:Observation={...f.base,entityKey:`game:${f.game.externalId}`,normalized:{kind:"GAME_COMPLETION",game:{provider:f.provider,externalId:f.game.externalId},completedAt:"2032-01-01T00:00:00Z"}};
 const result=await f.run([completion]);expect(result.status==="PROCESSED"&&result.decisions[0].outcome).toBe("ACCEPTED");
 expect((await db.game.findUniqueOrThrow({where:{id:f.game.id}})).startsAt).toBeNull();
 expect((await db.gameCompletionEvidence.findFirstOrThrow({where:{gameId:f.game.id}})).completedAt.toISOString()).toBe("2032-01-01T00:00:00.000Z");
 const contradiction:Observation={...completion,revisionToken:"2",revisionOrdinal:2,normalized:{...completion.normalized as Extract<Observation["normalized"],{kind:"GAME_COMPLETION"}>,completedAt:"2031-12-31T23:59:00Z"}};
 const rejected=await f.run([contradiction],new Date(+at+1001));expect(rejected.status==="PROCESSED"&&rejected.decisions[0].outcome).toBe("QUARANTINED");
 expect(await db.gameCompletionEvidence.count({where:{gameId:f.game.id}})).toBe(1);
});
