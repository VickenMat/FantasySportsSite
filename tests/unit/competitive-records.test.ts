import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { buildNflCompetitiveRecords,buildNbaCompetitiveRecords,bindCompleteFinalBox,type CanonicalCompetitiveGame } from '@/ingestion/open-data/competitive-records';
import { contentFingerprint } from '@/ingestion/contracts';
import { applicableRules } from '@/scoring/engine';
import { ubpV9Rules } from '@/scoring/ubp-v9';
const proof={sha256:'a'.repeat(64),sourceUrl:'https://fixture.invalid/retained.csv',receivedAt:'2038-01-02T12:00:00Z'};
const game=(sport:'NFL'|'NBA'):CanonicalCompetitiveGame=>({id:randomUUID(),provider:'accepted-fixture',externalId:sport==='NFL'?'2038_01_BUF_BAL':'0023700001',sport,seasonYear:sport==='NFL'?2038:2037,phase:'REGULAR',week:sport==='NFL'?1:null,gameDate:'2038-01-02',scheduledStartsAt:'2038-01-02T10:00:00Z',teams:['BUF','BAL'].map((code,index)=>({id:randomUUID(),provider:'accepted-fixture',externalId:code,code,side:index?'HOME':'AWAY'}))});
it('stages exact supported NFL facts and observed final separately without inventing actual or publication clocks',()=>{
 const canonical=game('NFL'),playerId=randomUUID(),row={...Object.fromEntries(applicableRules(ubpV9Rules,'FOOTBALL').filter(rule=>rule.applicability==='all').map(rule=>[rule.statKey,'0'])),player_id:'00-0100001',player_display_name:'Synthetic QB',position:'QB',season:'2038',week:'1',season_type:'REG',game_id:canonical.externalId,team:'BAL',opponent_team:'BUF'};
 const schedule={game_id:canonical.externalId,season:'2038',week:'1',game_type:'REG',gameday:'2038-01-02',home_team:'BAL',away_team:'BUF',home_score:'7',away_score:'0',result:'7',total:'7'};
 const result=buildNflCompetitiveRecords({game:canonical,schedule,statistics:[row],players:new Map([[row.player_id,playerId]]),proofs:[proof],validatedAt:'2038-01-02T14:00:00Z'});
 expect(result).toMatchObject({completeBoxBindingReady:true,productionCompetitiveReady:false,historicalV9CompletePlayers:1});expect(result.records[0]).toMatchObject({publishedAt:null,effectiveAt:null,normalized:{kind:'GAME_STATE',status:'FINAL',actualStartsAt:null,completedAt:null}});expect(result.records[1]).toMatchObject({normalized:{kind:'STAT',publicationSemantics:'UNVERIFIED',initialPublishedAt:null}});
 expect(()=>buildNflCompetitiveRecords({game:canonical,schedule:{...schedule,result:'8'},statistics:[row],players:new Map([[row.player_id,playerId]]),proofs:[proof],validatedAt:'2038-01-02T14:00:00Z'})).toThrow(/final-state hold/);
 expect(()=>bindCompleteFinalBox(result,[],'2038-01-02T15:00:00Z')).toThrow(/partial/);
 const stat=result.records[1].normalized;if(stat.kind!=='STAT')throw Error('Expected stat fact.');const bindings=[{playerId,role:'FOOTBALL' as const,statId:randomUUID(),statHash:'b'.repeat(64),scoreEntryId:randomUUID(),sourceProvider:'nflverse-open-data',stats:stat.stats,calculatedAt:'2038-01-02T14:01:00Z',recordedAt:'2038-01-02T14:00:00Z'}];
 expect(contentFingerprint(bindCompleteFinalBox(result,bindings,'2038-01-02T15:00:00Z'))).toBe(contentFingerprint(bindCompleteFinalBox(result,bindings,'2038-01-02T16:00:00Z'))); // Refresh time must not create conflicting source revisions.

});
it('retains explicit NBA DNP zero counts but withholds a genuinely missing counting field',()=>{
 const canonical=game('NBA');canonical.teams[0].code='BOS';canonical.teams[1].code='NYK';
 const columns=['points','rebounds_total','assists','steals','blocks','turnovers','field_goals_made','field_goals_attempted','free_throws_made','free_throws_attempted','three_pointers_made','rebounds_offensive'];
 const box:Record<string,string>[]=Array.from({length:10},(_,index)=>({...Object.fromEntries(columns.map(key=>[key,'0'])),game_id:canonical.externalId,season:'2038',person_id:String(10000+index),team_id:index<5?'1':'2',side:index<5?'away':'home',team_tricode:index<5?'BOS':'NYK',position:'G',minutes:index===5?'10:00':'',comment:index===5?'':"DNP - Coach's Decision"}));box[5].points='2';
 const players=new Map(box.map(row=>[row.person_id,randomUUID()])),schedule={game_id:canonical.externalId,season:'2038',season_type:'regular-season',game_date:'2038-01-02',home_team_id:'2',away_team_id:'1',home_team_abbreviation:'NYK',away_team_abbreviation:'BOS',home_pts:'2',away_pts:'0',home_wl:'W',away_wl:'L'};
 const build=()=>buildNbaCompetitiveRecords({game:canonical,schedule,box,players,proofs:[proof],validatedAt:'2038-01-02T14:00:00Z'});
 expect(build()).toMatchObject({completeBoxBindingReady:true,historicalV9CompletePlayers:10});
 box[0].rebounds_total='';const held=build();expect(held.completeBoxBindingReady).toBe(false);expect(held.holds[0].reason).toContain('REB');expect(held.records.filter(record=>record.normalized.kind==='STAT')).toHaveLength(9);
});
