import{expect,it}from'vitest';
import{releaseGameStates}from'@/ingestion/open-data/state-observations';
it('observes one explicit MLB state per primary game ID without inferring final from abstract status',()=>{
 const base={game_pk:'823317',game_date:'2026-04-12',season:'2026',game_type:'R',home_team_id:'135',away_team_id:'115',home_score:'7',away_score:'2',abstract_state:'Final',status_code:'F',detailed_state:'Final'};
 expect(releaseGameStates('mlb-schedules-2026',[{...base,game_date:'2026-04-11',home_score:'',away_score:'',status_code:'DR',detailed_state:'Postponed'},base,{...base,game_pk:'823318',status_code:'CR',detailed_state:'Cancelled'}],'2026-11-27T02:00:00Z')).toEqual([{gameId:'823317',status:'FINAL'},{gameId:'823318',status:'CANCELLED'}]);
});
