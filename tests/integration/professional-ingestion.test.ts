import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll,expect,it } from "vitest";
import { getDatabase } from "@/lib/db";
import { synchronizeProvider } from "@/ingestion/sync";
import { LocalPageAdapter } from "@/ingestion/adapters";
import { ProviderFailure,type Observation,type ProviderPolicy } from "@/ingestion/contracts";
import { getEligiblePositions } from "@/server/positions";
const db=getDatabase();afterAll(()=>db.$disconnect());
const at=new Date("2030-01-02T12:00:00Z");
function fixture(stream="PLAYER",sport:Observation["sport"]="NBA") {
 const provider=`fixture-${randomUUID()}`;
 const policy:ProviderPolicy={provider,sport,stream,minIntervalMs:1000,maxRequests:20,leaseMs:5000,permission:"FIXTURE_ONLY"};
 const record:Observation={provider,sport,entityKey:"player:1",revisionToken:"1",revisionOrdinal:1,sourceReference:"https://fixture.invalid/explicit-synthetic",observedAt:at.toISOString(),effectiveAt:null,publishedAt:null,raw:{synthetic:true},normalized:{kind:"PLAYER",externalId:"1",displayName:`Synthetic ${randomUUID()}`,links:[],discovery:"NEW"}};
 const run=(records:Observation[],time=at,cursor="page-1")=>synchronizeProvider(new LocalPageAdapter({records,nextCursor:cursor}),policy,()=>time);
 return {provider,policy,record,run};
}
it("preserves canonical IDs, rejects conflicting bridges and duplicate names, and keeps raw decisions immutable",async()=>{
 const f=fixture();
 const original=await db.player.create({data:{sport:"NBA",displayName:`Original ${randomUUID()}`,isSynthetic:true}});
 await db.playerExternalId.create({data:{sport:"NBA",provider:"fixture-existing",externalId:original.id,playerId:original.id}});
 const linked:Observation={...f.record,normalized:{kind:"PLAYER",externalId:"1",displayName:"Provider renamed display",links:[{provider:"fixture-existing",externalId:original.id}],discovery:"EXISTING"}};
 const first=await f.run([linked]);expect(first.status).toBe("PROCESSED");
 expect((await db.playerExternalId.findUniqueOrThrow({where:{sport_provider_externalId:{sport:"NBA",provider:f.provider,externalId:"1"}}})).playerId).toBe(original.id);
 expect((await db.player.findUniqueOrThrow({where:{id:original.id}})).displayName).toBe(original.displayName);
 const duplicate=await f.run([linked],new Date(+at+1001));
 expect(duplicate.status==="PROCESSED"&&duplicate.decisions[0].outcome).toBe("DUPLICATE");
 expect(await db.professionalDataObservation.count({where:{provider:f.provider}})).toBe(1);
 const observation=await db.professionalDataObservation.findFirstOrThrow({where:{provider:f.provider}});
 await expect(db.professionalDataObservation.update({where:{id:observation.id},data:{raw:{changed:true}}})).rejects.toThrow(/append-only/);
 const receipt=await db.professionalDataDecision.findFirstOrThrow({where:{observationId:observation.id}});
 await expect(db.professionalDataDecision.delete({where:{id:receipt.id}})).rejects.toThrow(/append-only/);
 const other=await db.player.create({data:{sport:"NBA",displayName:`Other ${randomUUID()}`,isSynthetic:true}});
 await db.playerExternalId.create({data:{sport:"NBA",provider:"fixture-existing",externalId:other.id,playerId:other.id}});
 const conflicting:Observation={...linked,revisionToken:"2",revisionOrdinal:2,normalized:{...linked.normalized as Extract<Observation["normalized"],{kind:"PLAYER"}>,links:[{provider:"fixture-existing",externalId:original.id},{provider:"fixture-existing",externalId:other.id}]}};
 const conflict=await f.run([conflicting],new Date(+at+2002));expect(conflict.status==="PROCESSED"&&conflict.decisions[0].outcome).toBe("QUARANTINED");
 const nameCollision:Observation={...f.record,entityKey:"player:2",normalized:{kind:"PLAYER",externalId:"2",displayName:original.displayName,links:[],discovery:"NEW"}};
 const collision=await f.run([nameCollision],new Date(+at+3003));expect(collision.status==="PROCESSED"&&collision.decisions[0].outcome).toBe("QUARANTINED");
});
it("requires publication evidence, preserves stale revisions and quarantines same-revision contradictions",async()=>{
 const f=fixture("POSITION");
 const player=await db.player.create({data:{sport:"NBA",displayName:`Position ${randomUUID()}`,isSynthetic:true}});
 await db.playerExternalId.create({data:{sport:"NBA",provider:f.provider,externalId:"1",playerId:player.id}});
 await db.season.upsert({where:{sport_startYear:{sport:"NBA",startYear:2030}},create:{sport:"NBA",startYear:2030,label:"2030-31"},update:{}});
 const missing:Observation={...f.record,entityKey:"position:1:PG",normalized:{kind:"POSITION",player:{provider:f.provider,externalId:"1"},seasonStartYear:2030,code:"PG",evidenceKind:"LISTED"}};
 const pending=await f.run([missing]);expect(pending.status==="PROCESSED"&&pending.decisions[0].outcome).toBe("PENDING_DATA");
 expect(await db.playerPositionEvidence.count({where:{playerId:player.id}})).toBe(0);
 const accepted:Observation={...missing,revisionToken:"2",revisionOrdinal:2,effectiveAt:"2030-01-01T00:00:00Z",publishedAt:"2030-01-02T00:00:00Z"};
 await f.run([accepted],new Date(+at+1001));
 const stale=await f.run([{...accepted,revisionToken:"0",revisionOrdinal:0}],new Date(+at+2002));
 expect(stale.status==="PROCESSED"&&stale.decisions[0].outcome).toBe("STALE");
 const contradict=await f.run([{...accepted,raw:{changed:true}}],new Date(+at+3003));
 expect(contradict.status==="PROCESSED"&&contradict.decisions[0].outcome).toBe("QUARANTINED");
 const retraction=await f.run([{...accepted,revisionToken:"3",revisionOrdinal:3,normalized:{...accepted.normalized as Extract<Observation["normalized"],{kind:"POSITION"}>,code:"C"}}],new Date(+at+4004));
 expect(retraction.status==="PROCESSED"&&retraction.decisions[0].outcome).toBe("QUARANTINED");
 expect((await getEligiblePositions({playerId:player.id,sport:"NBA",seasonYear:2030,asOf:new Date(+at+4000)})).positions).toEqual(["PG"]);
});
it("atomically rejects a mixed-scope page and resumes the persisted cursor after retry-after backoff",async()=>{
 const f=fixture();
 const bad={...f.record,provider:"wrong-provider"};
 expect((await f.run([f.record,bad])).status).toBe("BACKOFF");
 expect(await db.professionalDataObservation.count({where:{provider:f.provider}})).toBe(0);
 expect(await db.playerExternalId.count({where:{provider:f.provider}})).toBe(0);
 let state=await db.professionalSyncState.findFirstOrThrow({where:{provider:f.provider}});expect(state.cursor).toBeNull();
 const failing={fetchPage:async()=>{throw new ProviderFailure(429,120000);}};
 expect((await synchronizeProvider(failing,f.policy,()=>new Date(+at+3000))).status).toBe("BACKOFF");
 state=await db.professionalSyncState.findUniqueOrThrow({where:{id:state.id}});
 expect(+state.nextPollAt).toBe(+at+123000);
 expect((await f.run([f.record],new Date(+at+122999))).status).toBe("WAITING");
 const resumed=await f.run([f.record],new Date(+at+123001),"page-2");expect(resumed.status).toBe("PROCESSED");
 state=await db.professionalSyncState.findUniqueOrThrow({where:{id:state.id}});
 expect(state).toMatchObject({cursor:"page-2",requests:3,failures:0,leaseToken:null});
});
it("isolates concurrent workers and prevents an expired response from overwriting a recovered cursor",async()=>{
 const f=fixture();let time=at;
 let unlock!:()=>void,started!:()=>void;
 const entered=new Promise<void>(resolve=>{started=resolve;});const gate=new Promise<void>(resolve=>{unlock=resolve;});
 const slow={fetchPage:async()=>{started();await gate;return {records:[f.record],nextCursor:"stale-cursor"};}};
 const first=synchronizeProvider(slow,f.policy,()=>time);await entered;
 expect((await f.run([f.record])).status).toBe("WAITING");
 time=new Date(+at+5001);
 const recovered=await f.run([f.record],time,"recovered");expect(recovered.status).toBe("PROCESSED");
 unlock();expect((await first).status).toBe("BACKOFF");
 expect((await db.professionalSyncState.findFirstOrThrow({where:{provider:f.provider}})).cursor).toBe("recovered");
 expect(await db.professionalDataObservation.count({where:{provider:f.provider}})).toBe(1);
});
it("never invokes disabled adapters and persists request budgets across worker invocations",async()=>{
 const f=fixture();let calls=0;
 const adapter={fetchPage:async()=>{calls++;return {records:[],nextCursor:null};}};
 expect((await synchronizeProvider(adapter,{...f.policy,permission:"DISABLED"},()=>at)).status).toBe("PENDING_PERMISSION");expect(calls).toBe(0);
 await synchronizeProvider(adapter,{...f.policy,maxRequests:1},()=>at);
 expect((await synchronizeProvider(adapter,{...f.policy,maxRequests:1},()=>new Date(+at+1001))).status).toBe("QUOTA_EXHAUSTED");expect(calls).toBe(1);
});
it("reuses the approved MLB 10-start rule without treating listed roster roles as fielding evidence",async()=>{
 const f=fixture("POSITION","MLB");
 const player=await db.player.create({data:{sport:"MLB",displayName:`Fielding ${randomUUID()}`,isSynthetic:true}});
 await db.playerExternalId.create({data:{sport:"MLB",provider:f.provider,externalId:"1",playerId:player.id}});
 const season=await db.season.upsert({where:{sport_startYear:{sport:"MLB",startYear:2030}},create:{sport:"MLB",startYear:2030,label:"2030"},update:{}});
 const base:Observation={...f.record,effectiveAt:"2030-01-01T00:00:00Z",publishedAt:"2030-01-02T00:00:00Z",normalized:{kind:"POSITION",player:{provider:f.provider,externalId:"1"},seasonStartYear:2030,code:"SS",evidenceKind:"LISTED"}};
 const listed=await f.run([base]);expect(listed.status==="PROCESSED"&&listed.decisions[0].outcome).toBe("QUARANTINED");
 for(let index=0;index<10;index++) {
  const game=await db.game.create({data:{sport:"MLB",seasonId:season.id,provider:f.provider,externalId:String(index),phase:"REGULAR",startsAt:new Date("2030-01-01")}});
  await f.run([{...base,entityKey:`fielding:${index}`,normalized:{...base.normalized as Extract<Observation["normalized"],{kind:"POSITION"}>,evidenceKind:"FIELDING",gameId:game.id,started:true}}],new Date(+at+(index+1)*1001));
  expect((await getEligiblePositions({playerId:player.id,sport:"MLB",seasonYear:2030,asOf:new Date(+at+15000)})).positions).toEqual(index<9?[]:["SS"]);
 }
 expect((await getEligiblePositions({playerId:player.id,sport:"MLB",seasonYear:2031,asOf:new Date("2031-01-02")})).positions).toEqual(["SS"]);
});
