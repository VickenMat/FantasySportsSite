import type {DatabaseSync} from 'node:sqlite';
import type {SubscriptionProbe} from './telemetry';
type Window='primary'|'secondary';
type Guard={failures:number;nextAttemptAt:number;reason:string;windows?:{name:Window;resetAt:number|null}[]};
/** Local new-work guard. It cannot control spending outside this application. */
export class UsageGuard {
 constructor(private db:DatabaseSync){}
 state():Guard|null{const row=this.db.prepare("SELECT value FROM cc_settings WHERE key='usage_guard'").get();if(!row)return null;try{return JSON.parse(String(row.value));}catch{return {failures:3,nextAttemptAt:Number.MAX_SAFE_INTEGER,reason:'Invalid persisted guard; owner review required'};}}
 private save(value:Guard){this.db.prepare("INSERT OR REPLACE INTO cc_settings VALUES ('usage_guard',?)").run(JSON.stringify(value));}
 check(rate:SubscriptionProbe|null,controllerReason:unknown,at=Date.now(),reserveStart=false){
  let state=this.state();const names:Window[]=['primary','secondary'];
  const blocked=(state?.windows??[]).filter(w=>!(w.resetAt!==null&&w.resetAt<=at)&&!(rate?.[w.name]?.usedPercent!==null&&rate?.[w.name]?.usedPercent!==undefined&&rate[w.name]!.usedPercent!<100));
  for(const name of names){const observed=rate?.[name];if(observed?.usedPercent===100&&(!observed.resetAt||Date.parse(observed.resetAt)>at)){const reset=observed.resetAt?Date.parse(observed.resetAt):null;const existing=blocked.find(w=>w.name===name);if(existing){if(reset!==null)existing.resetAt=existing.resetAt===null?reset:Math.max(existing.resetAt,reset);}else blocked.push({name,resetAt:reset});}}
  if(blocked.length){state={failures:state?.failures??0,nextAttemptAt:Math.max(...blocked.map(w=>w.resetAt??at+60000)),reason:'Observed subscription window exhausted',windows:blocked};this.save(state);return {allowed:false,...state};}
  if(state?.windows?.length||(state&&rate?.primary?.usedPercent!==null&&rate?.primary?.usedPercent!==undefined&&rate.primary.usedPercent<100)){this.db.prepare("DELETE FROM cc_settings WHERE key='usage_guard'").run();return {allowed:true,reason:'The blocked window reset or was observed available'};}
  if(!state&&controllerReason==='CODEX_USAGE_LIMIT'){state={failures:0,nextAttemptAt:at+60000,reason:'Usage exhausted; reset time unavailable'};this.save(state);}
  if(state){if(at<state.nextAttemptAt||state.failures>=3)return {allowed:false,...state};if(reserveStart){state={failures:state.failures+1,nextAttemptAt:at+Math.min(3600000,60000*2**(state.failures+1)),reason:'Allowance unavailable; bounded owner-requested retry'};this.save(state);}return {allowed:true,...state};}
  return {allowed:true,reason:'No observed exhaustion; subscription allowance may be unavailable'};
 }
}
