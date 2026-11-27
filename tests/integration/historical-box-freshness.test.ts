import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {it,expect,afterAll} from 'vitest';
import {getDatabase} from '@/lib/db';
import {persistObservation} from '@/ingestion/persist';
import {fingerprint,type Observation} from '@/ingestion/contracts';
import {applicableRules} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {recalculateInTransaction} from '@/server/score-ledger';
import {professionalDataFreshness} from '@/server/professional-data-freshness';
import {restoreMlbBoxRevision} from '@/ingestion/open-data/mlb-box-revision';
import {contentFingerprint} from '@/ingestion/contracts';
import {correctionAnchor,invalidateCorrectionAnchor} from '@/server/publication-anchors';
const db=getDatabase();let fixtureYear=2093;
afterAll(async()=>{await db.$disconnect();});
async function fixture(){
 const year=fixtureYear++,instant=(hour:number)=>new Date(Date.UTC(year,5,2,hour));
 const provider=`synthetic-archive-box-${randomUUID()}`,canonical=`synthetic-archive-${randomUUID()}`;
 const season=await db.season.upsert({where:{sport_startYear:{sport:'MLB',startYear:year}},create:{sport:'MLB',startYear:year,label:String(year)},update:{}});
 const team=await db.proTeam.create({data:{sport:'MLB',provider:canonical,externalId:'club',displayName:'Synthetic archive club'}});
 const game=await db.game.create({data:{sport:'MLB',provider:canonical,externalId:randomUUID(),seasonId:season.id,phase:'REGULAR',startsAt:instant(10)}});
 await db.gameTeam.create({data:{gameId:game.id,teamId:team.id}});
 const player=await db.player.create({data:{sport:'MLB',displayName:`Synthetic archive hitter ${randomUUID()}`,isSynthetic:true}});
 const batch=await db.importBatch.create({data:{sport:'MLB',provider:'v9-historical',sourceName:'Explicit isolated historical freshness fixture',contentHash:randomUUID(),importerVersion:'fixture',summary:{synthetic:true}}});
 const stats=Object.fromEntries(applicableRules(ubpV9Rules,'HITTER').map(rule=>[rule.statKey,0]));
 const stat=await db.playerGameStat.create({data:{gameId:game.id,playerId:player.id,teamId:team.id,importBatchId:batch.id,provider:'v9-historical',role:'HITTER',revision:1,contentHash:fingerprint({stats,fixture:game.id}),sourceLine:1,normalized:stats,observedPositions:['1B'],raw:{synthetic:true,archiveSource:'Preserved historical row without professionalObservation'},sourceKnownAt:null}});
 const entry=await db.$transaction(tx=>recalculateInTransaction(tx,'MLB',{gameId:game.id,playerId:player.id,role:'HITTER',sourceProvider:'v9-historical',reason:'Synthetic historical score for freshness fallback'}));
 const base={provider,sport:'MLB' as const,sourceReference:'https://fixture.invalid/reviewed-historical-box',revisionToken:'1',revisionOrdinal:1,observedAt:instant(14).toISOString(),effectiveAt:null,publishedAt:null,raw:{synthetic:true}};
 const state:Observation={...base,entityKey:`game-state:${game.id}`,normalized:{kind:'GAME_STATE',evidencePolicy:'CONSERVATIVE_OBSERVED_V1',game:{provider:canonical,externalId:game.externalId},status:'FINAL',scheduledStartsAt:game.startsAt!.toISOString(),actualStartsAt:null,completedAt:null}};
 const apply=(observation:Observation)=>db.$transaction(tx=>persistObservation(tx,observation,new Date(observation.observedAt)));
 expect((await apply(state)).outcome).toBe('ACCEPTED');
 const box:Observation={...base,raw:{synthetic:true,sourceFiles:[{scope:'FINAL_STATE',path:'data/provider_previews/synthetic-box.csv',sha256:'a'.repeat(64)}],acceptedStatTargets:[{playerId:player.id,sourcePlayerId:'synthetic-native-hitter',teamId:team.id,role:'HITTER',statId:stat.id,statHash:stat.contentHash,roleBasis:'SINGLE_CANONICAL_ROLE',expectedLedgerId:null,expectedEntryId:null}]},entityKey:`complete-box:${game.id}`,observedAt:instant(18).toISOString(),normalized:{kind:'COMPLETE_FINAL_BOX',game:{provider:canonical,externalId:game.externalId},policyVersion:'CONSERVATIVE_OBSERVED_V1',sourceFingerprint:'a'.repeat(64),completeness:{allExpectedRowsPresent:true,rolesResolved:true,noUnresolvedContradictions:true,expectedPlayers:1},statistics:[{playerId:player.id,role:'HITTER',statId:stat.id,statHash:stat.contentHash,scoreEntryId:entry.entry.id}],publicationSemantics:'OBSERVED_COMPLETE_BOX',initialPublishedAt:null}};
 const receipt=await apply(box);expect(receipt.outcome,receipt.reason).toBe('ACCEPTED');
 return{season,game,player,team,batch,stat,stats,entry,receipt,state,box,apply,instant,freshness:(hour:number)=>professionalDataFreshness({sport:'MLB',seasonId:season.id,asOf:instant(hour)})};
}
it('reports an accepted archived V9 box without inventing a source transport or publication timestamp',async()=>{
 const f=await fixture(),result=await f.freshness(18);
 expect(result).toMatchObject({status:'PROVISIONAL',receivedAt:null,publishedAt:null,initialPublishedAt:null,checkedAt:null,boxObservedAt:f.instant(18),operationalAnchorAt:f.instant(18),operationalDeadlineAt:new Date(+f.instant(18)+86400000),operationalAnchorMode:'OBSERVED_COMPLETE_BOX',operationalAnchorInvalidated:false});
 expect(result.normalizedAt).toEqual(f.stat.recordedAt);expect(result.scoredAt).toEqual(f.entry.entry.calculatedAt);
 expect(result.delays.publicationToReceiptMs).toBeNull();expect(result.delays.normalizationMs).toBeNull();
 expect(await db.professionalDataObservation.count({where:{sport:'MLB',category:'STAT',entityKey:{startsWith:`stat:${f.game.id}:`}}})).toBe(0);
 expect((await db.playerGameStat.findUniqueOrThrow({where:{id:f.stat.id}})).raw).toEqual(f.stat.raw);
 // A later score revision without a newly validated full box is incomplete evidence.
 await db.playerGameStat.create({data:{gameId:f.game.id,playerId:f.player.id,teamId:f.team.id,importBatchId:f.batch.id,provider:'v9-historical',role:'HITTER',revision:2,priorRevisionId:f.stat.id,contentHash:randomUUID(),sourceLine:1,normalized:{...f.stats,HR:1},observedPositions:['1B'],raw:{synthetic:true}}});
 await db.$transaction(tx=>recalculateInTransaction(tx,'MLB',{gameId:f.game.id,playerId:f.player.id,role:'HITTER',reason:'Synthetic later archive score requires refreshed complete box'}));
 expect(await f.freshness(19)).toMatchObject({status:'PENDING_REVIEW',receivedAt:null,publishedAt:null});
});
it('keeps invalidated historical box evidence under review',async()=>{
 const f=await fixture();await db.$transaction(tx=>invalidateCorrectionAnchor(tx,f.game.id,f.receipt.observationId,f.instant(19),'Explicit isolated completeness contradiction.'));
 expect(await f.freshness(19)).toMatchObject({status:'PENDING_REVIEW',operationalAnchorInvalidated:true,receivedAt:null,publishedAt:null});
});
it('keeps conflicting current game-state evidence under review despite the historical complete box',async()=>{
 const f=await fixture();expect((await f.apply({...f.state,provider:`conflict-${randomUUID()}`,observedAt:f.instant(19).toISOString(),normalized:{...f.state.normalized as Extract<Observation['normalized'],{kind:'GAME_STATE'}>,status:'LIVE'}})).outcome).toBe('ACCEPTED');
 expect(await f.freshness(19)).toMatchObject({status:'PENDING_REVIEW',receivedAt:null,publishedAt:null});
});

it('reuses the first immutable archived box revision after refreshing reviewed heads across a restart',async()=>{
 const f=await fixture(),prior=await db.professionalDataObservation.findUniqueOrThrow({where:{id:f.receipt.observationId}}),before=await db.professionalDataObservation.count({where:{category:'COMPLETE_FINAL_BOX',entityKey:f.box.entityKey}}),anchor=await db.$transaction(tx=>correctionAnchor(tx,f.game.id,f.instant(18)));
 const ledger=f.entry.ledger;if(!ledger)throw Error('Synthetic archived V9 fixture must create its ledger.');
 const refreshed:Observation={...f.box,observedAt:f.instant(19).toISOString(),revisionOrdinal:Date.parse(f.instant(19).toISOString()),raw:{...f.box.raw,acceptedStatTargets:(f.box.raw.acceptedStatTargets as Record<string,unknown>[]).map(target=>({...target,expectedLedgerId:ledger.id,expectedEntryId:f.entry.entry.id}))}};
 expect(contentFingerprint(refreshed)).not.toBe(prior.contentHash);
 const restore=()=>db.$transaction(tx=>restoreMlbBoxRevision(tx,refreshed));
 const stable=await restore();expect(contentFingerprint(stable)).toBe(prior.contentHash);expect(stable.observedAt).toBe(f.instant(19).toISOString());
 expect((await f.apply(stable)).outcome).toBe('DUPLICATE');
 // A separate client transaction reloads the original persisted representation,
 // so process-local metadata is not required for restart idempotence.
 expect(contentFingerprint(await restore())).toBe(prior.contentHash);
 expect(await db.professionalDataObservation.count({where:{category:'COMPLETE_FINAL_BOX',entityKey:f.box.entityKey}})).toBe(before);
 expect(await db.$transaction(tx=>correctionAnchor(tx,f.game.id,f.instant(19)))).toEqual(anchor);
 const changed=structuredClone(refreshed);if(changed.normalized.kind!=='COMPLETE_FINAL_BOX')throw Error('Expected box.');changed.normalized.statistics[0].statHash='different-stat-proof';
 await expect(db.$transaction(tx=>restoreMlbBoxRevision(tx,changed))).rejects.toThrow(/different source facts or statistical bindings/);
});
