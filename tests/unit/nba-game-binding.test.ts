import {describe,it,expect} from 'vitest';
import {validNbaGameBridge} from '@/ingestion/open-data/nba-game-binding';
const schedule={game_id:'0022600053',game_date:'2026-11-24',season:'2027',home_team_id:'1610612764',away_team_id:'1610612738',home_team_abbreviation:'WAS',away_team_abbreviation:'BOS'};
const game={externalId:'401909315',gameDate:'2026-11-24',teams:[{externalId:'27',side:'HOME',code:'WSH'},{externalId:'2',side:'AWAY',code:'BOS'}]};
const evidence={sourceGameId:'0022600053',sourceSha256:'a'.repeat(64),observationId:'receipt',observationHash:'b'.repeat(64),crosswalk:{nba_game_id:'0022600053',espn_game_id:'401909315',game_date:'2026-11-24',season:'2027',nba_home_team_id:'1610612764',nba_away_team_id:'1610612738',home_espn_team_id:'27',away_espn_team_id:'2',match_method:'both',match_confidence:'1.0'}};
describe('explicit NBA source game bridge',()=>{
 it('binds different game namespaces and abbreviations through declared IDs for both sides',()=>expect(validNbaGameBridge(game,schedule,evidence)).toBe(true));
 it.each(['nba_game_id','espn_game_id','game_date','season','nba_home_team_id','nba_away_team_id','home_espn_team_id','away_espn_team_id','match_method','match_confidence'])('fails closed on contradictory %s',field=>{expect(validNbaGameBridge(game,schedule,{...evidence,crosswalk:{...evidence.crosswalk,[field]:'conflict'}})).toBe(false);});
 it('does not match a date/team tuple without the explicit publisher game edge',()=>expect(validNbaGameBridge(game,schedule,{...evidence,crosswalk:{...evidence.crosswalk,nba_game_id:''}})).toBe(false));
 it('rejects reversed canonical participants despite matching names or date',()=>expect(validNbaGameBridge({...game,teams:game.teams.map(team=>({...team,side:team.side==='HOME'?'AWAY':'HOME'}))},schedule,evidence)).toBe(false));
});
