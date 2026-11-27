import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recurringCompetitionStageHold,recurringCompetitionPolicy,existingLedgerSourcesAllowStage} from '@/ingestion/open-data/recurring-competition';
import {competitiveRevisionOrdinal} from '@/ingestion/open-data/competitive-revision-receipt';
import type {CompetitiveGameStage} from '@/ingestion/open-data/competitive-records';
const approved=new Date('2026-11-27T02:00:00Z'),at=new Date('2026-12-05T12:00:00Z');
const source=recurringCompetitionPolicy.products.find(row=>row.id==='nfl-statistics-2026')!;
const proofs=[{sourceUrl:source.sourceUrl,sha256:'a'.repeat(64),receivedAt:'2026-12-05T11:00:00Z'}];
const stage=()=>({game:{id:'game',sport:'NFL',seasonYear:2026,phase:'REGULAR',scheduledStartsAt:'2026-12-05T10:00:00Z'},completeBoxBindingReady:true,holds:[],expectedSourcePlayers:1,historicalV9CompletePlayers:1,records:[{sport:'NFL',observedAt:at.toISOString(),effectiveAt:null,publishedAt:null,normalized:{kind:'GAME_STATE'}},{sport:'NFL',observedAt:at.toISOString(),effectiveAt:null,publishedAt:null,normalized:{kind:'STAT'}}]} as unknown as CompetitiveGameStage);
it('permits only prospective complete current-season regular boxes with fresh post-approval primary bodies',()=>expect(recurringCompetitionStageHold(stage(),proofs,approved,at)).toBeNull());
it('excludes old games, preapproval body receipts, incomplete boxes and unsupported seasons',()=>{
 const old=stage();old.game.scheduledStartsAt='2026-11-26T23:00:00Z';expect(recurringCompetitionStageHold(old,proofs,approved,at)).toBe('SCHEDULED_START_OUTSIDE_PROSPECTIVE_CUTOVER');
 expect(recurringCompetitionStageHold(stage(),[{...proofs[0],receivedAt:'2026-11-27T01:59:59Z'}],approved,at)).toBe('PRE_APPROVAL_OR_UNVERIFIED_PRIMARY_BOX_BODY');
 const partial=stage();partial.holds=[{reason:'MISSING_FIELD'}];expect(recurringCompetitionStageHold(partial,proofs,approved,at)).toBe('INCOMPLETE_OR_CONFLICTED_FINAL_BOX');
 const wrong=stage();wrong.game.seasonYear=2027;expect(recurringCompetitionStageHold(wrong,proofs,approved,at)).toBe('OUTSIDE_CURRENT_CANONICAL_REGULAR_SCOPE');
});
it('rejects old or future receipt clocks and exact publication claims in observed records',()=>{
 expect(recurringCompetitionStageHold(stage(),[{...proofs[0],receivedAt:'2026-12-01T01:00:00Z'}],approved,at)).toBe('PRIMARY_BODY_OUTSIDE_FRESHNESS');
 expect(recurringCompetitionStageHold(stage(),[{...proofs[0],receivedAt:'2026-12-06T01:00:00Z'}],approved,at)).toBe('PRIMARY_BODY_OUTSIDE_FRESHNESS');
 const claimed=stage();claimed.records[0].publishedAt='2026-12-05T11:00:00Z';expect(recurringCompetitionStageHold(claimed,proofs,approved,at)).toBe('UNSUPPORTED_SOURCE_RECORD_OR_CLOCK');
});
it('preserves the same semantic source revision ordinal across unrelated global refreshes and process restarts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'m5-semantic-revision-'));
 try{const first=await competitiveRevisionOrdinal('a'.repeat(64),'2026-12-05T11:00:00Z',directory);expect(await competitiveRevisionOrdinal('a'.repeat(64),'2026-12-05T12:00:00Z',directory)).toBe(first);expect(await competitiveRevisionOrdinal('b'.repeat(64),'2026-12-05T12:00:00Z',directory)).toBeGreaterThan(first);}finally{await rm(directory,{recursive:true,force:true});}
});
it('refuses historical provider switches or changed scoring roles while permitting an unchanged source',()=>{
 const candidate=stage();candidate.records[1]={...candidate.records[1],provider:'nflverse-open-data',entityKey:'stat:game:player:FOOTBALL',normalized:{...candidate.records[1].normalized,role:'FOOTBALL'}} as typeof candidate.records[number];
 const ledger={playerId:'player',role:'FOOTBALL',entries:[{stat:{provider:'nflverse-open-data',role:'FOOTBALL'}}]};
 expect(existingLedgerSourcesAllowStage([ledger],candidate)).toBe(true);
 expect(existingLedgerSourcesAllowStage([{...ledger,entries:[{stat:{provider:'v9-historical',role:'FOOTBALL'}}]}],candidate)).toBe(false);
 expect(existingLedgerSourcesAllowStage([{...ledger,role:'BASKETBALL'}],candidate)).toBe(false);
});
