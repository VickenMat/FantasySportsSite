import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, lstatSync, readdirSync, realpathSync, openSync, closeSync, readSync, fstatSync, constants } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

type Json = Record<string, unknown>;
type Metric = number | null;
export type Usage = { inputTokens: Metric; cachedInputTokens: Metric; outputTokens: Metric; reasoningTokens: Metric; totalTokens: Metric };
type Run = { runId: string; sessionId: string | null; parentSessionId: string | null; taskId: string | null; role: string | null; state: string; startedAt: string | null; lastObservedAt: string | null; elapsedSeconds: Metric; model: string | null; reasoning: string | null };
export type CollectOptions = { history?: { root: string; enabled: true }; maxFiles?: number; maxBytesPerFile?: number; maxTotalBytes?: number; now?: Date };
const obj = (v: unknown): Json => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const token = (v: unknown): Metric => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const credentialLike=(v:string)=>/(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|Bearer\s+|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]+\.eyJ|(?:password|authorization|api.?key)\s*[:=])/i.test(v);
const text = (v: unknown): string | null => typeof v === 'string' && !credentialLike(v) && /^[a-zA-Z0-9_.:/ -]{1,160}$/.test(v) ? v : null;
const identifier = (v: unknown) => typeof v === 'string' && !credentialLike(v) && /^[a-zA-Z0-9_.:-]{1,160}$/.test(v) ? v : null;
const timestamp = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
export type SessionMetadata={sessionId:string;parentSessionId:string|null;model:string|null;reasoning:string|null;startedAt:string|null;lastObservedAt:string|null};
/** Version-specific rollout metadata only; never returns messages or cwd. */
export function extractSessionMetadata(raw:unknown,currentSessionId:string|null=null):SessionMetadata|null {
 const event=obj(raw),payload=obj(event.payload);if(!['session_meta','turn_context'].includes(String(event.type)))return null;
 const sessionId=event.type==='session_meta'?identifier(payload.id):identifier(payload.thread_id)??identifier(payload.session_id)??currentSessionId;
 if(!sessionId)return null;
 const at=timestamp(event.timestamp)??timestamp(payload.timestamp),spawn=obj(obj(obj(payload.source).subagent).thread_spawn);
 return{sessionId,parentSessionId:identifier(payload.parent_thread_id)??identifier(spawn.parent_thread_id),model:text(payload.model),reasoning:text(payload.effort)??text(payload.reasoning_effort),startedAt:event.type==='session_meta'?at:null,lastObservedAt:at};
}
export function historicalSessionRun(metadata:SessionMetadata):Run {
 return{runId:`history:${metadata.sessionId}`,sessionId:metadata.sessionId,parentSessionId:metadata.parentSessionId,taskId:null,role:null,state:'historical',startedAt:metadata.startedAt,lastObservedAt:metadata.lastObservedAt,elapsedSeconds:null,model:metadata.model,reasoning:metadata.reasoning};
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const empty = (): Usage => ({ inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null });
function usage(raw: unknown): Usage | null {
 const r = obj(raw), inputTokens = token(r.input_tokens ?? r.inputTokens), outputTokens = token(r.output_tokens ?? r.outputTokens);
 const cachedInputTokens = token(r.cached_input_tokens ?? r.cachedInputTokens), reasoningTokens = token(r.reasoning_output_tokens ?? r.reasoning_tokens ?? r.reasoningOutputTokens);
 if (inputTokens === null && outputTokens === null) return null;
 if (cachedInputTokens !== null && inputTokens !== null && cachedInputTokens > inputTokens || reasoningTokens !== null && outputTokens !== null && reasoningTokens > outputTokens) return null;
 return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null };
}
const metricKeys = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningTokens', 'totalTokens'] as const;
function sum(rows: Usage[]): Usage { const result = empty(); for (const key of metricKeys) { const known = rows.map(r => r[key]).filter((v): v is number => v !== null); result[key] = rows.length && known.length===rows.length ? known.reduce((a,b) => a+b, 0) : null; } return result; }
function max(a: Usage, b: Usage): Usage { const r=empty(); for(const key of metricKeys) r[key]=a[key]===null?b[key]:b[key]===null?a[key]:Math.max(a[key]!,b[key]!); r.totalTokens=r.inputTokens!==null&&r.outputTokens!==null?r.inputTokens+r.outputTokens:null;return r; }
type ReadBudget={maximum:number;consumed:number;skipped:Set<string>};
function boundedFile(path: string, limit: number, budget:ReadBudget): string | null {
 let fd:number|undefined;
 try {
  const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink())return null;
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);const st=fstatSync(fd);
  if(!st.isFile()||st.size>limit)return null;
  if(st.size>budget.maximum-budget.consumed){budget.skipped.add(path);return null;}
  // Read only this bounded prefix even if an active log grows after fstat.
  const bytes=Buffer.alloc(st.size);let offset=0;
  while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,null);if(!count)break;offset+=count;budget.consumed+=count;}
  return bytes.subarray(0,offset).toString('utf8');
 }catch{return null;}finally{if(fd!==undefined)closeSync(fd);}
}
function walk(root: string, maxFiles: number, maxDepth=8): string[] { const found:string[]=[];function visit(path:string,depth:number){if(depth>maxDepth||found.length>=maxFiles)return;try{for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(found.length>=maxFiles)break;if(entry.isSymbolicLink())continue;const p=join(path,entry.name);if(entry.isDirectory())visit(p,depth+1);else if(entry.isFile()&&entry.name.endsWith('.jsonl'))found.push(p);}}catch{/* Missing history is unavailable. */}} visit(root,0);return found; }

/** Local telemetry only. No authentication/configuration/database discovery. */
export class TelemetryStore {
 private db: DatabaseSync;
 constructor(dbPath: string) {
  if(dbPath!==':memory:'){mkdirSync(dirname(resolve(dbPath)),{recursive:true,mode:0o700});if(existsSync(dbPath)&&lstatSync(dbPath).isSymbolicLink())throw Error('Telemetry database must not be a symlink.');}
  this.db=new DatabaseSync(dbPath);if(dbPath!==':memory:')chmodSync(dbPath,0o600);
  this.db.exec(`PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,session TEXT NOT NULL,payload TEXT NOT NULL,at TEXT,source TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cumulative(session TEXT PRIMARY KEY,payload TEXT NOT NULL,at TEXT,source TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sources(path TEXT PRIMARY KEY,kind TEXT NOT NULL,collected TEXT NOT NULL,status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS session_metadata(session TEXT PRIMARY KEY,payload TEXT NOT NULL);`);
 }
 close(){this.db.close();}
 private meta(key:string,value:unknown){this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,JSON.stringify(value));}
 private turn(session:string,id:string,u:Usage,at:string|null,source:string){this.db.prepare('INSERT OR IGNORE INTO turns VALUES(?,?,?,?,?)').run(id,session,JSON.stringify(u),at,source);}
 private cumulative(session:string,u:Usage,at:string|null,source:string){const previous=this.db.prepare('SELECT payload FROM cumulative WHERE session=?').get(session);const merged=previous?max(JSON.parse(previous.payload as string),u):u;this.db.prepare('INSERT OR REPLACE INTO cumulative VALUES(?,?,?,?)').run(session,JSON.stringify(merged),at,source);}
 private recordSessionMetadata(metadata:SessionMetadata,kind:'managed'|'history'){
  const row=this.db.prepare('SELECT payload FROM session_metadata WHERE session=?').get(metadata.sessionId),previous=row?JSON.parse(String(row.payload)) as SessionMetadata&{sourceKind:string}:null;
  const newer=!previous?.lastObservedAt||!metadata.lastObservedAt||metadata.lastObservedAt>=previous.lastObservedAt;
  const merged={sessionId:metadata.sessionId,parentSessionId:metadata.parentSessionId??previous?.parentSessionId??null,model:newer?metadata.model??previous?.model??null:previous?.model??metadata.model,reasoning:newer?metadata.reasoning??previous?.reasoning??null:previous?.reasoning??metadata.reasoning,startedAt:previous?.startedAt&&metadata.startedAt?previous.startedAt<metadata.startedAt?previous.startedAt:metadata.startedAt:previous?.startedAt??metadata.startedAt,lastObservedAt:previous?.lastObservedAt&&metadata.lastObservedAt?previous.lastObservedAt>metadata.lastObservedAt?previous.lastObservedAt:metadata.lastObservedAt:previous?.lastObservedAt??metadata.lastObservedAt,sourceKind:previous?.sourceKind==='managed'?'managed':kind};
  this.db.prepare('INSERT OR REPLACE INTO session_metadata VALUES(?,?)').run(metadata.sessionId,JSON.stringify(merged));
 }
 collect(repo:string,options:CollectOptions={}) {
  const now=(options.now??new Date()).toISOString(),root=existsSync(repo)?realpathSync(repo):resolve(repo),limit=Math.min(options.maxBytesPerFile??16*1024*1024,32*1024*1024),maxFiles=Math.min(options.maxFiles??300,1000),warnings:string[]=[];
  const maxTotalBytes=Math.min(options.maxTotalBytes??64*1024*1024,64*1024*1024),budget:ReadBudget={maximum:maxTotalBytes,consumed:0,skipped:new Set()};
  if(!Number.isInteger(limit)||!Number.isInteger(maxFiles)||!Number.isInteger(maxTotalBytes)||limit<1||maxFiles<1||maxTotalBytes<1)throw Error('Positive telemetry import bounds required.');
  const source=(path:string,kind:string,status:string)=>this.db.prepare('INSERT OR REPLACE INTO sources VALUES(?,?,?,?)').run(path,kind,now,status);
  const automationRoot=join(root,'.automation');if(existsSync(automationRoot)&&(lstatSync(automationRoot).isSymbolicLink()||realpathSync(automationRoot)!==automationRoot))throw Error('Automation telemetry root must not be a symlink.');
  const runRoot=join(automationRoot,'runs');if(existsSync(runRoot)&&lstatSync(runRoot).isSymbolicLink())throw Error('Run telemetry root must not be a symlink.');let dirs:string[]=[];try{dirs=readdirSync(runRoot,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()).map(e=>e.name).sort().slice(0,maxFiles);}catch{}
  const stateRaw=boundedFile(join(root,'.automation','state.json'),limit,budget);let tasks:Json={};try{tasks=obj(obj(JSON.parse(stateRaw??'{}')).tasks);}catch{warnings.push('STATE_JSON_INVALID');}
  const roleByTask=new Map<string,string>();try{const queue=obj(JSON.parse(boundedFile(join(root,'docs/automation/TASK_QUEUE.json'),limit,budget)??'{}'));for(const raw of Array.isArray(queue.tasks)?queue.tasks:[]){const task=obj(raw),id=identifier(task.id),role=identifier(task.assigned_role);if(id&&role)roleByTask.set(id,role);}}catch{warnings.push('TASK_QUEUE_METADATA_UNAVAILABLE');}
  const metadata=new Map<string,Json>();for(const [taskId,value] of Object.entries(tasks)){const task=obj(value);for(const row of Array.isArray(task.execution_history)?task.execution_history:[]){const h=obj(row);if(identifier(h.run_id))metadata.set(h.run_id as string,{...h,taskId,assigned_role:roleByTask.get(taskId),status:h.status??'unknown'});}if(identifier(task.run_id))metadata.set(task.run_id as string,{...metadata.get(task.run_id as string),...task,taskId,assigned_role:roleByTask.get(taskId)});}
  const readEvents=(path:string,kind:'managed'|'history',run?:Run)=>{
   const body=boundedFile(path,limit,budget);if(body===null){source(path,kind,budget.skipped.has(path)?'SKIPPED_TOTAL_BYTE_BUDGET':'SKIPPED_BOUND_OR_UNSAFE_FILE');return;}
   let session=run?.sessionId??null,turnId:string|null=null,at:string|null=null;const occurrences=new Map<string,number>();
   for(const line of body.split('\n')){if(!line.trim())continue;let event:Json;try{event=obj(JSON.parse(line));}catch{warnings.push('INVALID_OR_PARTIAL_JSONL_LINE');continue;}
    at=timestamp(event.timestamp)??at;const payload=obj(event.payload),params=obj(event.params);
    if(event.type==='thread.started')session=identifier(event.thread_id)??session;
    const sessionMetadata=extractSessionMetadata(event,session);if(sessionMetadata){session=sessionMetadata.sessionId;this.recordSessionMetadata(sessionMetadata,kind);if(run){run.parentSessionId=sessionMetadata.parentSessionId??run.parentSessionId;run.model=sessionMetadata.model??run.model;run.reasoning=sessionMetadata.reasoning??run.reasoning;}}
    if(event.type==='turn.started'){turnId=identifier(event.turn_id)??identifier(obj(event.turn).id);}
    if(event.type==='turn_context'){turnId=identifier(payload.turn_id)??turnId;}
    if(event.method==='account/rateLimits/updated')this.rateLimits(params.rateLimits,now);
    if(!session)continue;
    if(event.type==='turn.completed'){
     const u=usage(event.usage);if(u){const signature=hash(u),ordinal=(occurrences.get(signature)??0)+1;occurrences.set(signature,ordinal);this.turn(session,`${session}:${identifier(event.turn_id)??turnId??`unidentified:${signature}:${ordinal}`}`,u,at,path);if(!identifier(event.turn_id)&&!turnId)warnings.push('CLI_TURNS_WITHOUT_GLOBAL_ID_IDENTICAL_RESUMED_TURNS_MAY_BE_UNDERCOUNTED');}
     if(run&&run.state==='unknown')run.state='completed';
    }
    if(event.type==='event_msg'&&payload.type==='token_count'){
     const info=obj(payload.info),total=usage(info.total_token_usage);if(total)this.cumulative(session,total,at,path);
     // Local rollout format is implementation-version-specific. Never add
     // last_token_usage to cumulative totals, nor persist message payloads.
    }
    if(event.method==='thread/tokenUsage/updated'){
     const exposed=obj(params.tokenUsage);session=identifier(params.threadId)??session;const total=usage(exposed.total);if(total)this.cumulative(session,total,at,path);
    }
    if(event.type==='turn.failed'||event.type==='error'){if(run&&run.state==='unknown')run.state='failed';const e=obj(event.error);if(['rate_limit_exceeded','usage_limit_reached','insufficient_quota'].includes(String(e.code)))this.meta('rateLimit',{state:'exhausted',resetAt:null,collectedAt:now,source:'structured_execution_error'});}
   }
   if(run){run.sessionId=session;run.lastObservedAt=at??run.lastObservedAt;this.db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?)').run(run.runId,JSON.stringify(run));}
   source(path,kind,'IMPORTED_ALLOWLIST_ONLY');
  };
  for(const id of dirs){const m=metadata.get(id)??{},run:Run={runId:id,sessionId:identifier(m.session_id),parentSessionId:null,taskId:identifier(m.taskId),role:identifier(m.assigned_role)??null,state:identifier(m.status)??'unknown',startedAt:timestamp(m.last_execution_time),lastObservedAt:null,elapsedSeconds:typeof m.elapsed_seconds==='number'&&m.elapsed_seconds>=0?m.elapsed_seconds:null,model:null,reasoning:null};readEvents(join(runRoot,id,'events.jsonl'),'managed',run);}
  // State receipts supply usage only when no execution turn is recorded for
  // that session. They are corroboration, never an additive collector.
  for(const [id,m] of metadata){const session=identifier(m.session_id),u=usage(m.usage);if(session&&u){const recorded=this.db.prepare('SELECT 1 FROM turns WHERE session=? LIMIT 1').get(session);if(!recorded)this.cumulative(session,u,timestamp(m.last_execution_time),'automation_state_receipt');if(!dirs.includes(id)){const run:Run={runId:id,sessionId:session,parentSessionId:null,taskId:identifier(m.taskId),role:identifier(m.assigned_role),state:identifier(m.status)??'unknown',startedAt:timestamp(m.last_execution_time),lastObservedAt:null,elapsedSeconds:typeof m.elapsed_seconds==='number'?m.elapsed_seconds:null,model:null,reasoning:null};this.db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?)').run(id,JSON.stringify(run));}}}
  let historicalEnabled=false;
  if(options.history?.enabled){const expected=join(homedir(),'.codex','sessions'),candidate=resolve(options.history.root);if(candidate!==expected||!existsSync(expected)||realpathSync(expected)!==expected)throw Error('Historical import requires the exact nonsymlink ~/.codex/sessions allowlist.');historicalEnabled=true;for(const path of walk(expected,maxFiles)){if(relative(expected,path).startsWith('..'))throw Error('History escaped allowlist.');readEvents(path,'history');}warnings.push('ROLLOUT_SCHEMA_VERSION_SPECIFIC_NOT_A_STABLE_PUBLIC_API');}
  if(budget.skipped.size)warnings.push('COLLECTION_TOTAL_BYTE_BUDGET_EXHAUSTED');
  this.meta('coverage',{collectedAt:now,historyEnabled:historicalEnabled,maxFiles,maxBytesPerFile:limit,maxTotalBytes,bytesRead:budget.consumed,filesSkippedForTotalByteBudget:budget.skipped.size,warnings:[...new Set(warnings)],metricsUnavailable:['subscriptionRemaining','subscriptionAllowance','currentContextUtilization','unobservedSessions','exactDailyAllocationOfHistoricalCumulativeTokens']});
  return this.snapshot(options.now);
 }
 private rateLimits(raw:unknown,now:string){const r=obj(raw),window=(v:unknown)=>{const w=obj(v);return{usedPercent:typeof w.usedPercent==='number'&&w.usedPercent>=0&&w.usedPercent<=100?w.usedPercent:null,windowMinutes:token(w.windowDurationMins),resetAt:typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&Math.abs(w.resetsAt)<8e12?new Date(w.resetsAt*1000).toISOString():null};};this.meta('rateLimit',{state:'observed',primary:window(r.primary),secondary:window(r.secondary),collectedAt:now,source:'app_server_account_rateLimits_updated'});}
 snapshot(now=new Date()){
  const rows=this.db.prepare('SELECT * FROM turns').all(),sessions=new Map<string,Usage>(),sessionAt=new Map<string,string|null>();for(const row of rows){const s=String(row.session);sessions.set(s,sessions.has(s)?sum([sessions.get(s)!,JSON.parse(String(row.payload))]):JSON.parse(String(row.payload)));sessionAt.set(s,row.at as string|null);}
  for(const row of this.db.prepare('SELECT * FROM cumulative').all()){const s=String(row.session);sessions.set(s,max(sessions.get(s)??empty(),JSON.parse(String(row.payload))));if(!sessionAt.has(s))sessionAt.set(s,null);}
  const bySession=[...sessions].map(([sessionId,u])=>({sessionId,...u,provenance:'DEDUPLICATED_OBSERVED_TURNS_OR_CUMULATIVE_SESSION_MAXIMUM'})),runs=this.db.prepare('SELECT payload FROM runs ORDER BY id').all().map(row=>JSON.parse(String(row.payload)) as Run);
  const sessionMetadata=this.db.prepare('SELECT payload FROM session_metadata').all().map(row=>JSON.parse(String(row.payload)) as SessionMetadata&{sourceKind:string});
  for(const metadata of sessionMetadata){const matching=runs.filter(run=>run.sessionId===metadata.sessionId);if(matching.length){for(const run of matching){run.parentSessionId=run.parentSessionId??metadata.parentSessionId;run.model=run.model??metadata.model;run.reasoning=run.reasoning??metadata.reasoning;run.startedAt=run.startedAt??metadata.startedAt;run.lastObservedAt=run.lastObservedAt??metadata.lastObservedAt;}}else if(metadata.sourceKind==='history')runs.push(historicalSessionRun(metadata));}
  const groups=(key:'taskId'|'role')=>{const grouped=new Map<string,Set<string>>();for(const run of runs)if(run[key]&&run.sessionId){const set=grouped.get(run[key]!)??new Set();set.add(run.sessionId);grouped.set(run[key]!,set);}return[...grouped].map(([id,ids])=>{const shared=[...ids].some(session=>runs.some(run=>run.sessionId===session&&run[key]!==id));return{id,...(shared?empty():sum([...ids].map(s=>sessions.get(s)??empty()))),coverage:shared?'SHARED_SESSION_ATTRIBUTION_UNAVAILABLE':'OBSERVED_SESSION_ASSOCIATION'};});};
  const buckets=(days:number)=>{const selected=rows.filter(row=>typeof row.at==='string'&&Date.parse(row.at)>=+now-days*86400000&&Date.parse(row.at)<=+now);return{...sum(selected.map(row=>JSON.parse(String(row.payload)))),coverage:'TIMESTAMPED_PER_TURN_ONLY'};};
  const coverageRow=this.db.prepare('SELECT payload FROM meta WHERE key=?').get('coverage'),rate=this.db.prepare('SELECT payload FROM meta WHERE key=?').get('rateLimit');
  return{usage:{...sum([...sessions.values()]),byTurn:rows.slice(-200).map(row=>({id:String(row.id),sessionId:String(row.session),at:row.at??null,...JSON.parse(String(row.payload)),provenance:'OBSERVED_STRUCTURED_TURN'})),turnRowsLimit:200,sessions:sessions.size,turns:rows.length,bySession,byTask:groups('taskId'),byAgent:bySession.map(row=>({id:row.sessionId,...row})),byRole:groups('role'),daily:buckets(1),weekly:buckets(7),subscriptionRemaining:null,currentContextUtilization:null,rateLimits:rate?JSON.parse(String(rate.payload)):null},runs:runs.map(run=>({...run,usage:run.sessionId?sessions.get(run.sessionId)??empty():empty(),active:run.state==='running'&&run.lastObservedAt!==null&&+now-Date.parse(run.lastObservedAt)<60000?null:false})),coverage:{...(coverageRow?JSON.parse(String(coverageRow.payload)):{}),sources:this.db.prepare('SELECT kind,status,COUNT(*) AS files FROM sources GROUP BY kind,status').all(),configuredRolesAreExecutions:false,processLivenessVerified:false}};
 }
}

export type SubscriptionWindow={usedPercent:number|null;windowMinutes:number|null;resetAt:string|null};
export type SubscriptionProbe={available:boolean;authenticationMethod:'chatgpt'|'apiKey'|'other'|null;primary:SubscriptionWindow|null;secondary:SubscriptionWindow|null;collectedAt:string;provenance:'codex_app_server_account_read_and_rateLimits_read';reason:string|null;subscriptionRemaining:null};
export function normalizeSubscriptionProbe(accountResult:unknown,rateResult:unknown,at=new Date()):SubscriptionProbe {
 const account=obj(obj(accountResult).account),method=account.type==='chatgpt'?'chatgpt':account.type==='apiKey'?'apiKey':account.type?'other':null;
 const base:SubscriptionProbe={available:false,authenticationMethod:method,primary:null,secondary:null,collectedAt:at.toISOString(),provenance:'codex_app_server_account_read_and_rateLimits_read',reason:null,subscriptionRemaining:null};
 if(method!=='chatgpt')return{...base,reason:'CHATGPT_SUBSCRIPTION_AUTHENTICATION_REQUIRED'};
 const window=(raw:unknown):SubscriptionWindow|null=>{if(raw===null||typeof raw!=='object')return null;const w=obj(raw),reset=typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&Math.abs(w.resetsAt)<8e12?w.resetsAt*1000:null;return{usedPercent:typeof w.usedPercent==='number'&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100?w.usedPercent:null,windowMinutes:token(w.windowDurationMins),resetAt:reset!==null?new Date(reset).toISOString():null};};
 const rate=obj(obj(rateResult).rateLimits);base.primary=window(rate.primary);base.secondary=window(rate.secondary);base.available=[base.primary,base.secondary].some(w=>w!==null&&(w.usedPercent!==null||w.windowMinutes!==null||w.resetAt!==null));base.reason=base.available?null:'SUBSCRIPTION_WINDOWS_UNAVAILABLE';return base;
}
/** Only documented metadata RPCs; never starts a model thread/turn or login. */
export async function probeSubscription(codexPath='/opt/homebrew/bin/codex',timeoutMs=8000):Promise<SubscriptionProbe>{
 const {spawn}=await import('node:child_process');const at=new Date();
 const unavailable=(reason:string)=>({...normalizeSubscriptionProbe(null,null,at),reason});
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)return unavailable('INVALID_PROBE_DEADLINE');
 return new Promise(resolveProbe=>{
  const env:NodeJS.ProcessEnv={};for(const name of ['HOME','PATH','CODEX_HOME','TMPDIR','LANG','SSL_CERT_FILE','SSL_CERT_DIR'])if(process.env[name])env[name]=process.env[name];
  const child=spawn(codexPath,['app-server','--stdio','-c','features.apps=false','-c','features.plugins=false','-c','features.shell_tool=false','-c','web_search="disabled"'],{env,stdio:['pipe','pipe','ignore']});
  let complete=false,buffer='',bytes=0,account:unknown=null;
  const finish=(result:SubscriptionProbe)=>{if(complete)return;complete=true;clearTimeout(timer);child.stdin.end();child.kill('SIGTERM');const kill=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},200);kill.unref();resolveProbe(result);};
  const timer=setTimeout(()=>finish(unavailable('PROBE_TIMEOUT')),timeoutMs);
  const send=(payload:unknown)=>{if(!complete&&!child.stdin.destroyed)child.stdin.write(JSON.stringify(payload)+'\n');};
  child.on('error',()=>finish(unavailable('CODEX_APP_SERVER_UNAVAILABLE')));child.stdin.on('error',()=>finish(unavailable('CODEX_APP_SERVER_TRANSPORT_FAILED')));
  child.on('exit',()=>{if(!complete)finish(unavailable('CODEX_APP_SERVER_EXITED'));});
  child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024){finish(unavailable('PROBE_RESPONSE_BOUND_EXCEEDED'));return;}buffer+=chunk.toString('utf8');let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let response:Json;try{response=obj(JSON.parse(line));}catch{continue;}
   if(response.id===1){if(response.error){finish(unavailable('INITIALIZATION_UNSUPPORTED'));return;}send({method:'initialized',params:{}});send({method:'account/read',id:2,params:{refreshToken:false}});}
   if(response.id===2){if(response.error){finish(unavailable('AUTHENTICATION_METADATA_UNAVAILABLE'));return;}account=response.result;const normalized=normalizeSubscriptionProbe(account,null,at);if(normalized.authenticationMethod!=='chatgpt'){finish(normalized);return;}send({method:'account/rateLimits/read',id:3});}
   if(response.id===3){if(response.error){finish({...normalizeSubscriptionProbe(account,null,at),reason:'RATE_LIMIT_INTERFACE_UNAVAILABLE'});return;}finish(normalizeSubscriptionProbe(account,response.result,at));}
  }});
  send({method:'initialize',id:1,params:{clientInfo:{name:'fantasy_evolution_control_center',version:'1.0.0'},capabilities:{experimentalApi:false}}});
 });
}
