import {it,expect} from 'vitest';
import {releaseGameStates,observedTransitions} from '@/ingestion/open-data/state-observations';
const final={game_id:'2026_01_NE_SEA',season:'2026',week:'1',gameday:'2026-09-09',game_type:'REG',home_team:'SEA',away_team:'NE',home_score:'20',away_score:'17',result:'3',total:'37'};
it('observes only current-season explicit scored NFL results and keeps incomplete or contradictory rows UNKNOWN',()=>{
 const states=releaseGameStates('nfl-results-2026',[final,{...final,game_id:'future',home_score:'',away_score:'',result:'',total:''},{...final,game_id:'contradiction',result:'4'},{...final,game_id:'old',season:'2025'}],'2026-11-27T00:00:00Z');
 expect(states).toEqual([{gameId:final.game_id,status:'FINAL'},{gameId:'future',status:'UNKNOWN'},{gameId:'contradiction',status:'UNKNOWN'}]);
 expect(states.every(row=>typeof row.status==='string')).toBe(true);
 const observed=observedTransitions({},states,'2026-11-27T00:00:00Z','a'.repeat(64));
 expect(observed.transitions.every(row=>row.actualEventTimeProven===false)).toBe(true);
});
it('preserves literal NHL source states',()=>expect(releaseGameStates('nhl-game-info-2027',[{game_id:'2026020002',game_state:'OFF'}],'2026-11-27T00:00:00Z')).toEqual([{gameId:'2026020002',status:'OFF'}]));
