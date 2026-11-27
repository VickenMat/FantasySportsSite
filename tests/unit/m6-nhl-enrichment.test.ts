import {expect,it} from 'vitest';
import {enrichNhlHistoricalSeason,type NhlHistoricalProof} from '@/simulation/nhl-enrichment';
import type {SourceRow} from '@/ingestion/open-data/read';
function fixture(){
 const common={game_id:'2016020001',season:'20162017',game_date:'2016-10-12',player_name:'Synthetic source actor'},skaters:SourceRow[]=Array.from({length:30},(_,i)=>({...common,player_id:String(8000000+i),team_id:i<15?'1':'2',team_abbrev:i<15?'HOME':'AWAY',position:'C',goals:i===0?'1':'0',assists:'0',faceoff_winning_pctg:i===0?'1':'0',toi:'15:00',shots_on_goal:'1',blocked_shots:'0',hits:'0'}));
 const info:SourceRow[]=[{...common,game_type:'R',game_state:'OFF',home_team_abbr:'HOME',away_team_abbr:'AWAY',home_score:'1',away_score:'0'}];
 const goalies:SourceRow[]=Array.from({length:4},(_,i)=>({...common,player_id:String(8000100+i),team_id:i<2?'1':'2',team_abbrev:i<2?'HOME':'AWAY',toi:i===3?'00:00':'20:00',decision:i===0?'W':i===2?'L':'',goals_against:i===2?'1':'0',saves:'10',starter:i===0||i===2?'true':'false'}));
 const events:SourceRow[]=Array.from({length:3},(_,i)=>({...common,event_idx:String(i),event_type:'FACEOFF',event_player_1_id:'8000000',event_player_1_type:'Winner',event_player_2_id:'8000020',event_player_2_type:'Loser'}));
 events.push({...common,event_idx:'3',event_type:'GOAL',event_player_1_id:'8000000',event_player_1_type:'Scorer',period:'1',period_time:'01:00',period_type:'REGULAR'},{...common,event_idx:'4',event_type:'GAME_END',period_type:'REGULAR',home_score:'1',away_score:'0'});
 const scoring:SourceRow[]=[{...common,eventId:'3',playerId:'8000000',period_number:'1',timeInPeriod:'01:00',strength:'sh',assists:JSON.stringify("shape: (0,)\nSeries: '' [struct[6]]\n[\n]")}];
 const profiles:NhlHistoricalProof[]=['skaters','goalies','info','events','scoring'].map(kind=>({kind,sourceSha256:'a'.repeat(64),sourceUrl:`https://example.test/${kind}`,schemaProfile:'NHL_OFFICIAL_DERIVED_NAMED_FIELDS_V1',physicalRows:1,missingColumns:[],license:'CC-BY-4.0',licenseReference:'https://example.test/license',receivedAt:'2026-11-27T00:00:00Z',decodedPath:'fixture',decodedSha256:'b'.repeat(64)}));
 return{seasonStartYear:2016,skaters,goalies,info,events,scoring,profiles};
}
it('reuses exact seasonal event proofs, retains known zeros and leaves played zero-GA shutouts unknown',()=>{
 const result=enrichNhlHistoricalSeason(fixture()),scorer=result.overlays.find(row=>row.sourcePlayerId==='8000000')!,backup=result.overlays.find(row=>row.sourcePlayerId==='8000101')!,loser=result.overlays.find(row=>row.sourcePlayerId==='8000102')!;
 expect(scorer.fields).toMatchObject({faceoff_wins:3,shorthanded_points_bonus:1});expect(scorer).toMatchObject({seasonStartYear:2016,sourceKnownAt:null,historicalOnly:true});
 expect(backup.fields.goalie_win).toBe(0);expect(backup.fields).not.toHaveProperty('shutout');expect(loser.fields).toMatchObject({goalie_win:0,shutout:0});expect(result.report.metrics.explicitShutoutCredits).toBe(0);
 expect(enrichNhlHistoricalSeason(fixture()).report.overlayFingerprint).toBe(result.report.overlayFingerprint);
});
it('keeps independently validated faceoffs when scoring-credit conflicts block shorthanded enrichment',()=>{
 const input=fixture();input.skaters[0].goals='2';const result=enrichNhlHistoricalSeason(input),row=result.overlays.find(row=>row.sourcePlayerId==='8000000')!;
 expect(row.fields.faceoff_wins).toBe(3);expect(row.fields).not.toHaveProperty('shorthanded_points_bonus');expect(result.report.scoringConflicts).toHaveLength(1);
});
it('rejects unreviewed formats and quarantines duplicate season/game identity rather than selecting one row',()=>{
 const input=fixture();input.profiles[0].missingColumns=['faceoff_winning_pctg'];expect(()=>enrichNhlHistoricalSeason(input)).toThrow('format');
 const duplicate=fixture();duplicate.info.push({...duplicate.info[0]});expect(enrichNhlHistoricalSeason(duplicate).overlays).toEqual([]);
});
