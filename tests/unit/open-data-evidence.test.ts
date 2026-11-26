import{expect,it}from'vitest';
import{scoringAssistIds}from'@/ingestion/open-data/polars-assists';
import{reconcileNhlEvents}from'@/ingestion/open-data/nhl-evidence';
import type{SourceRow}from'@/ingestion/open-data/read';
import{stableSourceProof}from'@/ingestion/open-data/provenance';
import{contentFingerprint,type Observation}from'@/ingestion/contracts';
const assists=(ids:string[])=>JSON.stringify(`shape: (${ids.length},)\nSeries: '' [struct[6]]\n[\n${ids.map(id=>`{${id},{"Given, Name",null},{"Family",null},{"G. Name",null},1,12}`).join('\n')}\n]`);
it('keeps refreshed verification times out of source content while preserving actual changed evidence',()=>{
 const observation=(receivedAt:string,name='Canonical Player'):Observation=>({provider:'nflverse-open-data',sport:'NFL',entityKey:'player:1',revisionToken:'snapshot',revisionOrdinal:1,observedAt:receivedAt,effectiveAt:null,publishedAt:null,sourceReference:'https://github.com/nflverse/nflverse-data',raw:{sourceProof:stableSourceProof({receivedAt,sha256:'same-body'}),name},normalized:{kind:'PLAYER',externalId:'1',displayName:name,discovery:'EXISTING',links:[]}});
 expect(contentFingerprint(observation('2026-11-26T12:00:00Z'))).toBe(contentFingerprint(observation('2026-11-26T13:00:00Z')));
 expect(contentFingerprint(observation('2026-11-26T13:00:00Z','Changed Name'))).not.toBe(contentFingerprint(observation('2026-11-26T12:00:00Z')));
});
it('decodes explicit assist IDs from the bounded source format without evaluating text or silently accepting malformed evidence',()=>{
 expect(scoringAssistIds(assists(['8477409','8478055']))).toEqual(['8477409','8478055']);expect(scoringAssistIds(assists([]))).toEqual([]);expect(scoringAssistIds(assists(['8477409','8477409']))).toBeNull();expect(scoringAssistIds('process.exit(1)')).toBeNull();expect(scoringAssistIds(assists(['8477409']).replace('shape: (1,)','shape: (2,)'))).toBeNull();
});
it('counts exact faceoff events and box-validated explicit SH credits while retaining a stale PBP assist as unselected source evidence',()=>{
 const skaters:SourceRow[]=Array.from({length:30},(_,i)=>({game_id:'game',player_id:String(8000000+i),team_id:i<15?'H':'A',goals:i===0?'1':'0',assists:i===1?'1':'0',faceoff_winning_pctg:i===0?'1':'0'}));
 const events:SourceRow[]=[...Array.from({length:3},(_,i)=>({game_id:'game',event_idx:String(i),event_type:'FACEOFF',event_player_1_id:'8000000',event_player_1_type:'Winner',event_player_2_id:'8000020',event_player_2_type:'Loser'})),{game_id:'game',event_idx:'3',event_type:'GOAL',event_player_1_id:'8000000',event_player_1_type:'Scorer',event_player_2_id:'9999999',event_player_2_type:'Assist',period:'1',period_time:'01:00',period_type:'REGULAR'},{game_id:'game',event_idx:'4',event_type:'GAME_END',home_score:'1',away_score:'0'}];
 const scoring=[{game_id:'game',eventId:'other-source-event-id',playerId:'8000000',period_number:'1',timeInPeriod:'01:00',strength:'sh',assists:assists(['8000001'])}];
 const info=[{game_id:'game',game_state:'OFF',home_score:'1',away_score:'0'}];
 const valid=reconcileNhlEvents(skaters,events,scoring,info);expect(valid.rejected).toEqual([]);expect(valid.accepted.get('game:8000000')).toMatchObject({faceoff_wins:3,shorthanded_points_bonus:1});expect(valid.accepted.get('game:8000001')?.shorthanded_points_bonus).toBe(1);expect(valid.accepted.get('game:8000002')?.faceoff_wins).toBe(0);
 expect(reconcileNhlEvents(skaters,events.filter(e=>e.event_type!=='GAME_END'),scoring,info).accepted.size).toBe(0);
 expect(reconcileNhlEvents(skaters,events,scoring.map(s=>({...s,assists:assists(['9999999'])})),info).accepted.size).toBe(0);
 expect(reconcileNhlEvents(skaters,[...events,events[0]],scoring,info).accepted.size).toBe(0);
});
