import type { SourceRow } from './read';
/** Actual published snapshot fields. abstract_state is 'Final' even on cancelled
 * and postponed source rows and must never be used as the terminal-state proof. */
export function mlbScheduleResult(row:SourceRow,observedAt:string){
 const pending=(reason:string)=>({status:'PENDING_DATA' as const,reason,actualStartsAt:null,actualCompletedAt:null,officialPublishedAt:null});
 const number=(value:string)=>/^\d+$/.test(value??'')&&Number.isSafeInteger(Number(value))?Number(value):null;
 if(!/^\d{6,12}$/.test(row.game_pk??'')||!/^\d{4}-\d{2}-\d{2}$/.test(row.game_date??'')||row.game_date.slice(0,4)!==row.season||!Number.isFinite(Date.parse(observedAt))||number(row.home_team_id)===null||number(row.away_team_id)===null||row.home_team_id===row.away_team_id)return pending('INVALID_OR_FUTURE_CANONICAL_GAME_DATE_TEAM_TUPLE');
 const phase=row.game_type==='R'?'REGULAR' as const:['F','D','L','W'].includes(row.game_type)?'POSTSEASON' as const:['S','E','A'].includes(row.game_type)?'PRESEASON' as const:null;
 if(!phase)return pending('UNSUPPORTED_PROFESSIONAL_GAME_TYPE');
 const base={sourceGameId:row.game_pk,seasonYear:Number(row.season),gameDate:row.game_date,phase,homeTeamId:row.home_team_id,awayTeamId:row.away_team_id,actualStartsAt:null,actualCompletedAt:null,officialPublishedAt:null,gameDatePrecision:'DAY' as const,sourceScheduledStartsAt:row.game_datetime||null};
 if(['CR','CG'].includes(row.status_code)&&row.detailed_state==='Cancelled')return{...base,status:'CANCELLED' as const};
 if(['DI','DR','DD'].includes(row.status_code)&&row.detailed_state==='Postponed')return{...base,status:'POSTPONED' as const,pregameVerified:false};
 if(row.game_date>observedAt.slice(0,10))return pending('FUTURE_DATE_CANNOT_ESTABLISH_FINAL');
 const terminal=row.detailed_state==='Final'&&['F','FT'].includes(row.status_code)||row.detailed_state==='Completed Early'&&['FO','FR','FM'].includes(row.status_code);
 if(!terminal)return pending('UNSUPPORTED_OR_CONTRADICTORY_DETAILED_STATE_CODE');
 const homeScore=number(row.home_score),awayScore=number(row.away_score);
 if(homeScore===null||awayScore===null||Math.max(homeScore,awayScore)>100||(phase!=='PRESEASON'&&homeScore===awayScore))return pending('MISSING_OR_CONTRADICTORY_EXPLICIT_FINAL_SCORE');
 return{...base,status:'FINAL' as const,homeScore,awayScore,finalPrecision:'OBSERVED_PUBLISHER_FINAL_RESULT' as const};
}
export const mlbScheduleDescriptor={id:'mlb-schedules-2026',provider:'sportsdataverse',sport:'MLB',directory:'sportsdataverse/2026',filename:'mlb_schedule_2026.csv.gz',sourceUrl:'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/mlb_schedules/mlb_schedule_2026.csv.gz',license:'CC-BY-4.0',licenseReference:'https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md',maxBytes:128*1024,publishedSha256:'e5163a8e0a09cae0b387a8ab932ff350f5596c824deb2b9b3f32c1dc89273a41',sourceSemantics:'explicit detailed_state+status_code+canonical MLB game/team IDs; game_datetime is scheduled only; abstract_state alone is unsafe'} as const;

/** One canonical game can retain its original postponed calendar row. A unique
 * later explicit final can supersede only those prior postponed rows; conflicting
 * terminal dates/scores/participants remain held, never selected by array order. */
export function resolveMlbScheduleRows(rows:SourceRow[],observedAt:string){
 const pending=(reason:string)=>({status:'PENDING_DATA' as const,reason});
 if(!rows.length)return pending('MISSING_SOURCE_GAME');
 const unique=[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
 const identity=new Set(unique.map(row=>[row.game_pk,row.season,row.game_type,row.home_team_id,row.away_team_id].join(':')));if(identity.size!==1)return pending('CONFLICTING_CANONICAL_SOURCE_TUPLE');
 const decoded=unique.map(row=>({row,value:mlbScheduleResult(row,observedAt)}));if(decoded.some(item=>item.value.status==='PENDING_DATA'))return pending('UNRESOLVED_GAME_STATE_RECORD');
 const finals=decoded.filter(item=>item.value.status==='FINAL');
 if(finals.length===1&&decoded.every(item=>item.value.status==='FINAL'||item.value.status==='POSTPONED'&&item.row.game_date<=finals[0].row.game_date))return{...finals[0].value,row:finals[0].row,supersededRows:decoded.filter(item=>item!==finals[0]).map(item=>item.row)};
 if(unique.length===1)return{...decoded[0].value,row:unique[0],supersededRows:[] as SourceRow[]};
 return pending('CONFLICTING_TERMINAL_DATE_OR_STATE_REQUIRES_REVIEW');
}
