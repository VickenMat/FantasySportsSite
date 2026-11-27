import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { persistObservation } from '@/ingestion/persist';
import { observedPolicyAdoptedAt } from '@/ingestion/evidence-policy';
import { playerSnapshotSchema, type PlayerSnapshot } from '@/positions/player-snapshot-policy';
import { getEligiblePositions } from '@/server/positions';
import { professionalTeamHistory } from '@/server/professional-team-history';
import { irEligiblePlayers } from '@/server/roster-availability';
import { eligibleRookieIds } from '@/server/rookies';
const db=getDatabase(),at=new Date('2032-01-03T01:00:00Z');afterAll(()=>db.$disconnect());
async function fixture(){
 const provider=`snapshot-fixture-${randomUUID()}`,player=await db.player.create({data:{sport:'NFL',displayName:`Synthetic snapshot ${randomUUID()}`,isSynthetic:true}});
 await db.playerExternalId.create({data:{sport:'NFL',provider,externalId:'1',playerId:player.id}});
 const season=await db.season.upsert({where:{sport_startYear:{sport:'NFL',startYear:2032}},create:{sport:'NFL',startYear:2032,label:'2032'},update:{}});
 const observation=(facet:PlayerSnapshot['facet'],revision=1,retracted=false)=>({provider,sport:'NFL' as const,entityKey:`player-snapshot:${provider}:1:2032:${facet.type}${facet.type==='POSITION_AGGREGATE'?':'+facet.code:''}`,revisionToken:`${facet.type}:${revision}`,revisionOrdinal:revision,sourceReference:'https://fixture.invalid/player-snapshot',observedAt:'2032-01-03T00:00:00Z',effectiveAt:null,publishedAt:null,raw:{synthetic:true},normalized:playerSnapshotSchema.parse({kind:'PLAYER_SNAPSHOT',player:{provider,externalId:'1'},seasonStartYear:2032,sourceRecordId:`source:${revision}`,sourceFingerprint:String(revision).repeat(64),sourceSnapshotDate:'2032-01-02',sourceDatePrecision:'DAY',firstObservedAt:'2032-01-02T12:00:00Z',policyAdoptedAt:observedPolicyAdoptedAt.toISOString(),validFrom:'2032-01-03T00:00:00Z',validUntil:null,policyVersion:'approved-observed-player-snapshot-1',retracted,facet})});
 const run=(value:ReturnType<typeof observation>,time=at)=>db.$transaction(tx=>persistObservation(tx,value,time));
 return{provider,player,season,observation,run};
}
it('applies operational position/time semantics prospectively and keeps revision/retraction history',async()=>{
 const f=await fixture(),facet={type:'POSITION' as const,sourcePosition:'QB',professionalPosition:'QB',fantasyPositions:['QB'],context:'ROSTER_SNAPSHOT' as const},first=f.observation(facet);
 await f.run(first);
 const query=(asOf:Date)=>getEligiblePositions({playerId:f.player.id,sport:'NFL',seasonYear:2032,asOf});
 expect((await query(new Date('2032-01-03T00:30:00Z'))).positions).toEqual([]);
 expect((await query(at)).positions).toEqual(['QB']);
 expect(await db.playerPositionEvidence.count({where:{playerId:f.player.id}})).toBe(0);
 const raw=await db.professionalDataObservation.findFirstOrThrow({where:{provider:f.provider,category:'PLAYER_SNAPSHOT'}});
 expect(raw.effectiveAt).toBeNull();expect(raw.publishedAt).toBeNull();
 await f.run(f.observation({...facet,sourcePosition:'RB',professionalPosition:'RB',fantasyPositions:['RB']},2),new Date(+at+1000));
 expect((await query(new Date(+at+500))).positions).toEqual(['QB']);expect((await query(new Date(+at+1000))).positions).toEqual(['RB']);
 await f.run(f.observation(facet,3,true),new Date(+at+2000));
 expect((await query(new Date(+at+2000)))).toMatchObject({available:true,positions:[]});
 await f.run(first,new Date(+at+3000));expect((await query(new Date(+at+3000))).positions).toEqual([]);
});
it('uses explicit availability/rookie/team facts while preserving unknown source clocks and replay',async()=>{
 const f=await fixture(),team=await db.proTeam.create({data:{sport:'NFL',provider:f.provider,externalId:'T1',displayName:'Synthetic team',code:'T1'}});
 const availability=f.observation({type:'AVAILABILITY',sourceStatus:'Out',sourceType:'INJURY_STATUS_OUT',designation:'OUT',irEligible:true});
 await f.run(availability);await f.run(availability,new Date(+at+1000));
 const rows=await db.playerAvailabilityEvidence.findMany({where:{playerId:f.player.id}});expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({designation:'OUT',irEligible:true,effectiveAt:at,knownAt:at});expect(rows[0].sourceRecord).toMatchObject({actualEffectiveAt:null,officialPublishedAt:null,sourceSnapshotDate:'2032-01-02'});
 await f.run(f.observation({type:'ROOKIE',eligible:true,sourceField:'rookie_year',sourceYear:2032}));
 expect(await db.$transaction(tx=>eligibleRookieIds(tx,f.season.id,new Date('2032-01-03T00:30:00Z')))).not.toContain(f.player.id);
 expect(await db.$transaction(tx=>eligibleRookieIds(tx,f.season.id,at))).toContain(f.player.id);
 const association={type:'TEAM_ASSIGNMENT' as const,team:{provider:f.provider,externalId:'T1'},sourceTeamId:'T1',assignment:'ROSTERED' as const};
 await f.run(f.observation(association));
 const history=await professionalTeamHistory({playerId:f.player.id,sport:'NFL',asOf:at});expect(history.current).toMatchObject({teamId:team.id,effectiveAt:null,publishedAt:null,operationalEffectiveAt:at});
 await f.run(f.observation(association,2,true),new Date(+at+1000));expect((await professionalTeamHistory({playerId:f.player.id,sport:'NFL',asOf:new Date(+at+1000)})).status).toBe('UNKNOWN');
});

it('blocks safely actor-bound same-revision position, team, IR and rookie conflicts until a newer accepted revision without rewriting old evidence',async()=>{
 for(const type of ['POSITION','TEAM_ASSIGNMENT','AVAILABILITY','ROOKIE'] as const){
  const f=await fixture();
  const firstTeam=await db.proTeam.create({data:{sport:'NFL',provider:f.provider,externalId:'FIRST',displayName:'Synthetic first snapshot team',code:'FIRST'}});
  await db.proTeam.create({data:{sport:'NFL',provider:f.provider,externalId:'OTHER',displayName:'Synthetic conflicting snapshot team',code:'OTHER'}});
  const first:PlayerSnapshot['facet']=type==='POSITION'?{type,sourcePosition:'QB',professionalPosition:'QB',fantasyPositions:['QB'],context:'ROSTER_SNAPSHOT'}:type==='TEAM_ASSIGNMENT'?{type,team:{provider:f.provider,externalId:'FIRST'},sourceTeamId:'FIRST',assignment:'ROSTERED'}:type==='AVAILABILITY'?{type,sourceStatus:'Out',sourceType:'INJURY_STATUS_OUT',designation:'OUT',irEligible:true}:{type:'ROOKIE',eligible:true,sourceField:'rookie_year',sourceYear:2032};
  const incompatible:PlayerSnapshot['facet']=type==='POSITION'?{type,sourcePosition:'RB',professionalPosition:'RB',fantasyPositions:['RB'],context:'ROSTER_SNAPSHOT'}:type==='TEAM_ASSIGNMENT'?{type,team:{provider:f.provider,externalId:'OTHER'},sourceTeamId:'OTHER',assignment:'ROSTERED'}:type==='AVAILABILITY'?{type,sourceStatus:'Active',sourceType:'INJURY_STATUS_ACTIVE',designation:'ACTIVE',irEligible:false}:{type:'ROOKIE',eligible:false,sourceField:'rookie_year',sourceYear:2031};
  const original=f.observation(first),conflictAt=new Date(+at+3600000),restoredAt=new Date(+at+7200000);
  expect((await f.run(original)).outcome).toBe('ACCEPTED');
  const assertGrant=async(time:Date,granted:boolean)=>{
   if(type==='POSITION')expect((await getEligiblePositions({playerId:f.player.id,sport:'NFL',seasonYear:2032,asOf:time})).positions).toEqual(granted?['QB']:[]);
   if(type==='TEAM_ASSIGNMENT'){const state=await professionalTeamHistory({playerId:f.player.id,sport:'NFL',asOf:time});expect(state.status).toBe(granted?'SOURCE_RECORDED':'CONFLICT');expect(state.current?.teamId??null).toBe(granted?firstTeam.id:null);}
   if(type==='AVAILABILITY')expect((await irEligiblePlayers(db,[f.player.id],time)).has(f.player.id)).toBe(granted);
   if(type==='ROOKIE')expect((await eligibleRookieIds(db,f.season.id,time)).includes(f.player.id)).toBe(granted);
  };
  await assertGrant(at,true);
  const conflict={...f.observation(incompatible),observedAt:conflictAt.toISOString()};
  const rejected=await f.run(conflict,conflictAt);
  expect(rejected.outcome,rejected.reason).toBe('QUARANTINED');expect(rejected.targets).toMatchObject({playerId:f.player.id,snapshotConflict:true});
  await assertGrant(conflictAt,false);await assertGrant(at,true);
  if(type==='AVAILABILITY')expect(await db.playerAvailabilityEvidence.count({where:{playerId:f.player.id}})).toBe(1);
  if(type==='ROOKIE')expect(await db.rookieEligibilityEvidence.count({where:{playerId:f.player.id}})).toBe(1);
  if(type==='POSITION'){
   const unknown={...conflict,normalized:{...conflict.normalized,player:{provider:f.provider,externalId:'unmapped'}}};
   const unknownReceipt=await f.run(unknown,conflictAt);expect(unknownReceipt.outcome).toBe('QUARANTINED');expect(unknownReceipt.targets).not.toHaveProperty('playerId');
  }
  const restored={...f.observation(first,2),observedAt:restoredAt.toISOString()};
  expect((await f.run(restored,restoredAt)).outcome).toBe('ACCEPTED');
  await assertGrant(restoredAt,true);await assertGrant(conflictAt,false);await assertGrant(at,true);
  expect(await db.playerPositionEvidence.count({where:{playerId:f.player.id}})).toBe(0);
 }
});
