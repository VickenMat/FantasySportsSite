import { fingerprint } from "./contracts";
export type RecoveredPositionRow={line:number;data:Record<string,string>};
const fieldCounts:Record<string,string>={C:"games_c","1B":"games_1b","2B":"games_2b","3B":"games_3b",SS:"games_ss",LF:"games_lf",CF:"games_cf",RF:"games_rf",DH:"games_dh"};
export const parsePositionList=(value:string)=>[...new Set(value.split(/[,/;\s-]+/).map(s=>s.trim().toUpperCase()).filter(Boolean))].sort();
function count(value:string|undefined):number|null {if(value==null||value.trim()==="")return null;if(!/^\d+$/.test(value.trim()))throw new Error("Invalid recorded appearance count");const n=Number(value);if(!Number.isSafeInteger(n)||n>500)throw new Error("Appearance count outside historical season bounds");return n;}
function sourceFor(row:Record<string,string>,playerId:string,group:string) {
 const values=[row.verified_position_source,row.pitching_source].filter(Boolean).flatMap(s=>s.match(/https:\/\/[^\s;|]+/g)??[]);
 return values.filter(value=>{try{const u=new URL(value);return u.hostname==="statsapi.mlb.com"&&u.pathname===`/api/v1/people/${playerId}/stats`&&u.searchParams.get("group")===group;}catch{return false;}});
}
/** Qualify only counts that independently prove a threshold. Never sum possibly duplicated full-season totals. */
export function reconcileMlbCounts(rows:RecoveredPositionRow[]) {
 const positions=new Set<string>(),reasons:string[]=[],sources=new Set<string>();
 const teams=new Map<string,{counts:Record<string,number|null>;lines:number[]}>();
 for(const {line,data:r}of rows) {
  if(r.position_match_status==="unmatched")continue;
  const values:Record<string,number|null>={};
  try {for(const [code,key]of Object.entries(fieldCounts))values[code]=count(r[key]);values.SP=count(r.pitching_starts);values.RP=count(r.pitching_relief_appearances);values.P=count(r.pitching_games);}catch{reasons.push(`INVALID_COUNTS:${line}`);continue;}
  const team=r.team_id?.trim();if(!team){reasons.push(`MISSING_TEAM:${line}`);continue;}
  const previous=teams.get(team);
  if(previous&&fingerprint(previous.counts)!==fingerprint(values)){reasons.push(`CONFLICTING_SAME_TEAM_COUNTS:${team}`);continue;}
  if(previous){previous.lines.push(line);continue;}
  teams.set(team,{counts:values,lines:[line]});
  const fielding=sourceFor(r,r.player_id,"fielding"),pitching=sourceFor(r,r.player_id,"pitching");
  for(const ref of [...fielding,...pitching])sources.add(ref);
  for(const code of Object.keys(fieldCounts))if(fielding.length&&(values[code]??-1)>=20)positions.add(code);
  if(pitching.length&&(values.SP??-1)>=10)positions.add("SP");
  if(pitching.length&&(values.RP??-1)>=20)positions.add("RP");
  if((Object.values(values).some(n=>n!=null))&&!fielding.length&&!pitching.length)reasons.push(`UNVERIFIED_SOURCE_REFERENCE:${line}`);
 }
 const fatal=reasons.some(r=>r.startsWith("CONFLICTING_SAME_TEAM")||r.startsWith("INVALID"));
 const possibleCombined=Object.keys(fieldCounts).filter(code=>!positions.has(code)&&[...teams.values()].reduce((sum,t)=>sum+(t.counts[code]??0),0)>=20);
 return {positions:fatal?[]:[...positions].sort(),status:fatal?"QUARANTINED":positions.size?"RECORDED_THRESHOLD_SUPPORTED":"INSUFFICIENT_THRESHOLD_EVIDENCE",sourceReferences:[...sources].sort(),teams:[...teams].map(([teamId,detail])=>({teamId,...detail})),reasons,possibleCombinedRequiresScopeVerification:possibleCombined,fieldingStartsAvailable:false,currentEligibilityPromoted:false};
}
export function classifyNbaPosition(row:Record<string,string>) {
 const positions=parsePositionList(row.verified_eligible_positions??"");
 const status=row.position_match_status;
 return {positions,quality:status==="estimated_minutes"?"ESTIMATED":status==="needs_manual_name_review"?"MANUAL_REVIEW":"UNMATCHED",sourceReference:row.verified_position_source??"",teamId:row.team_id,observedRosterPositions:parsePositionList(row.position??""),currentEligibilityPromoted:false};
}
