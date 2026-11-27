import {it,expect} from 'vitest';
import {reconcileGenericPitcherCounts} from '@/positions/generic-pitcher-counts';
const row=(games='26',team='133')=>({line:10,data:{player_id:'669620',season:'2026',team_id:team,position:'P',position_match_status:'recorded_pitching',pitching_games:games,pitching_starts:'7',pitching_relief_appearances:String(Number(games)-7),pitching_source:'https://statsapi.mlb.com/api/v1/people/669620/stats?stats=yearByYear&group=pitching'}});
it('qualifies explicit20-game P evidence without inventing SP or RP',()=>expect(reconcileGenericPitcherCounts([row()]).positions).toEqual(['P']));
it('does not sum teams, duplicate totals or conflicting same-team records',()=>{
 expect(reconcileGenericPitcherCounts([row('12'),{...row('12','134'),line:11}]).positions).toEqual([]);
 expect(reconcileGenericPitcherCounts([row('12'),{...row('12'),line:11}]).positions).toEqual([]);
 expect(reconcileGenericPitcherCounts([row(),{...row('25'),line:11}]).positions).toEqual([]);
});
it('requires explicit source role/count coherence and the retained pitching reference',()=>{
 for(const patch of [{pitching_source:''},{position:'UNKNOWN'},{pitching_relief_appearances:'0'}])expect(reconcileGenericPitcherCounts([{...row(),data:{...row().data,...patch}}]).positions).toEqual([]);
});
