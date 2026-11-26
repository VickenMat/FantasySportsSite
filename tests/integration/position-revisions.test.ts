import "dotenv/config";
import{randomUUID}from"node:crypto";
import{afterAll,expect,it}from"vitest";
import{getDatabase}from"@/lib/db";
import{persistObservation}from"@/ingestion/persist";
import type{Observation}from"@/ingestion/contracts";
import{getEligiblePositions}from"@/server/positions";
const db=getDatabase();afterAll(()=>db.$disconnect());
const observedAt="2033-01-25T00:00:00Z";
async function fixture(sport:Observation["sport"]){
 const provider=`revision-${randomUUID()}`;
 const player=await db.player.create({data:{sport,displayName:`Synthetic retraction ${randomUUID()}`,isSynthetic:true}});
 const season=await db.season.upsert({where:{sport_startYear:{sport,startYear:2033}},create:{sport,startYear:2033,label:"2033"},update:{}});
 await db.playerExternalId.create({data:{sport,provider,externalId:"1",playerId:player.id}});
 const base={provider,sport,entityKey:"position:1",revisionToken:"1",revisionOrdinal:1,sourceReference:"https://fixture.invalid/position-revisions",observedAt,effectiveAt:"2033-01-01T00:00:00Z",publishedAt:"2033-01-20T00:00:00Z",raw:{synthetic:true}};
 const apply=(record:Observation)=>db.$transaction(tx=>persistObservation(tx,record,new Date(observedAt)));
 const eligibility=(asOf:string)=>getEligiblePositions({playerId:player.id,sport,seasonYear:2033,asOf:new Date(asOf)});
 return{provider,player,season,base,apply,eligibility};
}
it("projects replacements and explicit retractions as of source publication without deleting historical evidence",async()=>{
 const f=await fixture("NBA");
 const positive:Observation={...f.base,normalized:{kind:"POSITION",player:{provider:f.provider,externalId:"1"},seasonStartYear:2033,code:"PG",evidenceKind:"LISTED"}};
 const original=await f.apply(positive);expect(original.outcome).toBe("ACCEPTED");
 const revision:Observation={...f.base,entityKey:`position-revision:${original.observationId}`,publishedAt:"2033-01-22T00:00:00Z",normalized:{kind:"POSITION_REVISION",originalObservationId:original.observationId,replacements:[{code:"SG"}]}};
 expect((await f.apply(revision)).outcome).toBe("ACCEPTED");
 expect((await f.eligibility("2033-01-21T00:00:00Z")).positions).toEqual(["PG"]);
 expect((await f.eligibility("2033-01-23T00:00:00Z")).positions).toEqual(["SG"]);
 const clear:Observation={...revision,revisionToken:"2",revisionOrdinal:2,publishedAt:"2033-01-24T00:00:00Z",normalized:{kind:"POSITION_REVISION",originalObservationId:original.observationId,replacements:[]}};
 expect((await f.apply(clear)).outcome).toBe("ACCEPTED");
 expect(await f.eligibility(observedAt)).toMatchObject({available:true,positions:[]});
 expect((await f.eligibility("2033-01-23T00:00:00Z")).positions).toEqual(["SG"]);
 expect((await f.apply(clear)).outcome).toBe("DUPLICATE");
 expect(await db.playerPositionEvidence.count({where:{playerId:f.player.id}})).toBe(2);
 const other={...clear,provider:`other-${randomUUID()}`,entityKey:`position-revision:${original.observationId}`};expect((await f.apply(other)).outcome).toBe("QUARANTINED");
});
it("retracts an incorrect MLB start from the 10-start threshold while preserving prior dated eligibility",async()=>{
 const f=await fixture("MLB");let originalId="";
 for(let i=0;i<10;i++){
  const startsAt=new Date(Date.UTC(2033,0,i+1));
  const game=await db.game.create({data:{sport:"MLB",seasonId:f.season.id,provider:f.provider,externalId:randomUUID(),phase:"REGULAR",startsAt}});
  const record:Observation={...f.base,entityKey:`position:${game.id}:C`,effectiveAt:startsAt.toISOString(),normalized:{kind:"POSITION",player:{provider:f.provider,externalId:"1"},seasonStartYear:2033,code:"C",evidenceKind:"FIELDING",gameId:game.id,started:true}};
  const result=await f.apply(record);expect(result.outcome).toBe("ACCEPTED");if(i===0)originalId=result.observationId;
 }
 expect((await f.eligibility("2033-01-21T00:00:00Z")).positions).toEqual(["C"]);
 const revision:Observation={...f.base,entityKey:`position-revision:${originalId}`,publishedAt:"2033-01-22T00:00:00Z",normalized:{kind:"POSITION_REVISION",originalObservationId:originalId,replacements:[{code:"C",started:false}]}};
 expect((await f.apply(revision)).outcome).toBe("ACCEPTED");
 const current=await f.eligibility(observedAt);expect(current).toMatchObject({available:true,positions:[],fieldingCounts:[{seasonYear:2033,code:"C",starts:9,appearances:10}]});
 expect((await f.eligibility("2033-01-21T00:00:00Z")).positions).toEqual(["C"]);
 expect(await db.playerPositionEvidence.count({where:{playerId:f.player.id}})).toBe(11);
});
