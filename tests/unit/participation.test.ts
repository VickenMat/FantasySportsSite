import { expect, it } from 'vitest';
import { combineParticipationEvidence, participationEvidence } from '@/scoring/participation';

it('excludes final zero-TOI backups while preserving active, unfinished, unknown and conflicting evidence',()=>{
  const backup={role:'GOALIE' as const,provider:'v9-historical',raw:{original:{original:{toi:'0:00'}}},normalized:{saves:0,goalsAgainst:0,goalie_win:0,shutout:0}};
  expect(participationEvidence(backup).status).toBe('DID_NOT_PLAY');
  expect(participationEvidence({...backup,raw:{toi:'23:18'}}).status).toBe('PLAYED');
  expect(participationEvidence({...backup,raw:{}}).status).toBe('UNKNOWN');
  expect(participationEvidence({...backup,provider:'live',terminal:false}).status).toBe('UNKNOWN');
  expect(participationEvidence({...backup,provider:'live',raw:{professionalObservation:{phase:'CORRECTION'},original:{toi:'0:00'}}}).status).toBe('UNKNOWN');
  expect(participationEvidence({...backup,normalized:{saves:2}}).status).toBe('UNKNOWN');
  expect(participationEvidence({...backup,raw:{toi:'0:00',saves:'2'},normalized:{}}).status).toBe('UNKNOWN');
  expect(participationEvidence({...backup,raw:{toi:'0:00'},normalized:{shutout:1}}).status).toBe('DID_NOT_PLAY');
  expect(participationEvidence({...backup,raw:{toi:'0:00',shutout:1},normalized:{shutout:1}}).status).toBe('UNKNOWN');
  expect(participationEvidence({...backup,provider:'explicit-box-source',terminal:true,raw:{toi:'0:00'},normalized:{shutout:1}}).status).toBe('UNKNOWN');
});
it('uses role-appropriate appearance fields without treating roster status or profile metadata as participation',()=>{
  expect(participationEvidence({role:'BASKETBALL',provider:'v9-historical',raw:{MIN:'0'},normalized:{PTS:0}}).status).toBe('DID_NOT_PLAY');
  expect(participationEvidence({role:'BASKETBALL',raw:{MIN:'0'},normalized:{PTS:0}}).status).toBe('UNKNOWN');
  expect(participationEvidence({role:'BASKETBALL',raw:{MIN:'1:03'},normalized:{PTS:0}}).status).toBe('PLAYED');
  expect(participationEvidence({role:'BASKETBALL',provider:'v9-historical',raw:{MIN:'0',PTS:'2'}}).status).toBe('UNKNOWN');
  expect(participationEvidence({role:'HITTER',provider:'v9-historical',raw:{gamesPlayed:'0',plateAppearances:'0'}}).status).toBe('DID_NOT_PLAY');
  expect(participationEvidence({role:'HITTER',provider:'v9-historical',raw:{gamesPlayed:'0',plateAppearances:'3'}}).status).toBe('UNKNOWN');
  expect(participationEvidence({role:'FOOTBALL',raw:{age:30,season:2026,status:'ACT'}}).status).toBe('UNKNOWN');
  expect(participationEvidence({role:'BASKETBALL',raw:{status:'ACTIVE'},normalized:{fantasy_points:100,age:30}}).status).toBe('UNKNOWN');
  expect(participationEvidence({role:'FOOTBALL',raw:{def_tackles_solo:'3'}}).status).toBe('PLAYED');
});
it('counts one MLB participant across roles but retains contradictory same-role sources',()=>{
  const hitter={role:'HITTER' as const,provider:'v9-historical',raw:{gamesPlayed:'0',plateAppearances:'0'}},pitcher={role:'PITCHER' as const,provider:'v9-historical',raw:{gamesPitched:'1'}};
  expect(combineParticipationEvidence([hitter,pitcher]).status).toBe('PLAYED');
  expect(combineParticipationEvidence([hitter,{...hitter,raw:{gamesPlayed:'1',plateAppearances:'3'}}]).status).toBe('UNKNOWN');
});

it('retains documented NBA flat-box DNP comments and clock/ISO minutes without inventing minutes or played games from zeros',()=>{
 const row={role:'BASKETBALL' as const,provider:'sportsdataverse-open-data',terminal:true,normalized:{PTS:0,REB:0},raw:{sourceRecord:{minutes:'',comment:"DNP - Coach's Decision",points:'0'}}};
 expect(participationEvidence(row).status).toBe('DID_NOT_PLAY');
 expect(participationEvidence({...row,raw:{sourceRecord:{minutes:'',comment:'Inactive - Injury/Illness',points:'0'}}}).status).toBe('DID_NOT_PLAY');
 expect(participationEvidence({...row,raw:{sourceRecord:{minutes:'',comment:'NWT - Personal',points:'0'}}}).status).toBe('DID_NOT_PLAY');
 expect(participationEvidence({...row,raw:{sourceRecord:{minutes:'PT0M0.00S',comment:'',points:'0'}}}).status).toBe('DID_NOT_PLAY');
 expect(participationEvidence({...row,raw:{sourceRecord:{minutes:'PT1M0.50S',comment:'',points:'0'}}}).status).toBe('PLAYED');
 expect(participationEvidence({...row,raw:{sourceRecord:{minutes:'',comment:'',points:'0'}}}).status).toBe('UNKNOWN');
 expect(participationEvidence({...row,normalized:{},raw:{sourceRecord:{minutes:'',comment:'',points:'2'}}}).status).toBe('PLAYED');
 expect(participationEvidence({...row,normalized:{PTS:2}}).status).toBe('UNKNOWN');
});
