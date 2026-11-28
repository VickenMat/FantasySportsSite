/** Loopback owner interface. No professional database client or generic shell endpoint. */
import http,{type IncomingMessage,type ServerResponse} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync,existsSync,readFileSync,writeFileSync,lstatSync,statSync,openSync,closeSync,renameSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TelemetryStore,probeSubscription,type SubscriptionProbe} from './telemetry';
import {importActivity} from './observations';
import {UsageGuard} from './policy';
import {publicAutomation,publicApproval,validateControl} from './security';
import {Infrastructure,gitState,configuredRoles,safeText,safeEnvironment} from './infrastructure';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
function atomicRecord(path:string,value:unknown){const temp=path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});renameSync(temp,path);}
class PublicError extends Error {}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export type CenterOptions={repo?:string;port?:number;python?:string;testPassword?:string;testMode?:boolean;testSubscriptionProbe?:()=>Promise<SubscriptionProbe|null>};
function privateDirectory(path:string){if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw new PublicError('Private runtime cannot be a symlink.');mkdirSync(path,{recursive:true,mode:0o700});chmodSync(path,0o700);}
function loadJson(path:string,fallback:unknown){try{if(lstatSync(path).isSymbolicLink()||statSync(path).size>2*1024*1024)return fallback;return JSON.parse(readFileSync(path,'utf8'));}catch{return fallback;}}
function executionLocation(repo:string,runId:string){
 if(!/^[a-f0-9]{32}$/.test(runId))return {worktree:null,lastActivity:null};
 const metadata=loadJson(join(repo,'.automation/snapshots',runId+'.json'),null) as {path?:unknown}|null;
 const worktree=typeof metadata?.path==='string'&&metadata.path.includes('fantasy-automation-'+runId.slice(0,8)+'-')?safeText(metadata.path,500):null;
 let lastActivity:string|null=null;try{const path=join(repo,'.automation/runs',runId,'events.jsonl'),stat=lstatSync(path);if(stat.isFile()&&!stat.isSymbolicLink())lastActivity=stat.mtime.toISOString();}catch{}
 return {worktree,lastActivity};
}
function object(value:unknown):Record<string,unknown>{if(!value||Array.isArray(value)||typeof value!=='object')throw new PublicError('Expected a JSON object.');return value as Record<string,unknown>;}
export function createCenter(options:CenterOptions={}){
 process.umask(0o077);const repo=resolve(options.repo??root),port=options.port??3100,python=options.python??'/usr/local/bin/python3';
 if(!Number.isInteger(port)||port<1024||port>65535)throw new PublicError('Use an unprivileged loopback port.');
 if((options.testPassword||options.testSubscriptionProbe)&&!options.testMode)throw new PublicError('Test credentials require an isolated test instance.');
 privateDirectory(join(repo,'.automation'));const runtime=join(repo,'.automation/control-center');privateDirectory(runtime);
 const databasePath=join(runtime,'control.sqlite');if(existsSync(databasePath)&&lstatSync(databasePath).isSymbolicLink())throw new PublicError('Unsafe telemetry path.');
 const db=new DatabaseSync(databasePath);chmodSync(databasePath,0o600);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS cc_sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS cc_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, severity TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}'); CREATE TABLE IF NOT EXISTS cc_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
 const authPath=join(runtime,'owner-auth.json'),passwordPath=join(runtime,'owner-password.txt');
 let auth=loadJson(authPath,null) as {salt:string;hash:string}|null;
 if(!auth){const password=options.testPassword??randomBytes(24).toString('base64url');const salt=randomBytes(32).toString('hex');auth={salt,hash:scryptSync(password,salt,64).toString('hex')};writeFileSync(authPath,JSON.stringify(auth),{mode:0o600,flag:'wx'});writeFileSync(passwordPath,password+'\n',{mode:0o600,flag:'wx'});}
 if(!(db.prepare('PRAGMA table_info(cc_audit)').all() as {name:string}[]).some(c=>c.name==='metadata'))db.exec("ALTER TABLE cc_audit ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
 const telemetry=new TelemetryStore(join(runtime,'telemetry.sqlite')),infra=new Infrastructure();let collecting:Promise<unknown>|null=null;let lastCollect=0;let starting=false;let launcher:ReturnType<typeof spawn>|null=null;let statusCache:{at:number;value:Record<string,unknown>}|null=null;
 let closed=false;
 const audit=(kind:string,summary:string,severity='info',metadata:Record<string,unknown>={})=>!closed&&db.prepare('INSERT INTO cc_audit (id,at,kind,summary,severity,metadata) VALUES (?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),safeText(kind,80),safeText(summary,300),severity,JSON.stringify(metadata));
 const usageGuard=new UsageGuard(db);
 let subscription:SubscriptionProbe|null=null;let subscriptionAt=0;
 async function allowance(force=false){if(options.testMode)return options.testSubscriptionProbe?options.testSubscriptionProbe():null;if(!options.testMode&&(force||Date.now()-subscriptionAt>60000)){subscriptionAt=Date.now();subscription=await probeSubscription();}return subscription;}
 // stdin is a pipe; task/user content is never interpolated into shell text.
 async function ownerControl(payload:Record<string,unknown>):Promise<Record<string,unknown>>{
  return new Promise((resolvePromise,reject)=>{const child=spawn(python,[join(root,'control-center/bridge.py'),repo],{env:safeEnvironment(),stdio:['pipe','pipe','pipe']});let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(Error('Control operation timed out.'));},7000);child.stdout.on('data',data=>{size+=data.length;if(size>1024*1024){child.kill();return;}output+=String(data);});child.stderr.on('data',()=>{});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);try{const parsed=object(JSON.parse(output));if(code!==0)reject(Object.assign(new PublicError(safeText(parsed.error)),{busy:parsed.kind==='busy'}));else resolvePromise(parsed);}catch(e){reject(e);}});child.stdin.on('error',()=>{clearTimeout(timer);reject(Error('Control transport unavailable.'));});child.stdin.end(JSON.stringify(payload));});
 }
 async function automation(){if(statusCache&&Date.now()-statusCache.at<1500)return statusCache.value;const value:Record<string,unknown>=await ownerControl({action:'status'}).catch(()=>({mode:'offline',reason:'Controller state unavailable; new AI work refused',tasks:[],active_run:{},recovery_required:true}));statusCache={at:Date.now(),value};return value;}
 async function collect(){if(collecting)return collecting;if(Date.now()-lastCollect<5000)return;collecting=Promise.resolve().then(()=>telemetry.collect(repo)).finally(()=>{lastCollect=Date.now();collecting=null;});return collecting;}
 function session(req:IncomingMessage){const cookies=String(req.headers.cookie??'').split(';').map(c=>c.trim().split('='));const raw=cookies.find(c=>c[0]==='cc_session')?.[1];if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;return db.prepare('SELECT csrf,expires FROM cc_sessions WHERE hash=? AND expires>?').get(digest(raw),Date.now()) as {csrf:string;expires:number}|undefined;}
 function send(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
 async function body(req:IncomingMessage){let bytes=0,value='';for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>16384)throw new PublicError('Request exceeds 16KiB.');value+=String(chunk);}try{return object(JSON.parse(value));}catch{throw new PublicError('Invalid JSON request body.');}}
 let loginFailures:{at:number;count:number}={at:0,count:0};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const host=String(req.headers.host??'');if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(host)){send(res,403,{error:'Invalid local host.'});return;}
  let url:URL;try{url=new URL(req.url??'/',`http://${host}`);}catch{send(res,400,{error:'Invalid request target.'});return;}const mutating=req.method!=='GET'&&req.method!=='HEAD';
  if(mutating&&(req.method!=='POST'||req.headers.origin!==`http://${host}`||!String(req.headers['content-type']??'').startsWith('application/json')||req.headers['sec-fetch-site']==='cross-site')){send(res,403,{error:'Same-origin JSON control requests are required.'});return;}
  try{
   if(url.pathname==='/api/health'&&req.method==='GET'){send(res,200,{ok:true,service:'Agent Control Center'});return;}
   if(url.pathname==='/api/login'&&req.method==='POST'){
    if(Date.now()-loginFailures.at>60000)loginFailures={at:Date.now(),count:0};if(loginFailures.count>=8){send(res,429,{error:'Login attempts limited. Try again in one minute.'});return;}
    const data=await body(req);if(typeof data.password!=='string'||data.password.length>512||!equal(scryptSync(data.password,auth!.salt,64).toString('hex'),auth!.hash)){loginFailures.count++;audit('login_refused','Owner authentication failed','warning');send(res,401,{error:'Invalid owner password.'});return;}
    const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');db.prepare('INSERT INTO cc_sessions VALUES (?,?,?)').run(digest(token),csrf,Date.now()+8*3600000);res.setHeader('Set-Cookie',`cc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);audit('owner_login','Owner authenticated locally');send(res,200,{ok:true,csrfToken:csrf});return;
   }
   const owner=session(req);if(url.pathname.startsWith('/api/')&&!owner){send(res,401,{error:'Owner authentication required.'});return;}
   if(mutating&&(!owner||!equal(String(req.headers['x-csrf-token']??''),owner.csrf))){send(res,403,{error:'CSRF validation failed.'});return;}
   if(url.pathname==='/api/session'&&req.method==='GET'){send(res,200,{authenticated:true,csrfToken:owner!.csrf});return;}
   if(url.pathname==='/api/logout'&&req.method==='POST'){const raw=String(req.headers.cookie??'').match(/cc_session=([A-Za-z0-9_-]+)/)?.[1];if(raw)db.prepare('DELETE FROM cc_sessions WHERE hash=?').run(digest(raw));res.setHeader('Set-Cookie','cc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');send(res,200,{ok:true});return;}
   if(url.pathname==='/api/state'&&req.method==='GET'){
    await collect();importActivity(repo,db);const [state,hardware,git,rateLimits]=await Promise.all([automation(),options.testMode?Promise.resolve({sampledAt:new Date().toISOString(),state:'test_fixture_no_host_probe'}):infra.sample(repo),gitState(repo),allowance()]);const measured=telemetry.snapshot();const active=object(state.active_run??{});const taskRows=Array.isArray(state.tasks)?state.tasks.map(object):[];const agents:Record<string,unknown>[]=measured.runs.map(run=>({...run,managed:!run.runId.startsWith('history:'),active:state.process_observation_available?state.active_run_observed_alive===true&&run.runId===active.run_id:null,state:taskRows.find(t=>t.id===run.taskId)?.blocker_classification==='USAGE_LIMIT_REQUIRES_OWNER_RESUME'?'rate_limited':run.state==='running'&&!(state.active_run_observed_alive===true&&run.runId===active.run_id)?(state.process_observation_available?'interrupted':'unavailable'):run.state,...{commit:safeText(taskRows.find(t=>t.id===run.taskId)?.associated_commit),milestone:safeText(taskRows.find(t=>t.id===run.taskId)?.milestone),intervention:safeText(taskRows.find(t=>t.id===run.taskId)?.blocker_classification),retries:typeof taskRows.find(t=>t.id===run.taskId)?.attempt_count==='number'?Math.max(0,Number(taskRows.find(t=>t.id===run.taskId)?.attempt_count)-1):null,worktree:executionLocation(repo,run.runId).worktree,lastObservedAt:run.lastObservedAt??executionLocation(repo,run.runId).lastActivity,branch:null}}));if(active.run_id&&!agents.some(a=>a.runId===active.run_id))agents.push({runId:String(active.run_id),sessionId:null,parentSessionId:null,taskId:typeof active.task_id==='string'?active.task_id:null,role:null,state:state.active_run_observed_alive?'running':state.process_observation_available?'interrupted':'unavailable',startedAt:typeof active.started_at==='string'?active.started_at:null,lastObservedAt:new Date().toISOString(),elapsedSeconds:null,model:null,reasoning:null,usage:{inputTokens:null,cachedInputTokens:null,outputTokens:null,reasoningTokens:null,totalTokens:null},managed:true,active:state.process_observation_available?state.active_run_observed_alive===true:null,commit:null,retries:null,milestone:null,intervention:null,worktree:null,branch:null});const proposals=await ownerControl({action:'proposal'});const approvals=loadJson(join(repo,'docs/automation/APPROVAL_QUEUE.json'),{approvals:[]}) as {approvals:Record<string,unknown>[]};observe(state,approvals.approvals);
    send(res,200,{generatedAt:new Date().toISOString(),automation:publicAutomation(state),roles:configuredRoles(repo),agents,usage:{...measured.usage,rateLimits},coverage:{...measured.coverage,processLivenessVerified:state.process_observation_available===true,processScope:'managed_controller_receipts_only'},approvals:approvals.approvals.map(a=>({...publicApproval(a),stale:proposals.stale===true||a.target_fingerprint!==proposals.targetFingerprint||a.task_fingerprint!==proposals.taskFingerprint})),activity:db.prepare('SELECT * FROM cc_audit ORDER BY at DESC LIMIT 100').all(),git,infrastructure:hardware,settings:{additionalSpendingUsd:0,authentication:'ChatGPT subscription only',apiBillingFallback:false,maxDailyAttempts:6,maxAttempts:3,executionTimeoutSeconds:180,host:'127.0.0.1',port,allowanceScope:'Local policy only; no account-wide spending guarantee',usageGuard:usageGuard.state()},capabilities:{writableExecution:false,schedulerActivation:false,controls:['start','pause','resume','cancel','stop','prioritize','guidance','concurrency','approve','reject']}});return;
   }
   if(url.pathname==='/api/control'&&req.method==='POST'){
    const data=await body(req);let action:string;try{action=validateControl(data);}catch{throw new PublicError('Invalid control action, fields or credential-shaped guidance.');}
    if(action==='resume'){const rate=await allowance(true),current=await automation();if(current.mode==='offline')throw new PublicError('Repair controller state before resuming.');const guard=usageGuard.check(rate,current.reason);if(!guard.allowed){await ownerControl({action:'pause'});audit('usage_exhausted','Observed exhaustion or persisted usage backoff prevents new AI work','critical',{reason:guard.reason});send(res,429,{error:guard.reason,nextAttemptAt:'nextAttemptAt' in guard?guard.nextAttemptAt:null});return;}}
    if(action==='start'){
     if(data.confirmed!==true){send(res,400,{error:'Confirm one bounded read-only execution.'});return;}
     const current=await automation();if(starting||(launcher?.pid&&launcher.exitCode===null)||current.orchestrator_observed_alive||current.active_run_observed_alive||current.controller_lease_busy){send(res,409,{error:'An observed orchestrator or execution is already active.'});return;}
     if(['paused','emergency_stop','approval_required','offline'].includes(String(current.mode))){send(res,409,{error:'Resolve the persisted control state before starting.'});return;}
     starting=true;let guard:ReturnType<UsageGuard['check']>;try{const rate=await allowance(true);guard=usageGuard.check(rate,current.reason,Date.now(),true);}catch(error){starting=false;throw error;}if(!guard.allowed){starting=false;await ownerControl({action:'pause'});audit('usage_exhausted','New AI work refused by the persisted usage guard','critical',{reason:guard.reason});send(res,429,{error:guard.reason});return;}
     starting=true;const folder=join(runtime,'controller-runs');privateDirectory(folder);const runId=randomUUID();const output=openSync(join(folder,runId+'.stdout.json'), 'wx',0o600),errors=openSync(join(folder,runId+'.stderr.log'),'wx',0o600);
     try{const child=spawn(python,[join(repo,'scripts/automation/orchestrator.py'),'cycle','--execute-read-only','--max-tasks','1','--timeout-seconds','180'],{cwd:repo,env:safeEnvironment(),detached:true,stdio:['ignore',output,errors]});
      launcher=child;child.once('error',()=>{starting=false;audit('orchestrator_failed','Unable to start the bounded controller','critical');});
      child.once('exit',code=>{starting=false;statusCache=null;audit('orchestrator_finished',`Bounded controller exited (${code??'signal'}); inspect task status`,code?'warning':'info');});
      if(!child.pid)throw new PublicError('The bounded controller could not start.');
      const identity=await ownerControl({action:'identity',pid:child.pid});atomicRecord(join(runtime,'controller.json'),{runId,identity:identity.identity,startedAt:new Date().toISOString()});child.unref();audit('orchestrator_started','Owner started one bounded read-only cycle');statusCache=null;send(res,202,{ok:true,runId,profile:'read_only_snapshot'});
     }finally{closeSync(output);closeSync(errors);starting=false;}return;
    }
    if(action==='importHistory'){if(data.confirmed!==true)throw new PublicError('Confirm bounded local history import.');await telemetry.collect(repo,{history:{root:join(process.env.HOME??'', '.codex/sessions'),enabled:true}});audit('history_import','Owner requested a bounded read-only structured history import');send(res,200,{ok:true});return;}
    const result=await ownerControl(data);statusCache=null;audit(action,`Owner ${action} control applied${typeof data.taskId==='string'?` to ${safeText(data.taskId,80)}`:''}`,action==='stop'?'critical':action==='approve'||action==='reject'?'decision':'info',{actor:'authenticated_owner',...(typeof data.approvalId==='string'?{approvalId:data.approvalId,targetFingerprint:data.targetFingerprint,taskFingerprint:data.taskFingerprint,expiresAt:data.expiresAt??null,decision:action}:{}),...(typeof data.guidance==='string'?{guidanceSha256:digest(data.guidance),guidanceCharacters:data.guidance.length}:{})});send(res,200,result);return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){send(res,405,{error:'Method unavailable.'});return;}
   if(url.pathname.startsWith('/api/')){send(res,404,{error:'Endpoint unavailable.'});return;}
   const file=url.pathname==='/assets/app.js'?'app.js':url.pathname==='/assets/app.css'?'app.css':url.pathname==='/'?'index.html':null;
   if(!file){send(res,404,{error:'Page unavailable.'});return;}const path=join(runtime,'web',file);if(!existsSync(path)){send(res,503,{error:'Build the Control Center frontend first.'});return;}
   res.writeHead(200,{'Content-Type':extname(file)==='.js'?'application/javascript; charset=utf-8':extname(file)==='.css'?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(readFileSync(path));
  }catch(error){audit('request_refused','A control request was refused or unavailable','warning');const busy=!!(error&&typeof error==='object'&&'busy'in error&&error.busy);send(res,busy?409:400,{error:error instanceof PublicError?safeText(error.message,240):'Operation refused or unavailable.'});}
 });
 server.requestTimeout=10000;server.headersTimeout=5000;
 function observe(state:Record<string,unknown>,approvals:Record<string,unknown>[]){
  for(const task of (Array.isArray(state.tasks)?state.tasks:[]).map(object)){
   const id=safeText(task.id,80),status=safeText(task.status,80),key='task_status:'+id;const before=db.prepare('SELECT value FROM cc_settings WHERE key=?').get(key);
   if(String(before?.value??'')!==status){db.prepare('INSERT OR REPLACE INTO cc_settings VALUES (?,?)').run(key,status);if(['failed','blocked','approval_required','interrupted'].includes(status))audit('task_state',`Observed ${id}: ${status}`,'warning',{taskId:id,status,provenance:'controller_state_observation'});}
  }
  for(const a of approvals){const id=safeText(a.id,80),key='approval_status:'+id,value=String(a.status)+':'+String(a.target_fingerprint);const before=db.prepare('SELECT value FROM cc_settings WHERE key=?').get(key);if(before?.value!==value){db.prepare('INSERT OR REPLACE INTO cc_settings VALUES (?,?)').run(key,value);if(a.status==='pending')audit('approval_required',`Observed pending owner decision: ${id}`,'decision',{approvalId:id,provenance:'approval_queue_observation'});}}
 }
 const close=()=>new Promise<void>((resolveClose,reject)=>{server.close(error=>{if(error)reject(error);else{closed=true;telemetry.close();db.close();resolveClose();}});server.closeIdleConnections();});
 return {server,repo,runtime,port,close,ownerControl};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const center=createCenter({port:Number(process.env.CONTROL_CENTER_PORT??3100)});
 center.server.listen(center.port,'127.0.0.1',async()=>{const observed=await center.ownerControl({action:'identity',pid:process.pid});atomicRecord(join(center.runtime,'server.json'),{pid:process.pid,identity:observed.identity,startedAt:new Date().toISOString(),port:center.port,service:'agent-control-center'});console.log(`Agent Control Center listening at http://localhost:${center.port}; owner password is stored in the private runtime directory.`);});
 for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void center.close().then(()=>process.exit(0));});
}
