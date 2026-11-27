import {it,expect} from 'vitest';
import {summarizeCompetitionOperations} from '@/ingestion/open-data/competition-operations';
const at=new Date('2026-12-05T12:00:00Z');
it('keeps persisted canonical retry visible through WAITING cycles while source transport can remain healthy',()=>{
 const result=summarizeCompetitionOperations({enabled:true,at,receipts:[],states:[{sport:'NHL',cursor:JSON.stringify({processed:0,held:399}),nextPollAt:new Date(+at+60000),leaseUntil:null,failures:1,lastFailure:'COMPETITIVE_SOURCE_OR_VALIDATION_FAILED',lastSuccessAt:null}]});
 expect(result.status).toBe('DEGRADED');expect(result.retrying).toBe(1);expect(result.sports.find(row=>row.sport==='NHL')).toMatchObject({status:'RETRYING',failures:1,nextRetryAt:new Date(+at+60000),lastAcceptedAt:null});
});
it('distinguishes successful empty prospective cycles from accepted games without labelling batch processing live',()=>{
 const result=summarizeCompetitionOperations({enabled:true,at,receipts:[{sport:'NFL',observedAt:at,normalized:{gameId:'game'},decisions:[{decidedAt:at}]}],states:[{sport:'NFL',cursor:JSON.stringify({processed:0,replay:1,held:165}),nextPollAt:new Date(+at+60000),leaseUntil:null,failures:0,lastFailure:null,lastSuccessAt:at}]});
 expect(result.status).toBe('ACTIVE');expect(result.sports.find(row=>row.sport==='NFL')).toMatchObject({status:'REPLAY_VERIFIED',lastProcessedAt:at,lastAcceptedAt:at,lastAcceptedGameId:'game',lastCycleProcessed:0,lastCycleReplay:1});
});
