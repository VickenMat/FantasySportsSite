import 'dotenv/config';
import {randomUUID,randomInt,createHash} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {buildNflCompetitiveRecords,type CanonicalCompetitiveGame} from '@/ingestion/open-data/competitive-records';
import {applicableRules} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {releaseRegistry} from '@/ingestion/open-data/registry';
import {beforeEach,afterAll,it,expect} from 'vitest';
import {getDatabase} from '@/lib/db';
import type {Prisma,PrismaClient} from '@/generated/prisma/client';
import {processRecurringCompetition,synchronizeRecurringCompetitionSport,recurringCompetitionPolicyFingerprint,loadRecurringCompetitionAuthorization} from '@/ingestion/open-data/recurring-competition';
const fixtureFiles:string[]=[];
const db=getDatabase(),at=new Date('2026-12-05T12:00:00Z');
const authorization={enabled:true,policyFingerprint:recurringCompetitionPolicyFingerprint,approvedAt:'2026-11-27T02:00:00Z'};
const empty=async()=>({stages:[],proofs:[],sourceFiles:[]});
beforeEach(async()=>{await db.professionalSyncState.deleteMany({where:{provider:'internal-recurring-competition'}});});
afterAll(async()=>{await db.$disconnect();for(const path of fixtureFiles)await rm(path,{recursive:true,force:true});});
it('isolates persisted NFL failures from NBA/NHL progress and enforces minute cadence across restarts',async()=>{
 const result=await processRecurringCompetition({db,clock:()=>at,testAuthorization:authorization,testCollect:async sport=>{if(sport==='NFL')throw Error('NFL retained product unavailable');return empty();}});
 expect(result.outcomes.map(row=>row.status)).toEqual(['BACKOFF','PROCESSED','PROCESSED']);
 const states=await db.professionalSyncState.findMany({where:{provider:'internal-recurring-competition'},orderBy:{sport:'asc'}});
 expect(states).toHaveLength(3);expect(states.find(row=>row.sport==='NFL')).toMatchObject({failures:1,lastFailure:'COMPETITIVE_SOURCE_OR_VALIDATION_FAILED',leaseToken:null,leaseUntil:null});
 expect(await synchronizeRecurringCompetitionSport('NBA',{db,clock:()=>new Date(+at+59999),testAuthorization:authorization,testCollect:empty})).toMatchObject({status:'WAITING'});
 expect(await synchronizeRecurringCompetitionSport('NBA',{db,clock:()=>new Date(+at+60000),testAuthorization:authorization,testCollect:empty})).toMatchObject({status:'PROCESSED',processed:0});
});
it('does not collect a second source while the same sport has an active persisted lease',async()=>{
 let unblock!:()=>void;const paused=new Promise<void>(resolve=>{unblock=resolve;});let entered!:()=>void;const collecting=new Promise<void>(resolve=>{entered=resolve;});
 const first=synchronizeRecurringCompetitionSport('NBA',{db,clock:()=>at,testAuthorization:authorization,testCollect:async()=>{entered();await paused;return empty();}});
 await collecting;
 try{expect(await synchronizeRecurringCompetitionSport('NBA',{db,clock:()=>at,testAuthorization:authorization,testCollect:async()=>{throw Error('Must not collect under another active lease');}})).toMatchObject({status:'WAITING'});}finally{unblock();}
 expect(await first).toMatchObject({status:'PROCESSED',processed:0});
});
it('does not inherit snapshot authorization or open operational state for a changed policy fingerprint',async()=>{
 const count=await db.professionalSyncState.count();
 expect(await synchronizeRecurringCompetitionSport('NFL',{db,clock:()=>at,testAuthorization:{...authorization,policyFingerprint:'cb8dfe386dba85c628276271b47fb249b6a8a3d7fb9729e448742e0058bea61b'},testCollect:async()=>{throw Error('No collection authorized');}})).toMatchObject({status:'DISABLED'});
 expect(await db.professionalSyncState.count()).toBe(count);
});

it('does not inherit a real workspace authorization inside a disposable schema without an explicit guarded override',async()=>{expect((await loadRecurringCompetitionAuthorization()).success).toBe(false);});

it('promotes an actually staged future-authorized full NFL statistical box and replays with zero canonical additions',async()=>{
 // Real canonical flags are required to exercise this policy. Keep all actor,
 // game and append-only evidence rows in a rollback-only fixture transaction;
 // production immutability triggers and all promotion assertions remain active.
 const rollback=new Error('Rollback only this complete recurring-policy fixture.');
 let ownedPlayerId:string|null=null,ownedGameId:string|null=null;
 try{await db.$transaction(async tx=>{
  const db=new Proxy(tx,{get(target,property){
   if(property==='$transaction')return async<T>(callback:(client:Prisma.TransactionClient)=>Promise<T>)=>callback(tx);
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }}) as unknown as PrismaClient;
 const tag=randomUUID(),canonicalProvider=`synthetic-recurring-${tag}`,home=`H${tag.slice(0,3).toUpperCase()}`,away=`A${tag.slice(0,3).toUpperCase()}`,externalId=`2026_14_${away}_${home}`;
 const season=await db.season.upsert({where:{sport_startYear:{sport:'NFL',startYear:2026}},create:{sport:'NFL',startYear:2026,label:'2026'},update:{}});
 const clubs=await Promise.all([away,home].map(code=>db.proTeam.create({data:{sport:'NFL',provider:canonicalProvider,externalId:code,code,displayName:`Synthetic recurring ${code}`}})));
 const canonical=await db.game.create({data:{sport:'NFL',provider:canonicalProvider,externalId,seasonId:season.id,phase:'REGULAR',week:14,gameDate:new Date('2026-12-05T00:00:00Z'),startsAt:new Date('2026-12-05T10:00:00Z')}});ownedGameId=canonical.id;
 await db.gameTeam.createMany({data:clubs.map((club,index)=>({gameId:canonical.id,teamId:club.id,side:index?'HOME':'AWAY'}))});
 const player=await db.player.create({data:{sport:'NFL',displayName:`Synthetic reviewed current source ${tag}`,isSynthetic:false,isDemo:false}}),playerExternalId=`00-${randomInt(1000000,9999999)}`;ownedPlayerId=player.id;
 await db.playerExternalId.create({data:{sport:'NFL',provider:'v9-historical',externalId:playerExternalId,playerId:player.id}});
 const game:CanonicalCompetitiveGame={id:canonical.id,provider:canonicalProvider,externalId,sport:'NFL',seasonYear:2026,phase:'REGULAR',week:14,gameDate:'2026-12-05',scheduledStartsAt:canonical.startsAt!.toISOString(),teams:clubs.map((club,index)=>({id:club.id,provider:canonicalProvider,externalId:club.externalId,code:club.code!,side:index?'HOME':'AWAY'}))};
 const statistics={...Object.fromEntries(applicableRules(ubpV9Rules,'FOOTBALL').filter(rule=>rule.applicability==='all').map(rule=>[rule.statKey,'0'])),player_id:playerExternalId,player_display_name:player.displayName,position:'QB',season:'2026',week:'14',season_type:'REG',game_id:externalId,team:home,opponent_team:away};
 const schedule={game_id:externalId,season:'2026',week:'14',game_type:'REG',gameday:'2026-12-05',home_team:home,away_team:away,home_score:'7',away_score:'0',result:'7',total:'7'};
 const directory=`data/provider_previews/test-recurring-competition-${tag}`;await mkdir(directory,{recursive:true});fixtureFiles.push(directory);await mkdir('data/provider_previews/objects',{recursive:true});
 const sources=await Promise.all([{id:'nfl-statistics-2026',row:statistics},{id:'nfl-results-2026',row:schedule}].map(async({id,row})=>{
  const product=releaseRegistry.find(product=>product.id===id)!,columns=Object.keys(row),record=row as Record<string,string>,quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
  const bytes=Buffer.from(columns.map(quote).join(',')+'\n'+columns.map(column=>quote(record[column])).join(',')+'\n'),sha256=createHash('sha256').update(bytes).digest('hex'),path=`${directory}/${id}.csv`,receipt=`data/provider_previews/objects/${sha256}.source.json`;
  await writeFile(path,bytes,{flag:'wx'});const proof={id,sourceUrl:product.sourceUrl,sha256,receivedAt:'2026-12-05T11:00:00.000Z'};
  await writeFile(receipt,JSON.stringify(proof),{flag:'wx'});fixtureFiles.push(receipt);return{path,proof};
 }));
 const stage=buildNflCompetitiveRecords({game,schedule,statistics:[statistics],players:new Map([[playerExternalId,player.id]]),proofs:sources.map(source=>source.proof),validatedAt:at.toISOString()});
 expect(stage.completeBoxBindingReady).toBe(true);expect(stage.holds).toHaveLength(0);
 const collection={stages:[stage],proofs:sources.map(source=>source.proof),sourceFiles:sources.map(source=>({path:source.path,sha256:source.proof.sha256}))};
 const first=await synchronizeRecurringCompetitionSport('NFL',{db,clock:()=>at,testAuthorization:authorization,testCollect:async()=>collection});
 expect(first,JSON.stringify(first)).toMatchObject({status:'PROCESSED',processed:1,replay:0,held:0,lastGameId:canonical.id});
 const counts=async()=>({stats:await db.playerGameStat.count({where:{gameId:canonical.id}}),entries:await db.scoreLedgerEntry.count({where:{ledger:{gameId:canonical.id}}}),sourceStats:await db.professionalDataObservation.count({where:{category:'STAT',entityKey:{startsWith:`stat:${canonical.id}:`}}}),boxes:await db.professionalDataObservation.count({where:{category:'BOX_CLOCK',entityKey:`box-clock:${canonical.id}`}}),receipts:await db.professionalDataObservation.count({where:{provider:'internal-recurring-competition',category:'RECURRING_COMPETITIVE_GAME',entityKey:{contains:canonical.id}}})});
 const beforeReplay=await counts();expect(beforeReplay).toEqual({stats:1,entries:1,sourceStats:1,boxes:1,receipts:1});
 expect(await synchronizeRecurringCompetitionSport('NFL',{db,clock:()=>new Date(+at+60000),testAuthorization:authorization,testCollect:async()=>collection})).toMatchObject({status:'PROCESSED',processed:0,replay:1});
 expect(await counts()).toEqual(beforeReplay);
 const stat=await db.playerGameStat.findFirstOrThrow({where:{gameId:canonical.id}});expect(stat.sourceKnownAt).toBeNull();expect(stat.provider).toBe('nflverse-open-data');
 expect((await db.game.findUniqueOrThrow({where:{id:canonical.id}})).startsAt).toEqual(canonical.startsAt);
 throw rollback;
 },{timeout:60000,isolationLevel:'Serializable'});}catch(error){if(error!==rollback)throw error;}
 expect(ownedPlayerId).not.toBeNull();expect(ownedGameId).not.toBeNull();
 expect(await db.player.count({where:{id:ownedPlayerId!}})).toBe(0);
 expect(await db.game.count({where:{id:ownedGameId!}})).toBe(0);
 expect(await db.playerGameStat.count({where:{gameId:ownedGameId!}})).toBe(0);
});
