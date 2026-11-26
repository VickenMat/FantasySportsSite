import { expect, it } from 'vitest';
import { reconcileNhlEvents } from '@/ingestion/open-data/nhl-evidence';
import { reconcileNhlFaceoffs } from '@/ingestion/open-data/nhl-faceoff-evidence';
import { proveNhlGoalieDecisions } from '@/ingestion/open-data/nhl-goalie-decisions';
import { mlbPlayCompleteness } from '@/ingestion/open-data/mlb-play-completeness';
import type { SourceRow } from '@/ingestion/open-data/read';

const assists = (ids: string[]) => JSON.stringify(`shape: (${ids.length},)\nSeries: '' [struct[6]]\n[\n${ids.map(id=>`{${id},{"Given",null},{"Family",null},{"G. Family",null},1,12}`).join('\n')}\n]`);
function nhlFixture() {
  const skaters:SourceRow[]=Array.from({length:30},(_,i)=>({game_id:'g',player_id:String(8000000+i),team_id:i<15?'H':'A',team_abbrev:i<15?'HOME':'AWAY',goals:'0',assists:'0',faceoff_winning_pctg:i===0?'1':'0'}));
  const events:SourceRow[]=Array.from({length:3},(_,i)=>({game_id:'g',event_idx:String(i),event_type:'FACEOFF',event_player_1_id:'8000000',event_player_1_type:'Winner',event_player_2_id:'8000020',event_player_2_type:'Loser'}));
  const info:SourceRow={game_id:'g',game_type:'R',game_state:'OFF',home_team_abbr:'HOME',away_team_abbr:'AWAY',home_score:'1',away_score:'0'};
  return {skaters,events,info};
}
it('separates shootout team-score adjustment from personal goals using explicit period type',()=>{
  const {skaters,events,info}=nhlFixture();
  events.push({game_id:'g',event_idx:'3',event_type:'GOAL',event_player_1_id:'8000000',event_player_1_type:'Scorer',period:'5',period_time:'00:00',period_type:'SHOOTOUT',home_score:'0',away_score:'0'},{game_id:'g',event_idx:'4',event_type:'GAME_END',period:'5',period_type:'SHOOTOUT',home_score:'0',away_score:'0'});
  const scoring=[{game_id:'g',eventId:'score3',playerId:'8000000',period_number:'5',timeInPeriod:'00:00',strength:'ev',assists:assists([])}];
  expect(reconcileNhlEvents(skaters,events,scoring,[info]).rejected).toEqual([]);
  expect(reconcileNhlEvents(skaters,events,scoring,[info]).accepted.get('g:8000000')).toMatchObject({faceoff_wins:3,shorthanded_points_bonus:0});
  expect(reconcileNhlEvents(skaters,events,scoring,[{...info,home_score:'2'}]).accepted.size).toBe(0);
  expect(reconcileNhlEvents(skaters,events,scoring.map(row=>({...row,playerId:'8000020'})),[info]).accepted.size).toBe(0);
});
it('recognizes same-game goalie goals and assists without creating skater goals or cross-team credit',()=>{
  const {skaters,events,info}=nhlFixture();
  skaters[1].assists='1';
  events.push({game_id:'g',event_idx:'3',event_type:'GOAL',event_player_1_id:'8000100',event_player_1_type:'Scorer',period:'1',period_time:'01:00',period_type:'REGULAR'},{game_id:'g',event_idx:'4',event_type:'GAME_END',period:'3',period_type:'REGULAR',home_score:'1',away_score:'0'});
  const scoring=[{game_id:'g',eventId:'goal',playerId:'8000100',period_number:'1',timeInPeriod:'01:00',strength:'ev',assists:assists(['8000001'])}],goalies=[{game_id:'g',player_id:'8000100',team_id:'H',team_abbrev:'HOME',toi:'60:00'}];
  expect(reconcileNhlEvents(skaters,events,scoring,[info]).accepted.size).toBe(0);
  const resolved=reconcileNhlEvents(skaters,events,scoring,[info],goalies);
  expect(resolved.rejected).toEqual([]);expect(resolved.goalieScoringCredits.get('g:8000100')).toEqual({goals:1,goalEvents:['goal']});
  expect(reconcileNhlEvents(skaters,events,scoring,[info],[{...goalies[0],team_id:'A'}]).accepted.size).toBe(0);
  expect(reconcileNhlEvents(skaters,events,scoring,[info],[{...goalies[0],toi:'00:00'}]).accepted.size).toBe(0);
  expect(reconcileNhlFaceoffs(skaters,events,[info]).accepted.size).toBe(30);
  expect(reconcileNhlFaceoffs(skaters.map((row,i)=>i===3?{...row,faceoff_winning_pctg:'1'}:row),events,[info]).accepted.size).toBe(0);
  expect(reconcileNhlEvents(skaters,events,scoring,[{...info,home_score:'2'}],goalies).accepted.size).toBe(0);
});
it('requires a complete explicit unique winner inventory before proving another goalie did not win',()=>{
  const {info}=nhlFixture();
  const rows:SourceRow[]=Array.from({length:4},(_,i)=>({game_id:'g',player_id:String(8000100+i),team_id:i<2?'H':'A',team_abbrev:i<2?'HOME':'AWAY',decision:i===0?'W':i===2?'L':''}));
  const end:SourceRow={period_type:'REGULAR',home_score:'1',away_score:'0'};
  const result=proveNhlGoalieDecisions(rows,info,end);
  expect(result.accepted).toBe(true);if(result.accepted){expect(result.decisions.get('8000100')).toBe(1);expect(result.decisions.get('8000101')).toBe(0);expect(result.evidence.winningGoalieId).toBe('8000100');}
  expect(proveNhlGoalieDecisions(rows.slice(0,3),info,end).accepted).toBe(false);
  expect(proveNhlGoalieDecisions(rows.map(row=>({...row,decision:''})),info,end).accepted).toBe(false);
  expect(proveNhlGoalieDecisions(rows.map((row,i)=>i===1?{...row,decision:'W'}:row),info,end).accepted).toBe(false);
  expect(proveNhlGoalieDecisions(rows,{...info,home_score:'0',away_score:'1'},{...end,home_score:'0',away_score:'1'}).accepted).toBe(false);
});
it('does not charge interrupted at-bats or advisories as plate appearances and checks each canonical batter',()=>{
  const rows:SourceRow[]=[{at_bat_index:'0',event_type:'single',batter_id:'11',pitcher_id:'21',outs:'0'},{at_bat_index:'1',event_type:'caught_stealing_2b',batter_id:'99',pitcher_id:'21',outs:'3'},{at_bat_index:'2',event_type:'field_out',batter_id:'11',pitcher_id:'21',outs:'1'},{at_bat_index:'3',event_type:'strikeout',batter_id:'12',pitcher_id:'21',outs:'2'},{at_bat_index:'4',event_type:'game_advisory',batter_id:'99',pitcher_id:'77',outs:'2'}];
  const expected=new Map([['11',2],['12',1]]),result=mlbPlayCompleteness(rows,expected);
  expect(result.complete).toBe(true);expect(result.sourcePlateAppearances).toBe(3);expect(result.excluded).toHaveLength(2);expect(result.batters.has('99')).toBe(false);expect(result.pitchers.has('77')).toBe(false);
  expect(mlbPlayCompleteness(rows,new Map([['11',1],['12',2]])).complete).toBe(false);
  expect(mlbPlayCompleteness([...rows,rows[0]],expected).complete).toBe(false);
  expect(mlbPlayCompleteness(rows.map((row,i)=>i===1?{...row,outs:'2'}:row),expected).complete).toBe(false);
});
