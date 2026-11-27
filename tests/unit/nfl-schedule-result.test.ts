import { expect,it } from 'vitest';
import { nflCompletedScheduleResult } from '@/ingestion/open-data/nfl-schedule-result';
const row={season:'2026',week:'11',game_id:'2026_11_A_B',away_team:'A',home_team:'B',gameday:'2026-11-25',away_score:'17',home_score:'20',result:'3',total:'37'},at='2026-11-27T00:00:00Z';
it('recognizes a complete publisher result without inventing completion/publication',()=>expect(nflCompletedScheduleResult(row,at)).toMatchObject({status:'FINAL',actualCompletedAt:null,officialPublishedAt:null,sourceGameDate:'2026-11-25'}));
it('does not turn missing scores into zero or infer scheduled/live state',()=>expect(nflCompletedScheduleResult({...row,away_score:'',home_score:'',result:'',total:''},at)).toMatchObject({status:'PENDING_DATA',reason:'NO_COMPLETE_PUBLISHER_COMPLETED_RESULT'}));
it('rejects inconsistent arithmetic, explicit future results and wrong canonical tuples',()=>{expect(nflCompletedScheduleResult({...row,result:'4'},at).status).toBe('PENDING_DATA');expect(nflCompletedScheduleResult({...row,gameday:'2026-11-28'},at).status).toBe('PENDING_DATA');expect(nflCompletedScheduleResult({...row,week:'12'},at).status).toBe('PENDING_DATA');});
it('retains explicitly recorded zero scores when the result is complete',()=>expect(nflCompletedScheduleResult({...row,home_score:'0',away_score:'0',result:'0',total:'0'},at).status).toBe('FINAL'));
