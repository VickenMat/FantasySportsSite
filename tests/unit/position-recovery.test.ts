import {expect,it}from"vitest";
import{reconcileMlbCounts,classifyNbaPosition}from"@/ingestion/position-recovery";
const row=(team:string,games:string,line:number)=>({line,data:{player_id:"42",team_id:team,position_match_status:"recorded_fielding_plus_pitching_usage",verified_position_source:"https://statsapi.mlb.com/api/v1/people/42/stats?stats=yearByYear&group=fielding",games_ss:games}});
it("does not turn two unverified team scopes or a repaired list into threshold eligibility",()=>{
 expect(reconcileMlbCounts([row("1","15",2),row("2","15",3)])).toMatchObject({positions:[],possibleCombinedRequiresScopeVerification:["SS"]});
 expect(reconcileMlbCounts([{line:2,data:{...row("1","2",2).data,verified_eligible_positions:"SS"}}]).positions).toEqual([]);
 expect(reconcileMlbCounts([row("1","20",2),row("2","4",3)]).positions).toEqual(["SS"]);
});
it("quarantines contradictory counts for the same team instead of selecting the first record",()=>{
 expect(reconcileMlbCounts([row("1","20",2),row("1","10",3)])).toMatchObject({status:"QUARANTINED",positions:[]});
 expect(reconcileMlbCounts([row("1","20",2),row("1","20",3)]).teams).toHaveLength(1);
});
it("uses explicit pitching starts and relief counts and keeps NBA estimates out of current eligibility",()=>{
 const data={player_id:"42",team_id:"1",position_match_status:"recorded_pitching",pitching_source:"https://statsapi.mlb.com/api/v1/people/42/stats?stats=yearByYear&group=pitching",pitching_starts:"10",pitching_relief_appearances:"19"};
 expect(reconcileMlbCounts([{line:2,data}]).positions).toEqual(["SP"]);
 expect(classifyNbaPosition({verified_eligible_positions:"PG,SG",position_match_status:"estimated_minutes",team_id:"1"})).toMatchObject({quality:"ESTIMATED",positions:["PG","SG"],currentEligibilityPromoted:false});
});
