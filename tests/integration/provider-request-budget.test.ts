import "dotenv/config";
import{randomUUID}from"node:crypto";
import{afterAll,expect,it,vi}from"vitest";
import{getDatabase}from"@/lib/db";
import{synchronizeProvider}from"@/ingestion/sync";
import{ProviderFailure,type ProviderPolicy}from"@/ingestion/contracts";
const db=getDatabase();afterAll(()=>db.$disconnect());
const now=new Date("2031-02-03T12:00:00Z");
const policy=(provider:string,sport:ProviderPolicy["sport"],stream:string):ProviderPolicy=>({provider,sport,stream,minIntervalMs:1000,maxRequests:1,requestWindows:[{limit:2,windowMs:60000},{limit:3,windowMs:120000}],leaseMs:5000,permission:"FIXTURE_ONLY"});
it("serializes exact rolling budgets across simultaneous sports and streams and recovers at the actual oldest expiry",async()=>{
 const provider=`quota-${randomUUID()}`,fetchPage=vi.fn(async()=>({records:[],nextCursor:null}));
 const policies=(["NFL","MLB","NBA","NHL"]as const).map((sport,i)=>policy(provider,sport,`game:${i}`));
 const results=await Promise.all(policies.map(p=>synchronizeProvider({fetchPage},p,()=>now)));
 expect(results.filter(r=>r.status==="PROCESSED")).toHaveLength(2);expect(fetchPage).toHaveBeenCalledTimes(2);
 expect(results.filter(r=>r.status==="QUOTA_EXHAUSTED")).toHaveLength(2);
 const waiting=await synchronizeProvider({fetchPage},policy(provider,"NBA","before-expiry"),()=>new Date(+now+59999));expect(waiting.status).toBe("QUOTA_EXHAUSTED");
 expect((await synchronizeProvider({fetchPage},policy(provider,"NBA","at-expiry"),()=>new Date(+now+60000))).status).toBe("PROCESSED");
 expect((await synchronizeProvider({fetchPage},policy(provider,"NHL","long-window"),()=>new Date(+now+60001))).status).toBe("QUOTA_EXHAUSTED");
 expect((await synchronizeProvider({fetchPage},policies[0],()=>new Date(+now+120000))).status).toBe("PROCESSED");
 // requests is lifetime telemetry; a configured rolling budget must not become a permanent ceiling.
 expect(fetchPage).toHaveBeenCalledTimes(4);
});
it("charges failed requests, makes disabled jobs write-free, and refuses silent request-policy resets",async()=>{
 const provider=`failed-quota-${randomUUID()}`;
 const p={...policy(provider,"NFL","PLAYER"),requestWindows:[{limit:1,windowMs:60000}]};
 const failing={fetchPage:async()=>{throw new ProviderFailure(503);}};
 expect((await synchronizeProvider(failing,p,()=>now)).status).toBe("BACKOFF");
 const healthy={fetchPage:vi.fn(async()=>({records:[],nextCursor:null}))};
 expect((await synchronizeProvider(healthy,{...p,sport:"NBA"},()=>now)).status).toBe("QUOTA_EXHAUSTED");expect(healthy.fetchPage).not.toHaveBeenCalled();
 await expect(synchronizeProvider(healthy,{...p,stream:"policy-change",requestWindows:[{limit:10,windowMs:60000}]},()=>now)).rejects.toThrow(/policy changed/);
 const before=await db.rateLimitBucket.count();
 expect((await synchronizeProvider(healthy,{...p,permission:"DISABLED"},()=>now)).status).toBe("PENDING_PERMISSION");expect(await db.rateLimitBucket.count()).toBe(before);
});
