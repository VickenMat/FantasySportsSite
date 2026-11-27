/** nfldata's maintainer selects completed games by populated result; this is not a live scoreboard. */
const integer=(value:string|undefined,signed=false)=>value!==undefined&&(signed?/^-?\d+$/:/^\d+$/).test(value)?Number(value):null;
export function nflCompletedScheduleResult(row:Record<string,string>,observedAt:string){
 const pending=(reason:string)=>({status:'PENDING_DATA' as const,reason,actualCompletedAt:null,officialPublishedAt:null});
 const season=integer(row.season),week=integer(row.week),home=integer(row.home_score),away=integer(row.away_score),result=integer(row.result,true),total=integer(row.total);
 if(!season||!week||week>30||row.game_id!==`${season}_${String(week).padStart(2,'0')}_${row.away_team}_${row.home_team}`||!/^\d{4}-\d{2}-\d{2}$/.test(row.gameday))return pending('SOURCE_GAME_TUPLE_INVALID');
 if(!Number.isFinite(Date.parse(observedAt))||row.gameday>observedAt.slice(0,10))return pending('FUTURE_OR_UNDATED_RESULT');
 if(home===null||away===null||result===null||total===null)return pending('NO_COMPLETE_PUBLISHER_COMPLETED_RESULT');
 if(![home,away,result,total].every(Number.isSafeInteger)||Math.max(home,away)>200||home-away!==result||home+away!==total)return pending('CONTRADICTORY_FINAL_SCORE_ARITHMETIC');
 return{status:'FINAL' as const,sourceGameId:row.game_id,sourceGameDate:row.gameday,datePrecision:'DAY' as const,homeScore:home,awayScore:away,
  sourceSemantics:'PUBLISHER_COMPLETED_GAME_RESULT' as const,actualCompletedAt:null,officialPublishedAt:null,
  semanticProofs:['https://raw.githubusercontent.com/nflverse/nfldata/master/UPDATING-NFLFASTR.md','https://raw.githubusercontent.com/nflverse/nfldata/master/code/plays.R','https://raw.githubusercontent.com/nflverse/nfldata/master/DATASETS.md']};
}
