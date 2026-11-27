import {expect,it} from 'vitest';
import {mlbScheduleResult,resolveMlbScheduleRows} from '@/ingestion/open-data/mlb-schedule-result';
const row={game_pk:'823317',game_date:'2026-04-12',game_datetime:'2026-04-12T20:10:00Z',season:'2026',game_type:'R',status_code:'F',detailed_state:'Final',abstract_state:'Final',home_team_id:'135',home_score:'7',away_team_id:'115',away_score:'2'};
it('uses explicit completed and completed-early states without inventing event/publication instants',()=>{expect(mlbScheduleResult(row,'2026-11-27T01:18:24Z')).toMatchObject({status:'FINAL',homeScore:7,awayScore:2,actualStartsAt:null,actualCompletedAt:null,officialPublishedAt:null});expect(mlbScheduleResult({...row,status_code:'FR',detailed_state:'Completed Early'},'2026-11-27T01:18:24Z').status).toBe('FINAL');});
it('does not treat source abstract Final as finished when detailed state is cancelled or postponed',()=>{expect(mlbScheduleResult({...row,status_code:'CR',detailed_state:'Cancelled'},'2026-11-27T01:18:24Z').status).toBe('CANCELLED');expect(mlbScheduleResult({...row,status_code:'DR',detailed_state:'Postponed'},'2026-11-27T01:18:24Z')).toMatchObject({status:'POSTPONED',pregameVerified:false});});
it('holds contradictory status/score, future and canonical identity gaps',()=>{for(const changed of [{status_code:'CR'},{home_score:''},{away_score:'7'},{game_date:'2027-04-12'},{home_team_id:'115'}])expect(mlbScheduleResult({...row,...changed},'2026-11-27T01:18:24Z').status).toBe('PENDING_DATA');});

it('reconciles an explicit postponed predecessor but holds conflicting final calendar dates',()=>{expect(resolveMlbScheduleRows([{...row,game_date:'2026-04-11',status_code:'DR',detailed_state:'Postponed',home_score:'',away_score:''},row],'2026-11-27T01:18:24Z').status).toBe('FINAL');expect(resolveMlbScheduleRows([row,{...row,game_date:'2026-04-13'}],'2026-11-27T01:18:24Z').status).toBe('PENDING_DATA');});

it('retains explicit future cancellations without treating future scores as completed play',()=>{
 const future={...row,game_date:'2026-12-12',game_datetime:'2026-12-12T20:10:00Z'};
 expect(mlbScheduleResult(future,'2026-11-27T01:18:24Z').status).toBe('PENDING_DATA');
 expect(mlbScheduleResult({...future,status_code:'CR',detailed_state:'Cancelled'},'2026-11-27T01:18:24Z')).toMatchObject({status:'CANCELLED',actualCompletedAt:null});
});
