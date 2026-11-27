import {expect,it} from 'vitest';
import {proveFinalBootstrapBinding,type BootstrapGame} from '@/server/final-completion-bootstrap';
const game:BootstrapGame={id:'00000000-0000-4000-8000-000000000001',sport:'NFL',provider:'v9-historical',externalId:'2026_11_JAX_NYG',seasonId:'00000000-0000-4000-8000-000000000002',seasonYear:2026,phase:'REGULAR',week:11,gameDate:'2026-11-22',startsAt:'2026-11-22T21:25:00Z',teams:[{id:'00000000-0000-4000-8000-000000000003',provider:'v9-historical',externalId:'JAX',code:'JAX',side:'UNKNOWN'},{id:'00000000-0000-4000-8000-000000000004',provider:'v9-historical',externalId:'NYG',code:'NYG',side:'UNKNOWN'}]};
const proof={id:'00000000-0000-4000-8000-000000000005',contentHash:'a'.repeat(64),sourceRecord:{game_id:game.externalId,season:2026,game_type:'regular',home_team:'NYG',away_team:'JAX',home_team_id:null,away_team_id:null,status:'final_score_present'}};
const result={season:'2026',week:'11',game_id:game.externalId,game_type:'REG',away_team:'JAX',home_team:'NYG',gameday:'2026-11-22',away_score:'18',home_score:'23',result:'5',total:'41'},at='2026-11-27T00:00:00Z';
it('accepts explicit NFL composite game/week/native team IDs without fabricating numeric IDs or event clocks',()=>{
 const binding=proveFinalBootstrapBinding(game,proof,'nfl-results-2026',game.externalId,new Map([['nfl-results-2026',[result]]]),at);
 expect(binding).toMatchObject({participantNamespace:'NFL_NATIVE_TEAM_CODE',participantIds:{home:'NYG',away:'JAX'},sourceDate:'2026-11-22'});
 expect(binding).not.toHaveProperty('completedAt');
});
it('rejects wrong participants, duplicate source identities and incomplete FINAL results despite matching names/date',()=>{
 for(const records of [[{...result,home_team:'NYJ'}],[result,result],[{...result,home_score:''}]])expect(()=>proveFinalBootstrapBinding(game,proof,'nfl-results-2026',game.externalId,new Map([['nfl-results-2026',records]]),at)).toThrow();
 expect(()=>proveFinalBootstrapBinding({...game,week:12},proof,'nfl-results-2026',game.externalId,new Map([['nfl-results-2026',[result]]]),at)).toThrow();
});
it('retains accepted cancellation conflicts instead of replacing them with an unreviewed FINAL claim',()=>{
 expect(()=>proveFinalBootstrapBinding(game,{...proof,sourceRecord:{...proof.sourceRecord,status:'Cancelled'}},'nfl-results-2026',game.externalId,new Map([['nfl-results-2026',[result]]]),at)).toThrow(/cancellation/);
});
it('binds historical NHL native team codes through the exact accepted V5 same-game numeric participant inventory',()=>{
 const nhl={...game,sport:'NHL' as const,externalId:'2026020199',week:null,teams:game.teams.map((team,index)=>({...team,externalId:index?'WSH':'PHI',code:index?'WSH':'PHI'}))};
 const v5={...proof,sourceRecord:{game_id:'2026020199',season:'2026',game_type:'regular',home_team:'WSH',away_team:'PHI',home_team_id:'15',away_team_id:'4',status:'OFF'}};
 const info={game_id:'2026020199',season:'20262027',game_type:'R',game_state:'OFF',home_score:'5',away_score:'2',game_date:'2026-10-28',home_team_abbr:'WSH',away_team_abbr:'PHI'};
 const inventory=[{game_id:info.game_id,home_away:'home',team_id:'15',team_abbrev:'WSH',player_id:'1'},{game_id:info.game_id,home_away:'away',team_id:'4',team_abbrev:'PHI',player_id:'2'}];
 const rows=new Map<string,Record<string,string>[]>([['nhl-game-info-2027',[info]],['nhl-goalies-2027',inventory]]);
 expect(proveFinalBootstrapBinding(nhl,v5,'nhl-game-info-2027',nhl.externalId,rows,at)).toMatchObject({participantIds:{home:'15',away:'4'}});
 rows.set('nhl-goalies-2027',[inventory[0],{...inventory[1],team_id:'5'}]);
 expect(()=>proveFinalBootstrapBinding(nhl,v5,'nhl-game-info-2027',nhl.externalId,rows,at)).toThrow(/numeric participant/);
});
it('binds historical official NBA IDs to accepted ESPN V5 IDs only through an exact publisher numeric crosswalk',()=>{
 const nba={...game,sport:'NBA' as const,externalId:'0022600168',week:null,gameDate:'2026-11-02',teams:game.teams.map((team,index)=>({...team,externalId:index?'1610612759':'1610612762',side:index?'HOME' as const:'AWAY' as const}))};
 const v5={...proof,sourceRecord:{game_id:'401909917',season:'2026',game_type:'regular',home_team_id:'24',away_team_id:'26',status:'Final'}};
 const row={game_id:nba.externalId,season:'2027',season_type:'regular-season',game_date:nba.gameDate,home_team_id:'1610612759',away_team_id:'1610612762',home_pts:'119',away_pts:'97',home_wl:'W',away_wl:'L'};
 const bridge={nba_game_id:nba.externalId,espn_game_id:'401909917',season:'2027',game_date:nba.gameDate,nba_home_team_id:row.home_team_id,nba_away_team_id:row.away_team_id,home_espn_team_id:'24',away_espn_team_id:'26',match_method:'both',match_confidence:'1.0'};
 const rows=new Map<string,Record<string,string>[]>([['nba-schedule-results-2027',[row]],['nba-crosswalk-2027',[bridge]]]);
 expect(proveFinalBootstrapBinding(nba,v5,'nba-schedule-results-2027',nba.externalId,rows,at)).toMatchObject({participantNamespace:'NBA_OFFICIAL_TO_ESPN_EXPLICIT_CROSSWALK'});
 rows.set('nba-crosswalk-2027',[{...bridge,nba_away_team_id:'1610612763'}]);expect(()=>proveFinalBootstrapBinding(nba,v5,'nba-schedule-results-2027',nba.externalId,rows,at)).toThrow(/numeric participants/);
});
