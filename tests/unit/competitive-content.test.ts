import {it,expect} from 'vitest';
import {recurringCompetitiveContentFingerprint} from '@/ingestion/open-data/competitive-content';
import type {CompetitiveGameStage} from '@/ingestion/open-data/competitive-records';
const fixture=()=>({game:{id:'game',provider:'canonical',externalId:'game-1',sport:'NFL',seasonYear:2026,phase:'REGULAR',week:1,gameDate:'2026-12-05',scheduledStartsAt:'2026-12-05T10:00:00Z',teams:[{id:'home',side:'HOME'},{id:'away',side:'AWAY'}]},sourceFingerprint:'a'.repeat(64),expectedSourcePlayers:1,historicalV9CompletePlayers:1,completeBoxBindingReady:true,holds:[],records:[{provider:'nflverse-open-data',sport:'NFL',entityKey:'stat:game:player:FOOTBALL',revisionToken:'original',revisionOrdinal:1,observedAt:'2026-12-05T12:00:00Z',normalized:{kind:'STAT',player:{provider:'canonical',externalId:'athlete'},team:{provider:'canonical',externalId:'home'},game:{provider:'canonical',externalId:'game-1'},role:'FOOTBALL',stats:{receptions:1,passing_yards:null}},raw:{sourceRecord:{position:'TE',minutes:'10:00',comment:'',team:'HOME'},historicalObservedPositions:['TE'],sourceProofs:[{sha256:'a'.repeat(64)}]}}]} as unknown as CompetitiveGameStage);
it('suppresses per-game statistical replay when only enclosing body/provenance metadata changes',()=>{
 const first=fixture(),refresh=structuredClone(first);refresh.sourceFingerprint='b'.repeat(64);refresh.records[0].revisionToken='new-release';refresh.records[0].revisionOrdinal=2;refresh.records[0].observedAt='2026-12-05T13:00:00Z';refresh.records[0].raw.sourceProofs=[{sha256:'b'.repeat(64)}];
 expect(recurringCompetitiveContentFingerprint(refresh)).toBe(recurringCompetitiveContentFingerprint(first));
});
it.each(['minutes','comment','position'])('retains %s source semantics in the scoring-content key',field=>{const first=fixture(),changed=structuredClone(first);(changed.records[0].raw.sourceRecord as Record<string,string>)[field]='changed';expect(recurringCompetitiveContentFingerprint(changed)).not.toBe(recurringCompetitiveContentFingerprint(first));});
it('does not suppress corrected values, unknown/zero changes, roles, canonical identities or resolved inventory',()=>{
 const first=fixture(),modify=(change:(stage:CompetitiveGameStage)=>void)=>{const changed=structuredClone(first);change(changed);expect(recurringCompetitiveContentFingerprint(changed)).not.toBe(recurringCompetitiveContentFingerprint(first));};
 modify(stage=>{if(stage.records[0].normalized.kind==='STAT')stage.records[0].normalized.stats.passing_yards=0;});
 modify(stage=>{stage.records[0].raw.historicalObservedPositions=['QB'];});
 modify(stage=>{stage.game.id='another-game';});
 modify(stage=>{stage.game.teams[0].id='another-team';});
 modify(stage=>{stage.expectedSourcePlayers=2;});
 modify(stage=>{if(stage.records[0].normalized.kind==='STAT')stage.records[0].normalized.role='BASKETBALL';});
});
