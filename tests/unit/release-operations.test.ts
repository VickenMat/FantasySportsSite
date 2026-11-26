import{expect,it,vi}from'vitest';
import{releaseOperations}from'@/ingestion/open-data/operations';
import{releaseRegistry}from'@/ingestion/open-data/registry';
import{releaseKey}from'@/ingestion/open-data/scheduler';
const{states,heartbeat}=vi.hoisted(()=>({states:vi.fn(),heartbeat:vi.fn()}));
vi.mock('@/lib/db',()=>({getDatabase:()=>({professionalSyncState:{findMany:states},backgroundJobRun:{findUnique:heartbeat}})}));
it('reports explicit worker opt-out as disabled while retaining earlier retrieval evidence and request counts',async()=>{
 const at=new Date('2035-01-01T12:00:00Z'),product=releaseRegistry[0];
 states.mockResolvedValue([{...releaseKey(product),cursor:JSON.stringify({artifactTimestamp:at.toISOString(),recordsReceived:10}),lastSuccessAt:at,requests:2,failures:0,lastFailure:null}]);
 heartbeat.mockResolvedValue({status:'RUNNING',startedAt:at,result:{heartbeatAt:at.toISOString(),releaseStatus:'DISABLED'}});
 const disabled=await releaseOperations(at);
 expect(disabled.retrievalActivation).toBe('DISABLED');
 expect(disabled.products[0]).toMatchObject({configuredEnabled:true,enabled:false,status:'DISABLED',requestsConsumed:2});
 expect(disabled.products[0].cursor).toMatchObject({recordsReceived:10});
 heartbeat.mockResolvedValue({status:'RUNNING',startedAt:at,result:{heartbeatAt:at.toISOString(),releaseStatus:'WAITING'}});
 expect((await releaseOperations(at)).products[0]).toMatchObject({enabled:true,status:'SYNCHRONIZED',requestsConsumed:2});
});
