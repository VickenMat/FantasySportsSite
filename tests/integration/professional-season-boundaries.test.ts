import "dotenv/config";
import{randomUUID}from"node:crypto";
import{afterAll,expect,it}from"vitest";
import{getDatabase}from"@/lib/db";
import{persistObservation}from"@/ingestion/persist";
import type{Observation}from"@/ingestion/contracts";
import{previewSelectedSeasons}from"@/server/scheduling";
const db=getDatabase();afterAll(()=>db.$disconnect());const at=new Date("2195-06-01T00:00:00Z");
it("requires independent boundary evidence, preserves source timestamps and selects upcoming seasons independently by sport",async()=>{
 const starts:Record<string,string>={};
 const expectations:Record<string,number>={NFL:2195,MLB:2196,NBA:2195,NHL:2195};
 for(const sport of["NFL","MLB","NBA","NHL"]as const){
  const year=expectations[sport],provider=`boundary-${randomUUID()}`;
  starts[sport]=`${year}-${sport==="NFL"?"09":sport==="MLB"?"03":"10"}-01T00:00:00Z`;
  const endYear=sport==="MLB"?year:year+1, end=new Date(`${endYear}-${sport==="MLB"?"09":sport==="NFL"?"01":"04"}-01T00:00:00Z`);
  const normalized={kind:"SEASON_BOUNDARY" as const,seasonStartYear:year,label:`${year}`,status:"AVAILABLE" as const,independentlyVerified:false,regularSeasonStartsAt:starts[sport],regularSeasonEndsAt:end.toISOString(),postseasonStartsAt:new Date(+end+86400000).toISOString(),postseasonEndsAt:new Date(+end+30*86400000).toISOString(),reason:"Explicit synthetic independent schedule evidence"};
  const record:Observation={provider,sport,entityKey:`season:${sport}:${year}`,revisionToken:"1",revisionOrdinal:1,sourceReference:"https://fixture.invalid/season-boundary",observedAt:at.toISOString(),publishedAt:"2195-05-31T00:00:00Z",effectiveAt:"2195-05-31T00:00:00Z",raw:{synthetic:true},normalized};
  const pending=await db.$transaction(tx=>persistObservation(tx,record,at));expect(pending.outcome).toBe("PENDING_DATA");
  expect(await db.professionalSeasonScheduleRevision.count({where:{provider}})).toBe(0);
  const accepted={...record,revisionToken:"2",revisionOrdinal:2,normalized:{...normalized,independentlyVerified:true}};
  expect((await db.$transaction(tx=>persistObservation(tx,accepted,at))).outcome).toBe("ACCEPTED");
  const revision=await db.professionalSeasonScheduleRevision.findFirstOrThrow({where:{provider}});expect(revision.retrievedAt).toEqual(at);expect(revision.sourceRecord).toMatchObject({publishedAt:record.publishedAt,observedAt:record.observedAt,independentlyVerified:true});
  const contradictory={...accepted,provider:`conflicting-${randomUUID()}`,normalized:{...accepted.normalized,regularSeasonEndsAt:new Date(+end+86400000).toISOString()}};
  expect((await db.$transaction(tx=>persistObservation(tx,contradictory,at))).outcome).toBe("QUARANTINED");
  expect(await db.professionalSeasonScheduleRevision.count({where:{seasonId:revision.seasonId,status:"AVAILABLE"}})).toBe(1);
 }
 const previews=await previewSelectedSeasons(db,{sports:["NFL","MLB","NBA","NHL"],seasonOffset:0,competitionType:"CUMULATIVE",now:at});
 for(const preview of previews){expect(preview.status).toBe("AVAILABLE");expect(preview.seasonStartYear).toBe(expectations[preview.sport]);expect(preview.draftDeadlineAt).toEqual(new Date(starts[preview.sport]));}
});
