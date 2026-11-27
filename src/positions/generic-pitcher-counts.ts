import {reconcileMlbCounts,type RecoveredPositionRow} from '@/ingestion/position-recovery';
function hasPitchingReference(data:Record<string,string>){return[data.verified_position_source,data.pitching_source].filter(Boolean).flatMap(value=>value.match(/https:\/\/[^\s;|]+/g)??[]).some(value=>{try{const url=new URL(value);return url.hostname==='statsapi.mlb.com'&&url.pathname===`/api/v1/people/${data.player_id}/stats`&&url.searchParams.get('group')==='pitching';}catch{return false;}});}

/** Explicit generic pitching participation qualifies P only. This separate path
 * never upgrades P to starting/relief roles or changes accepted role manifests. */
export function reconcileGenericPitcherCounts(rows:RecoveredPositionRow[]){
 const recorded=reconcileMlbCounts(rows);
 const supportedTeams=recorded.status==='QUARANTINED'?[]:recorded.teams.filter(team=>{
  if((team.counts.P??-1)<20)return false;
  if(team.counts.SP!==null&&team.counts.RP!==null&&team.counts.SP+team.counts.RP!==team.counts.P)return false;
  return rows.some(({line,data})=>team.lines.includes(line)&&data.position==='P'&&data.position_match_status==='recorded_pitching'&&hasPitchingReference(data));
 });
 return{positions:supportedTeams.length?['P']:[],teams:recorded.teams,supportedTeams,reasons:recorded.reasons,sourceReferences:recorded.sourceReferences,scope:'INDEPENDENT_TEAM_GENERIC_P_ONLY' as const};
}
