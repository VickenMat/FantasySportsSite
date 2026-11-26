import { expect,it,vi } from "vitest";
import { contentFingerprint, observationSchema, retryDelay } from "@/ingestion/contracts";
import { assertFixtureDatabase } from "@/ingestion/persist";
import { decodeSportsDataIoPlayers } from "@/ingestion/adapters";
const base={sport:"NBA" as const,observedAt:"2026-11-25T12:00:00Z",sourceReference:"https://api.sportsdata.io/reviewed/players",revisionToken:"snapshot-1",revisionOrdinal:1};
it("decodes provider identities without granting rookie, position or publication evidence",()=>{
 const [record]=decodeSportsDataIoPlayers([{PlayerID:42,FirstName:"Example",LastName:"Player",Position:"PG",Updated:"2026-11-25T11:00:00"}],base);
 expect(record.normalized).toMatchObject({kind:"PLAYER",externalId:"42",discovery:"EXISTING",links:[]});
 expect(record.publishedAt).toBeNull();expect(record.effectiveAt).toBeNull();expect(record.raw.Position).toBe("PG");
 expect(contentFingerprint({...record,observedAt:"2026-11-25T13:00:00Z"})).toBe(contentFingerprint(record));
 expect(contentFingerprint({...record,raw:{...record.raw,Position:"C"}})).not.toBe(contentFingerprint(record));
});
it("rejects ambiguous timestamps, invalid IDs and source references containing credentials",()=>{
 expect(()=>decodeSportsDataIoPlayers([{PlayerID:-1,FirstName:"A",LastName:"B"}],base)).toThrow();
 const [record]=decodeSportsDataIoPlayers([{PlayerID:42,FirstName:"A",LastName:"B"}],base);
 expect(()=>observationSchema.parse({...record,publishedAt:"2026-11-25T13:00:00Z"})).toThrow();
 expect(()=>observationSchema.parse({...record,sourceReference:"https://api.sportsdata.io/x?key=public&api_key=secret"})).toThrow();
 expect(()=>observationSchema.parse({...record,sourceReference:"https://api.sportsdata.io/x?key=secret"})).toThrow();
 expect(()=>observationSchema.parse({...record,sourceReference:"javascript:alert(1)"})).toThrow();
 expect(()=>observationSchema.parse({...record,observedAt:"2026-11-25T12:00:00"})).toThrow();
});
it("honors retry-after and conservative exponential backoff",()=>{
 expect(retryDelay(1,60000,120000)).toBe(120000);expect(retryDelay(10,1000,null)).toBe(1024000);
});

it("refuses fixture promotion outside an explicitly authorized isolated test schema",()=>{
 try {
  vi.stubEnv("AUTHORIZED_TEST_DATABASES","fantasy_evolution_test");
  for(const url of ["postgresql://localhost/fantasy_evolution?schema=integration_probe","postgresql://localhost/fantasy_evolution_test?schema=public"]) {
   vi.stubEnv("DATABASE_URL",url);expect(()=>assertFixtureDatabase()).toThrow(/isolated disposable/);
  }
  vi.stubEnv("DATABASE_URL","postgresql://localhost/fantasy_evolution_test?schema=integration_probe");
  vi.stubEnv("AUTHORIZED_TEST_DATABASES","");expect(()=>assertFixtureDatabase()).toThrow(/isolated disposable/);
 } finally {vi.unstubAllEnvs();}
});
