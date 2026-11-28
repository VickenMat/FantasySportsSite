"""Canonical queue, leases, owner controls and legacy snapshot review.

The bounded writable lifecycle in development.py reuses these exact primitives;
this module contains no database or product deployment executor.
"""
from __future__ import annotations
import contextlib
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tarfile
import time
import uuid
import socket
import sys
import tempfile
import plistlib

VERSION = 1
STATES = {'ready','running','verification','completed','failed','blocked','approval_required','paused'}
MODES = {'manual','assisted','autonomous','paused','approval_required','emergency_stop','development_autonomous'}
ROLES = {'orchestrator','software_engineer','data_engineer','simulation_scientist','independent_reviewer','operations_engineer'}
MILESTONES = {'AUTOMATION','MAINTENANCE','M6.0','M6.1','M6.2','M6.3'}
ALLOWED = {'read_files','review_code','implement','run_tests','update_docs','offline_data','git_commit','git_push','approved_simulation'}
RESTRICTED = {'change_gameplay','change_scoring','v10_optimize','v10_activate','apply_migration','operational_backfill','broaden_promotion_policy','purchase','restricted_provider','production_deploy','authorize_milestone','enable_unattended','enable_writable_execution'}
PROHIBITED = {'force_push','database_reset','dataset_delete','credential_disclosure','modify_finalized_scores','overwrite_user_changes','fabricate_evidence'}
SAFE_FILES = ('AGENTS.md','PROJECT_STATUS.md','docs/M6_MASTER_SPECIFICATION.md','docs/M6_HISTORICAL_PREPARATION.md','docs/automation/HANDOFF.md','docs/automation/AGENT_ROLES.md','docs/MASTER_ROADMAP.md','docs/AUTHORIZATION_POLICY.md')
SAFE_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$')
SHA = re.compile(r'^[a-f0-9]{64}$')
CHILD_WRAPPER="import os,sys; gate=os.read(0,1); os.execv(sys.argv[1],sys.argv[1:]) if gate==b'G' else sys.exit(125)"

class SafetyError(RuntimeError): pass
class BusyError(SafetyError): pass

def now(): return dt.datetime.now(dt.timezone.utc)
def stamp(value=None): return (value or now()).isoformat().replace('+00:00','Z')
def parse_time(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None: raise SafetyError('Timestamps require an explicit timezone.')
    return parsed
def fingerprint(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def read_json(path, default=None):
    try: return json.loads(path.read_text())
    except FileNotFoundError:
        if default is not None: return default
        raise SafetyError(f'Missing required file: {path.name}')
def atomic_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if path.is_symlink(): raise SafetyError('Runtime files cannot be symlinks.')
    temporary = path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as handle:
            json.dump(value,handle,indent=2,ensure_ascii=False);handle.write('\n');handle.flush();os.fsync(handle.fileno())
        os.replace(temporary,path)
        descriptor=os.open(path.parent,os.O_RDONLY)
        try: os.fsync(descriptor)
        finally: os.close(descriptor)
    finally: temporary.unlink(missing_ok=True)

def child_environment():
    # No inherited DATABASE_URL, PG*, API keys, NODE_OPTIONS, BASH_ENV, MCP or
    # arbitrary PATH entries. HOME/CODEX_HOME locate existing subscription auth.
    value={'PATH':SAFE_PATH,'HOME':str(Path.home()),'LANG':'en_US.UTF-8','LC_ALL':'en_US.UTF-8','TERM':'dumb','AUTOMATION_AGENT_CONTEXT':'1'}
    if os.environ.get('CODEX_HOME'): value['CODEX_HOME']=os.environ['CODEX_HOME']
    return value

def process_identity(pid):
    try:
        result=subprocess.run(['/bin/ps','-p',str(pid),'-o','uid=','-o','stat=','-o','lstart='],capture_output=True,text=True,timeout=3)
        line=result.stdout.strip()
        if result.returncode or not line: return None
        owner,status,started=line.split(None,2)
        if status.startswith('Z'): return None
        return {'pid':pid,'uid':int(owner),'started':started.strip(),'pgid':os.getpgid(pid),'sid':os.getsid(pid)}
    except (OSError,ValueError,subprocess.TimeoutExpired): return None

def same_process(identity):
    return bool(identity and identity.get('uid')==os.getuid() and process_identity(identity['pid'])==identity)

def owned_group_members(identity):
    if not identity or identity.get('uid')!=os.getuid() or identity.get('pgid')!=identity.get('pid') or identity.get('sid')!=identity.get('pid'): return []
    leader=process_identity(identity['pid'])
    if leader and leader!=identity: return []
    result=subprocess.run(['/bin/ps','-axo','pid=,pgid=,uid=,stat='],capture_output=True,text=True,timeout=3)
    members=[]
    for line in result.stdout.splitlines():
        pid,group,owner,status=line.split()
        if int(group)!=identity['pgid'] or status.startswith('Z'): continue
        try:
            if int(owner)!=identity['uid'] or os.getsid(int(pid))!=identity['sid']: raise SafetyError('Process group ownership changed; refusing to signal it.')
        except ProcessLookupError: continue
        members.append(int(pid))
    return members

def terminate_group(identity, grace=1):
    if not owned_group_members(identity): return False
    if identity['pgid']!=identity['pid'] or identity['pgid']==os.getpgrp(): raise SafetyError('Refusing to signal an unowned process group.')
    try: os.killpg(identity['pgid'],signal.SIGTERM)
    except ProcessLookupError: return True
    deadline=time.monotonic()+grace
    while time.monotonic()<deadline and owned_group_members(identity): time.sleep(0.05)
    if owned_group_members(identity):
        try: os.killpg(identity['pgid'],signal.SIGKILL)
        except ProcessLookupError: pass
    deadline=time.monotonic()+2
    while time.monotonic()<deadline and owned_group_members(identity): time.sleep(0.05)
    if owned_group_members(identity): raise SafetyError('Owned subprocess group did not quiesce; retain its lease for manual inspection.')
    return True

def task_fingerprint(task):
    fields={key:task.get(key) for key in ('id','title','description','milestone','dependencies','assigned_role','authorization_scope','execution_kind','expected_deliverable','acceptance_criteria')}
    if 'development' in task: fields['development']=task['development']
    return fingerprint(fields)

def permission_flags(repo, credential_canary):
    filesystem={':root':'deny',':minimal':'read',str(Path.home()/'.codex'):'deny',str(repo):'deny',str(Path.home()/'.ssh'):'deny',str(Path.home()/'.aws'):'deny',str(credential_canary.parent):'deny',':tmpdir':'deny',':slash_tmp':'deny',':workspace_roots':{'.':'read','.env':'deny','.env.*':'deny'}}
    if os.environ.get('CODEX_HOME'): filesystem[str(Path(os.environ['CODEX_HOME']).resolve())]='deny'
    # Read the installed controller interpreter runtime, never the Xcode shim.
    filesystem[str(Path(sys.executable).resolve().parents[1])]='read'
    def toml(value):
        if isinstance(value,dict): return '{'+','.join(json.dumps(key)+'='+toml(item) for key,item in value.items())+'}'
        return json.dumps(value)
    return ['-c','default_permissions="automation-readonly"','-c','permissions.automation-readonly.filesystem='+toml(filesystem),'-c','permissions.automation-readonly.network.enabled=false']

def review_output_schema(files):
    return {'type':'object','additionalProperties':False,'properties':{'task_id':{'type':'string'},'summary':{'type':'string'},'reviewed_files':{'type':'array','items':{'type':'string','enum':list(files)}},'findings':{'type':'array','items':{'type':'string'}},'requires_owner_decision':{'type':'boolean'},'recommended_next_step':{'type':'string'}},'required':['task_id','summary','reviewed_files','findings','requires_owner_decision','recommended_next_step']}

def validate_review_result(result, task_id, files):
    schema=review_output_schema(files)
    if set(result)!=set(schema['required']) or result.get('task_id')!=task_id or not isinstance(result.get('summary'),str) or not isinstance(result.get('requires_owner_decision'),bool) or not isinstance(result.get('recommended_next_step'),str): raise SafetyError('Structured result schema differs.')
    for key in ('reviewed_files','findings'):
        if not isinstance(result.get(key),list) or not all(isinstance(value,str) for value in result[key]): raise SafetyError('Invalid structured review list.')
    if not set(result['reviewed_files']).issubset(files): raise SafetyError('Reviewer claimed files outside the sanitized snapshot; bare paths only.')

def native_telemetry(path):
    metadata={'usage':{},'session_id':None,'turn_completed':False,'log_truncated':False}
    if not path.exists(): return metadata
    def counts(value,depth=0):
        if depth>2 or not isinstance(value,dict): return {}
        return {key:item if isinstance(item,int) and not isinstance(item,bool) else counts(item,depth+1) for key,item in value.items() if isinstance(item,int) and not isinstance(item,bool) or isinstance(item,dict)}
    with path.open('rb') as handle:
        size=path.stat().st_size
        if size>8*1024*1024:
            head=handle.read(512*1024);handle.seek(max(0,size-2*1024*1024));body=(head+b'\n'+handle.read(2*1024*1024)).decode(errors='replace');metadata['log_truncated']=True
        else:body=handle.read(8*1024*1024).decode(errors='replace')
    for line in body.splitlines():
        try: event=json.loads(line)
        except json.JSONDecodeError: continue
        if event.get('type')=='thread.started' and isinstance(event.get('thread_id'),str): metadata['session_id']=event['thread_id'][:128]
        if event.get('type')=='turn.completed': metadata.update(usage=counts(event.get('usage',{})),turn_completed=True)
    return metadata

def validate_queue(raw):
    if raw.get('version')!=1 or not isinstance(raw.get('tasks'),list) or len(raw['tasks'])>1000: raise SafetyError('Expected a bounded version1 task queue.')
    if raw.get('mode','assisted') not in MODES: raise SafetyError('Unknown operating mode.')
    if not 1<=raw.get('max_specialists',3)<=3: raise SafetyError('At most three specialists are permitted.')
    ids=set()
    for task in raw['tasks']:
        if not ID.fullmatch(task.get('id','')) or task['id'] in ids: raise SafetyError('Task IDs must be safe and unique.')
        ids.add(task['id'])
        if task.get('assigned_role') not in ROLES or task.get('status') not in STATES: raise SafetyError('Unknown task role or status.')
        if task.get('execution_kind') not in {'read_only_review','implementation_handoff','writable_implementation'}: raise SafetyError('Unknown safe execution kind.')
        for key in ('title','description','milestone','expected_deliverable'):
            if not isinstance(task.get(key),str) or not task[key] or len(task[key])>16000: raise SafetyError('Task text is missing or unbounded.')
        if not isinstance(task.get('priority'),int) or not 0<=task['priority']<=1000: raise SafetyError('Priority must be an integer0–1000; smaller runs first.')
        if not isinstance(task.get('dependencies'),list) or len(set(task['dependencies']))!=len(task['dependencies']): raise SafetyError('Dependencies must be unique task IDs.')
        if not isinstance(task.get('acceptance_criteria'),list) or not task['acceptance_criteria'] or not all(isinstance(x,str) and x for x in task['acceptance_criteria']): raise SafetyError('Explicit acceptance criteria are required.')
        scope=task.get('authorization_scope')
        if not isinstance(scope,dict) or not isinstance(scope.get('actions'),list) or not scope['actions'] or not all(isinstance(x,str) for x in scope['actions']): raise SafetyError('Explicit authorization actions required.')
        target=scope.get('target_fingerprint')
        if target is not None and not SHA.fullmatch(target): raise SafetyError('Exact target fingerprints must be SHA256.')
        if not isinstance(task.get('attempt_count',0),int) or task.get('attempt_count',0)<0: raise SafetyError('Invalid attempt count.')
    visiting=set();visited=set();by_id={task['id']:task for task in raw['tasks']}
    def visit(key):
        if key in visiting: raise SafetyError('Task dependencies contain a cycle.')
        if key in visited: return
        visiting.add(key)
        for dependency in by_id[key]['dependencies']:
            if dependency not in ids: raise SafetyError('Unknown dependency.')
            visit(dependency)
        visiting.remove(key);visited.add(key)
    for key in ids: visit(key)
    return raw

def approval_valid(scope, task_hash, required, approvals, at=None):
    at=at or now();approval_id=scope.get('approval_id');target=scope.get('target_fingerprint')
    for approval in approvals.get('approvals',[]):
        if approval.get('id')!=approval_id or approval.get('status')!='approved': continue
        decision=approval.get('decision',{})
        if decision.get('actor_kind')!='human' or decision.get('actor')!='project_owner' or not decision.get('recorded_at'): return False
        try:
            if parse_time(decision['recorded_at'])>at or not approval.get('expires_at') or parse_time(approval['expires_at'])<=at: return False
        except (ValueError,TypeError,SafetyError): return False
        if not target or approval.get('target_fingerprint')!=target or approval.get('task_fingerprint')!=task_hash: return False
        return set(required).issubset(approval.get('scope',[]))
    return False

def authorize(task, approvals):
    actions=set(task['authorization_scope']['actions']);required=actions&RESTRICTED
    if actions&PROHIBITED: return 'blocked','PROHIBITED_ACTION'
    if 'database_write' in actions: return 'blocked','NO_DATABASE_EXECUTOR'
    if actions-(ALLOWED|RESTRICTED|PROHIBITED): return 'blocked','UNKNOWN_AUTHORIZATION_SCOPE'
    if task['milestone'] not in MILESTONES: required.add('milestone:'+task['milestone'])
    if required and not approval_valid(task['authorization_scope'],task_fingerprint(task),required,approvals): return 'approval_required','EXACT_OWNER_APPROVAL_REQUIRED'
    # Restricted actions can only be reviewed/handoff, never executed here.
    if required: return 'verification','RESTRICTED_ACTION_REQUIRES_EXTERNAL_REVIEWED_EXECUTOR'
    return None,None

class Engine:
    def __init__(self, repo, runtime=None, queue=None, approvals=None):
        self.repo=Path(repo).resolve()
        query=subprocess.run(['/usr/bin/git','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','rev-parse','--path-format=absolute','--git-common-dir'],cwd=self.repo,capture_output=True,text=True,timeout=5,env=child_environment())
        if query.returncode: raise SafetyError('An existing Git repository is required.')
        common=Path(query.stdout.strip()).resolve()
        self.owner_root=common.parent if common.name=='.git' else self.repo
        canonical=self.owner_root/'.automation'
        if runtime is not None and Path(runtime).resolve()!=canonical.resolve(): raise SafetyError('Runtime overrides cannot bypass the canonical per-repository lease/state.')
        self.runtime=canonical
        if self.runtime.is_symlink(): raise SafetyError('Runtime root cannot be a symlink.')
        self.runtime.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(self.runtime,0o700)
        self.queue_path=Path(queue or self.owner_root/'docs/automation/TASK_QUEUE.json')
        self.approval_path=Path(approvals or self.owner_root/'docs/automation/APPROVAL_QUEUE.json')
        self.state_path=self.runtime/'state.json';self.control_path=self.runtime/'control.json'
        self.run_path=self.runtime/'active-run.json'
    @contextlib.contextmanager
    def lock(self, name='orchestrator', blocking=False):
        path=self.runtime/(name+'.lock')
        if path.is_symlink(): raise SafetyError('Lock files cannot be symlinks.')
        handle=os.fdopen(os.open(path,os.O_RDWR|os.O_CREAT,0o600),'r+')
        try:
            try: fcntl.flock(handle,fcntl.LOCK_EX|(0 if blocking else fcntl.LOCK_NB))
            except BlockingIOError: raise BusyError('Another orchestrator owns the active cycle.')
            yield
        finally: handle.close()
    def control(self): return read_json(self.control_path,{'version':1,'mode':'assisted','reason':None})
    def state(self): return read_json(self.state_path,{'version':1,'tasks':{},'executions':[]})
    def queue(self): return validate_queue(read_json(self.queue_path))
    def approvals(self): return read_json(self.approval_path,{'version':1,'approvals':[]})
    def save(self, state): atomic_json(self.state_path,state)
    def event(self, kind, **values):
        path=self.runtime/'events.jsonl'
        if path.is_symlink(): raise SafetyError('Log path cannot be a symlink.')
        with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600),'a') as handle:
            handle.write(json.dumps({'at':stamp(),'event':kind,**values},sort_keys=True)+'\n');handle.flush();os.fsync(handle.fileno())
    def merged(self, queue, state):
        result=[]
        for source in queue['tasks']:
            row={**source,**state['tasks'].get(source['id'],{})}
            if row.get('definition_fingerprint') and row['definition_fingerprint']!=task_fingerprint(source):
                row.update(status='approval_required',blocker_classification='TASK_DEFINITION_CHANGED_REVIEW_REQUIRED')
            result.append(row)
        return result
    def activation_plan(self, approval_id='AUTO-ACTIVATION-001'):
        path=self.owner_root/'docs/automation/ACTIVATION_MANIFEST.json';manifest=read_json(path)
        configuration={'mode':'autonomous','execution_profile':'read_only_snapshot','max_tasks':1,'timeout_seconds':180,'interval_seconds':900,'max_attempts':3,'daily_execution_limit':6,'scheduler_label':'com.fantasyevolution.readonly'}
        if manifest.get('version')!=1 or manifest.get('configuration')!=configuration or not isinstance(manifest.get('files'),dict): raise SafetyError('Activation configuration differs from the bounded read-only policy.')
        required={'scripts/automation/engine.py','scripts/automation/orchestrator.py','scripts/automation/task_queue.schema.json','scripts/automation/approval_queue.schema.json','scripts/automation/com.fantasyevolution.assisted.plist.in','scripts/automation/prepare_activation.py'}
        if (self.owner_root/'control-center/server.ts').exists():required.update({'control-center/server.ts','control-center/bridge.py','control-center/security.ts','control-center/policy.ts','control-center/cli.mjs','control-center/tsconfig.json','package.json','package-lock.json'})
        if not required.issubset(manifest['files']): raise SafetyError('Activation must bind every critical engine/schema/template file.')
        public=required|{'AGENTS.md','.gitignore','docs/AUTHORIZATION_POLICY.md','docs/DECISION_LOG.md','docs/automation/AGENT_ROLES.md','docs/automation/OPERATIONS.md','docs/automation/CODEX_CAPABILITIES.md','control-center/tsconfig.json','package.json','package-lock.json'}
        for relative,expected in manifest['files'].items():
            resource=self.owner_root/relative
            if relative not in public and not(relative.startswith('.codex/agents/') and relative.endswith('.toml')) and not(relative.startswith('control-center/') and relative.endswith(('.ts','.tsx','.css','.html','.mjs','.py')) and '.test.' not in relative):raise SafetyError('Only public reviewed engine/configuration files may be bound.')
            if Path(relative).is_absolute() or '..' in Path(relative).parts or resource.is_symlink() or not resource.resolve().is_relative_to(self.owner_root) or not SHA.fullmatch(expected) or hashlib.sha256(resource.read_bytes()).hexdigest()!=expected: raise SafetyError('Reviewed activation file hash changed.')
        scheduler=manifest.get('rendered_scheduler',{});relative=scheduler.get('path','');resource=self.owner_root/relative
        if relative!='.automation/launchd/com.fantasyevolution.readonly.plist' or resource.is_symlink() or not resource.is_file() or hashlib.sha256(resource.read_bytes()).hexdigest()!=scheduler.get('sha256'): raise SafetyError('Rendered scheduler changed or is missing.')
        prepared=plistlib.loads(resource.read_bytes())
        expected_args=[str(Path(sys.executable).resolve()),str(self.owner_root/'scripts/automation/orchestrator.py'),'cycle','--execute-read-only','--max-tasks','1','--timeout-seconds','180']
        expected_plist={'Label':configuration['scheduler_label'],'ProgramArguments':expected_args,'WorkingDirectory':str(self.owner_root),'StartInterval':900,'RunAtLoad':False,'ProcessType':'Background','LowPriorityIO':True,'Nice':10,'StandardOutPath':str(self.runtime/'scheduler-logs/launchd.stdout.log'),'StandardErrorPath':str(self.runtime/'scheduler-logs/launchd.stderr.log')}
        if prepared!=expected_plist: raise SafetyError('Rendered scheduler is not the exact reviewed bounded read-only command.')
        activation_tasks=[task for task in self.queue()['tasks'] if task['authorization_scope']['actions']==['enable_unattended']]
        if len(activation_tasks)!=1: raise SafetyError('One explicit enable_unattended task is required.')
        target=fingerprint(manifest);task=json.loads(json.dumps(activation_tasks[0]));task['authorization_scope'].update(target_fingerprint=target,approval_id=approval_id)
        return {'target_fingerprint':target,'task_fingerprint':task_fingerprint(task),'task_id':task['id'],'approval_id':approval_id,'configuration':configuration,'manifest':manifest}
    def activate(self, approval_id):
        if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1': raise SafetyError('Worker agents cannot activate the controller.')
        with self.lock():
            if self.control()['mode'] in {'paused','emergency_stop'}: raise SafetyError('Owner must resolve the stop/pause before separately approving activation.')
            plan=self.activation_plan(approval_id);task=next(task for task in self.queue()['tasks'] if task['id']==plan['task_id'])
            if task['authorization_scope'].get('target_fingerprint')!=plan['target_fingerprint'] or task['authorization_scope'].get('approval_id')!=approval_id or task_fingerprint(task)!=plan['task_fingerprint'] or not approval_valid(task['authorization_scope'],plan['task_fingerprint'],['enable_unattended'],self.approvals()): raise SafetyError('Exact current human activation approval is required.')
            receipt={key:plan[key] for key in ('target_fingerprint','task_fingerprint','task_id','approval_id','configuration')};receipt['activated_at']=stamp();receipt['scheduler_installed']=False
            atomic_json(self.runtime/'activation.json',receipt)
            state=self.state();row=state['tasks'].setdefault(task['id'],{});row.update(status='verification',definition_fingerprint=plan['task_fingerprint'],blocker_classification='APPROVED_ARMED_SCHEDULER_NOT_INSTALLED',activation_receipt=receipt);self.save(state)
            with self.lock('control',True): atomic_json(self.control_path,{'version':1,'mode':'autonomous','reason':'EXACT_OWNER_APPROVAL','updated_at':stamp()})
            self.event('owner_armed_read_only_mode',target_fingerprint=plan['target_fingerprint'],scheduler_installed=False)
            return {'mode':'autonomous','target_fingerprint':plan['target_fingerprint'],'scheduler_installed':False,'writable_execution_enabled':False}
    def verify_activation(self):
        receipt=read_json(self.runtime/'activation.json');plan=self.activation_plan(receipt.get('approval_id'))
        task=next(task for task in self.queue()['tasks'] if task['id']==plan['task_id'])
        if any(receipt.get(key)!=plan[key] for key in ('target_fingerprint','task_fingerprint','task_id','approval_id','configuration')) or task_fingerprint(task)!=plan['task_fingerprint'] or not approval_valid(task['authorization_scope'],plan['task_fingerprint'],['enable_unattended'],self.approvals()): raise SafetyError('Autonomous approval expired or changed; activation stopped.')
        return plan
    def review(self, task_id, expected_fingerprint, reviewer, reviewer_run_id, evidence, decision, associated_commit=None):
        if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1': raise SafetyError('Worker result producers cannot accept their own review.')
        with self.lock():
            task=next((task for task in self.queue()['tasks'] if task['id']==task_id),None);state=self.state();row=state['tasks'].get(task_id,{})
            if not task or row.get('status')!='verification' or row.get('definition_fingerprint')!=expected_fingerprint or task_fingerprint(task)!=expected_fingerprint: raise SafetyError('Review requires the unchanged exact verification task.')
            if set(task['authorization_scope']['actions'])-ALLOWED or task['milestone'] not in MILESTONES: raise SafetyError('Ordinary review cannot approve a restricted action or milestone.')
            if reviewer not in {'project_owner','orchestrator','independent_reviewer'} or reviewer==task['assigned_role'] or not reviewer_run_id or reviewer_run_id in {row.get('run_id'),row.get('session_id')}: raise SafetyError('A distinct independent reviewer/run is required.')
            resource=self.owner_root/evidence
            if Path(evidence).is_absolute() or '..' in Path(evidence).parts or not evidence.startswith(('reports/','docs/')) or resource.is_symlink() or not resource.is_file() or not resource.resolve().is_relative_to(self.owner_root) or resource.stat().st_size==0 or resource.suffix not in {'.json','.md'}: raise SafetyError('A nonempty safe public review report is required.')
            if decision not in {'accept','reject'}: raise SafetyError('Unknown review decision.')
            commit=associated_commit or row.get('associated_commit')
            if decision=='accept':
                if not isinstance(commit,str) or not re.fullmatch(r'[a-f0-9]{7,40}',commit): raise SafetyError('An actual reviewed main-history commit is required.')
                self.git('merge-base','--is-ancestor',commit,'HEAD')
                if task['execution_kind']=='implementation_handoff' and not associated_commit: raise SafetyError('Implementation handoff needs an explicitly reviewed integrated commit.')
            receipt={'task_id':task_id,'task_fingerprint':expected_fingerprint,'reviewer':reviewer,'reviewer_run_id':reviewer_run_id,'source_run_id':row.get('run_id'),'evidence':evidence,'evidence_sha256':hashlib.sha256(resource.read_bytes()).hexdigest(),'decision':decision,'associated_commit':commit,'recorded_at':stamp(),'restricted_approval':False}
            atomic_json(self.runtime/'reviews'/(task_id+'-'+uuid.uuid4().hex+'.json'),receipt)
            row.update(status='completed' if decision=='accept' else 'blocked',blocker_classification=None if decision=='accept' else 'INDEPENDENT_REVIEW_REJECTED',associated_commit=commit,independent_review=receipt);self.save(state);self.event('ordinary_review_recorded',task_id=task_id,decision=decision)
            return {'task_id':task_id,'status':row['status'],'restricted_approval':False}
    def recover(self, state):
        run=read_json(self.run_path,{})
        if run.get('child') and owned_group_members(run['child']): raise BusyError('An interrupted cycle still has a live owned child; stop it before recovery.')
        changed=[]
        for key,row in state['tasks'].items():
            if row.get('status')=='running':
                if row.get('development_workflow'):
                    row.update(status='blocked',blocker_classification='INTERRUPTED_CHECKPOINT_REVIEW_REQUIRED')
                else:row.update(status='failed' if row.get('attempt_count',0)<3 else 'blocked',blocker_classification='INTERRUPTED_EXECUTION_REQUIRES_RETRY',next_attempt_at=stamp(now()+dt.timedelta(seconds=60)))
                changed.append(key)
        if changed: self.event('interrupted_tasks_recovered',task_ids=changed)
        if run: self.run_path.unlink(missing_ok=True)
        return changed
    def status(self):
        queue=self.queue();state=self.state();control=self.control();tasks=self.merged(queue,state)
        return {'version':1,'mode':control['mode'],'reason':control.get('reason'),'queue_mode':queue.get('mode','assisted'),'max_specialists':queue.get('max_specialists',3),'tasks':tasks,'active_run':read_json(self.run_path,{}),'execution_count':len(state['executions']),'approval_requests':[row['id'] for row in tasks if row['status']=='approval_required'],'writes_to_primary_checkout':'verified_integration_authority_only' if (self.owner_root/'scripts/automation/development.py').is_file() else False,'executor':'ISOLATED_WORKTREE_DEVELOPMENT_AND_READ_ONLY_REVIEW' if (self.owner_root/'scripts/automation/development.py').is_file() else 'READ_ONLY_SNAPSHOT_OR_REVIEWED_WORKTREE_HANDOFF'}
    def pause(self, emergency=False):
        if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1': raise SafetyError('Worker agents cannot control the owner controller.')
        with self.lock('control',True):
            atomic_json(self.control_path,{'version':1,'mode':'emergency_stop' if emergency else 'paused','reason':'OWNER_EMERGENCY_STOP' if emergency else 'OWNER_PAUSE','updated_at':stamp()})
        run=read_json(self.run_path,{})
        killed=terminate_group(run.get('child')) if emergency else False
        self.event('emergency_stop' if emergency else 'pause',child_signalled=killed)
        return {'mode':self.control()['mode'],'child_signalled':killed}
    def resume(self, acknowledge=False):
        if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1': raise SafetyError('Worker agents cannot resume the controller.')
        with self.lock():
            if self.control()['mode']=='emergency_stop' and not acknowledge: raise SafetyError('Emergency stop requires explicit --acknowledge-stop.')
            state=self.state();self.recover(state)
            for row in state['tasks'].values():
                if row.get('status')=='paused': row.update(status='ready',blocker_classification=None)
            self.save(state)
            with self.lock('control',True): atomic_json(self.control_path,{'version':1,'mode':'assisted','reason':None,'updated_at':stamp()})
        return {'mode':'assisted'}
    def git(self, *args, cwd=None, capture=True):
        env=child_environment();env.update(GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null',GIT_TERMINAL_PROMPT='0')
        result=subprocess.run(['/usr/bin/git','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',*args],cwd=cwd or self.repo,env=env,capture_output=capture,timeout=30)
        if result.returncode: raise SafetyError('Bounded Git operation failed; no automatic rollback or overwrite attempted.')
        return result.stdout
    def repository_context(self):
        return {'commit':self.git('rev-parse','HEAD').decode().strip(),'tracked_worktree_fingerprint':hashlib.sha256(self.git('diff','HEAD','--binary')).hexdigest(),'status_fingerprint':hashlib.sha256(self.git('status','--porcelain=v1','-z','--untracked-files=no')).hexdigest()}
    def snapshot(self, run_id):
        path=Path(tempfile.mkdtemp(prefix='fantasy-automation-'+run_id[:8]+'-'));os.chmod(path,0o700)
        copied=[]
        for name in SAFE_FILES:
            source=self.repo/name
            if not source.exists(): continue
            if source.is_symlink() or not source.is_file() or source.stat().st_size>256*1024: raise SafetyError('Unsafe snapshot input.')
            if not source.resolve().is_relative_to(self.repo): raise SafetyError('Snapshot path escaped repository.')
            destination=path/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination);copied.append(name)
        if not copied: raise SafetyError('No approved project memory files available for the bounded review.')
        self.git('init','--quiet',str(path),cwd=self.repo)
        atomic_json(self.runtime/'snapshots'/(run_id+'.json'),{'path':str(path),'run_id':run_id,'files':copied,'credential_free_copy':True})
        return path,copied

    def sandbox_probe(self, binary, snapshot, directory, env):
        # No actual secret is opened. Both forbidden inputs are harmless canaries.
        canary_root=directory/'canaries';canary_root.mkdir(mode=0o700)
        parent=canary_root/'parent-canary';parent.write_text('harmless-parent-canary')
        fake_auth=canary_root/'credential-shaped';fake_auth.mkdir(mode=0o700)
        credential=fake_auth/'auth-fixture.json';credential.write_text('{"fake_token":"harmless-fixture-not-a-credential"}')
        allowed=snapshot/'.automation-allowed-canary';allowed.write_text('allowed-read')
        flags=permission_flags(self.owner_root,credential)
        (directory/'probe-codex-home').mkdir(mode=0o700)
        code="""import errno,json,os,socket,sys
def denied_read(path):
 try:
  with open(path):pass
  return False
 except PermissionError:return True
 except OSError as e:return e.errno in (errno.EPERM,errno.EACCES)
result={'read_allowed':open('.automation-allowed-canary').read()=='allowed-read','parent_read_denied':denied_read(sys.argv[1]),'credential_canary_denied':denied_read(sys.argv[2])}
try:
 open('.automation-forbidden-write','w').write('harmless-fixture');result['write_denied']=False
except PermissionError:result['write_denied']=True
except OSError as e:result['write_denied']=e.errno in(errno.EPERM,errno.EACCES)
try:
 s=socket.socket();s.settimeout(1);s.connect(('127.0.0.1',int(sys.argv[3])));result['network_denied']=False;s.close()
except PermissionError:result['network_denied']=True
except OSError as e:result['network_denied']=e.errno in(errno.EPERM,errno.EACCES)
print(json.dumps(result,sort_keys=True))
"""
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen(1)
            result=subprocess.run([str(binary),'sandbox','-P','automation-readonly','-C',str(snapshot),*flags,'--',str(Path(sys.executable).resolve()),'-c',code,str(parent),str(credential),str(listener.getsockname()[1])],env={**env,'CODEX_HOME':str(directory/'probe-codex-home')},cwd=snapshot,capture_output=True,text=True,timeout=15)
        try: checks=json.loads(result.stdout.strip())
        except json.JSONDecodeError: checks={}
        with os.fdopen(os.open(directory/'probe-stderr.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600),'w') as handle: handle.write(result.stderr[:16000])
        expected={'read_allowed','parent_read_denied','credential_canary_denied','write_denied','network_denied'}
        report={'passed':result.returncode==0 and set(checks)==expected and all(value is True for value in checks.values()),'checks':checks,'returncode':result.returncode,'actual_credentials_opened':False,'profile':'automation-readonly','legacy_sandbox_override':False}
        atomic_json(directory/'sandbox-probe.json',report)
        if not report['passed']: raise SafetyError('Filesystem/network canary profile failed; no model execution is permitted.')
        return flags
    def worktree(self, task_id):
        with self.lock():
            queue=self.queue();task=next((task for task in queue['tasks'] if task['id']==task_id),None)
            if not task or task['execution_kind']!='implementation_handoff': raise SafetyError('Only an implementation handoff may create a reviewed worktree.')
            status,reason=authorize(task,self.approvals())
            if status: raise SafetyError(reason)
            before=self.repository_context();name=f'automation/{task_id}-{task_fingerprint(task)[:8]}'
            destination=self.runtime/'worktrees'/task_id
            if destination.exists(): raise SafetyError('Worktree path already exists; inspect it rather than overwriting.')
            tree=self.git('ls-tree','-r','--name-only','HEAD').decode().splitlines()
            def sensitive(path): return path.startswith(('data/','Datasets/','.automation/')) or path.startswith('.codex/') and not(path.startswith('.codex/agents/') and path.endswith('.toml')) or any(part=='.env' or part.startswith('.env.') and part!='.env.example' for part in Path(path).parts)
            if any(sensitive(path) for path in tree): raise SafetyError('Tracked sensitive data/config cannot enter an automated worktree.')
            archive=self.git('archive','--format=tar','HEAD')
            with tarfile.open(fileobj=io.BytesIO(archive)) as content:
                members=content.getmembers()
                if any(member.issym() or member.islnk() or not(member.isfile() or member.isdir()) or Path(member.name).is_absolute() or '..' in Path(member.name).parts for member in members): raise SafetyError('Worktree archive contains unsafe entries.')
                destination.parent.mkdir(parents=True,exist_ok=True)
                self.git('worktree','add','--no-checkout','-b',name,str(destination),'HEAD')
                content.extractall(destination,members=members,filter='data')
            self.git('reset','--mixed','HEAD',cwd=destination)
            if self.repository_context()!=before: raise SafetyError('Primary tracked files changed concurrently; no integration attempted.')
            result={'task_id':task_id,'branch':name,'path':str(destination),'base_commit':before['commit'],'credential_environment_inherited':False,'database_execution_allowed':False,'integration_authority':'OWNER_REVIEW_REQUIRED','automatic_write_execution':False}
            atomic_json(self.runtime/'handoffs'/(task_id+'.json'),result);self.event('worktree_handoff_created',task_id=task_id,branch=name)
            return result
    def ready(self, queue, state):
        rows=self.merged(queue,state);by_id={row['id']:row for row in rows};eligible=[]
        for row in rows:
            if row['status']=='approval_required' and row.get('blocker_classification')=='EXACT_OWNER_APPROVAL_REQUIRED':
                source=next(task for task in queue['tasks'] if task['id']==row['id'])
                authorized,_=authorize(source,self.approvals())
                if authorized not in {None,'verification'}: continue
            elif row['status'] not in {'ready','failed'}: continue
            if row.get('attempt_count',0)>=3: continue
            if row.get('next_attempt_at') and parse_time(row['next_attempt_at'])>now(): continue
            if not all(by_id[key]['status']=='completed' for key in row['dependencies']): continue
            eligible.append(row)
        return sorted(eligible,key=lambda row:(row['priority'],row['id']))
    def cycle(self, execute=False, max_tasks=1, timeout=180, codex='/opt/homebrew/bin/codex', executor=None):
        if self.control().get('mode')=='development_autonomous': raise SafetyError('Development activation cannot launch the legacy read-only scheduler.')
        if not 1<=max_tasks<=3 or not 5<=timeout<=600: raise SafetyError('Cycle/resource bound exceeded.')
        with self.lock():
            queue=self.queue();state=self.state();control=self.control()
            if control['mode'] in {'paused','emergency_stop','approval_required'} or queue.get('mode') in {'paused','emergency_stop','approval_required'}: return {'executed':0,'mode':control['mode'],'blocked':True}
            if control['mode']=='autonomous':
                try: plan=self.verify_activation()
                except (SafetyError,OSError,ValueError):
                    with self.lock('control',True): atomic_json(self.control_path,{'version':1,'mode':'approval_required','reason':'ACTIVATION_CHANGED_OR_EXPIRED','updated_at':stamp()})
                    return {'executed':0,'blocked':True,'reason':'ACTIVATION_CHANGED_OR_EXPIRED'}
                if max_tasks>plan['configuration']['max_tasks'] or timeout>plan['configuration']['timeout_seconds']: raise SafetyError('Cycle exceeds the exact autonomous resource approval.')
            elif queue.get('mode')=='autonomous': raise SafetyError('Unattended activation requires the owner activation command and exact approval.')
            self.recover(state);candidates=[task for task in self.ready(queue,state) if task['execution_kind']!='writable_implementation']
            if not execute:
                self.save(state)
                return {'dry_run':True,'executed':0,'candidates':[{'id':task['id'],'fingerprint':task_fingerprint(next(x for x in queue['tasks'] if x['id']==task['id'])),'authorization':authorize(task,self.approvals())} for task in candidates],'mode':control['mode']}
            if control['mode']=='manual' or queue.get('mode')=='manual': raise SafetyError('Manual mode does not execute scheduled cycles.')
            results=[];processed=0;attempted=0
            for candidate in candidates:
                if self.control()['mode'] in {'paused','emergency_stop','approval_required'}: break
                task=next(row for row in queue['tasks'] if row['id']==candidate['id']);target=state['tasks'].setdefault(task['id'],{})
                target.setdefault('attempt_count',task.get('attempt_count',0));target['definition_fingerprint']=task_fingerprint(task)
                denied,reason=authorize(task,self.approvals())
                if denied:
                    target.update(status=denied,blocker_classification=reason);results.append({'id':task['id'],'status':denied,'reason':reason});self.save(state);continue
                if processed>=min(max_tasks,queue.get('max_specialists',3)): break
                processed+=1
                if task['execution_kind']!='read_only_review' or set(task['authorization_scope']['actions'])-{'read_files','review_code'}:
                    target.update(status='verification',blocker_classification='REVIEWED_WORKTREE_EXECUTION_HANDOFF_REQUIRED');results.append({'id':task['id'],'status':'verification','kind':'implementation_handoff'});self.save(state);continue
                recent=[value for value in state['executions'] if parse_time(value)>now()-dt.timedelta(days=1)]
                if len(recent)>=6:
                    target.update(status='blocked',blocker_classification='ROLLING_EXECUTION_BUDGET_EXHAUSTED');self.save(state);break
                context=self.repository_context();run_id=uuid.uuid4().hex
                target.update(status='running',attempt_count=target['attempt_count']+1,last_execution_time=stamp(),run_id=run_id,associated_commit=context['commit'],blocker_classification=None)
                state['executions']=recent+[stamp()];self.save(state);self.event('task_claimed',task_id=task['id'],run_id=run_id,attempt=target['attempt_count'])
                attempted+=1
                attempt_started=time.monotonic()
                try:
                    snapshot,files=self.snapshot(run_id)
                    outcome=(executor or self.execute_codex)(task,snapshot,files,run_id,timeout,codex)
                    if self.repository_context()!=context: raise SafetyError('Primary checkout changed during review; independent inspection is required.')
                    if outcome.get('usage_limit'):
                        target.update(status='blocked',blocker_classification='USAGE_LIMIT_REQUIRES_OWNER_RESUME')
                        with self.lock('control',True): atomic_json(self.control_path,{'version':1,'mode':'paused','reason':'CODEX_USAGE_LIMIT','updated_at':stamp()})
                    elif outcome.get('interrupted'):
                        target.update(status='paused',blocker_classification='OWNER_CONTROL_INTERRUPTED_EXECUTION')
                    elif outcome.get('success'):
                        target.update(status='verification',blocker_classification='INDEPENDENT_REVIEW_REQUIRED',result_path=outcome['result_path'],review_handoff={'assigned_role':'independent_reviewer','source_task_id':task['id'],'source_run_id':run_id,'self_completion_allowed':False,'integration_authority':'OWNER_REVIEW_REQUIRED'})
                    else: raise SafetyError(outcome.get('failure','Bounded child failed.'))
                    target['usage']=outcome.get('usage',{});target['elapsed_seconds']=outcome.get('elapsed_seconds',0)
                except (SafetyError,OSError,subprocess.SubprocessError) as error:
                    exhausted=target['attempt_count']>=3
                    target.update(status='blocked' if exhausted else 'failed',blocker_classification='RETRY_EXHAUSTED' if exhausted else 'BOUNDED_EXECUTION_FAILED',next_attempt_at=stamp(now()+dt.timedelta(seconds=min(3600,60*2**(target['attempt_count']-1)))),last_error=type(error).__name__)
                finally:
                    telemetry=native_telemetry(self.runtime/'runs'/run_id/'events.jsonl')
                    if telemetry['session_id'] or telemetry['usage']:
                        target.update(usage=telemetry['usage'],session_id=telemetry['session_id'],native_turn_completed=telemetry['turn_completed'],native_log_truncated=telemetry['log_truncated'])
                    target['elapsed_seconds']=time.monotonic()-attempt_started
                    target.setdefault('execution_history',[]).append({'run_id':run_id,'usage':telemetry['usage'],'session_id':telemetry['session_id'],'elapsed_seconds':target['elapsed_seconds'],'native_turn_completed':telemetry['turn_completed'],'native_log_truncated':telemetry['log_truncated']})
                    active=read_json(self.run_path,{})
                    try: survivors=bool(active.get('child') and owned_group_members(active['child']))
                    except SafetyError: survivors=True
                    if survivors:
                        target.update(status='blocked',blocker_classification='OWNED_PROCESS_GROUP_REQUIRES_OWNER_STOP')
                        with self.lock('control',True): atomic_json(self.control_path,{'version':1,'mode':'paused','reason':'UNQUIESCED_PROCESS_GROUP','updated_at':stamp()})
                    else: self.run_path.unlink(missing_ok=True)
                    self.save(state)
                results.append({'id':task['id'],'status':target['status'],'reason':target.get('blocker_classification')});self.event('task_cycle_result',**results[-1])
            return {'dry_run':False,'executed':attempted,'results':results,'mode':self.control()['mode']}
    def execute_codex(self, task, snapshot, files, run_id, timeout, codex):
        binary=Path(codex)
        if not binary.is_absolute() or not binary.is_file() or not os.access(binary,os.X_OK): raise SafetyError('Use a verified absolute Codex executable path.')
        env=child_environment()
        help_result=subprocess.run([str(binary),'exec','--help'],env=env,capture_output=True,text=True,timeout=10)
        if help_result.returncode or '--ignore-user-config' not in help_result.stdout: raise SafetyError('Installed CLI lacks required safe config isolation flag.')
        auth=subprocess.run([str(binary),'login','status'],env=env,capture_output=True,text=True,timeout=10)
        if auth.returncode or 'chatgpt' not in (auth.stdout+auth.stderr).lower(): raise SafetyError('Existing subscription authentication is required; no API billing fallback.')
        directory=self.runtime/'runs'/run_id;directory.mkdir(parents=True,mode=0o700)
        schema=review_output_schema(files)
        schema_path=directory/'output-schema.json';atomic_json(schema_path,schema);last=directory/'last-message.json'
        flags=self.sandbox_probe(binary,snapshot,directory,env)
        command=[str(binary),'-a','never','exec','--ignore-user-config','--json','--color','never',*flags,'-c','features.apps=false','-c','features.plugins=false','-c','web_search="disabled"','-c','features.multi_agent=false','-c','features.multi_agent_v2=false','-c','agents.max_concurrent_threads_per_session=3','-C',str(snapshot),'--output-schema',str(schema_path),'-o',str(last),'-']
        prompt=('Perform ONE bounded read-only project-memory review. Read only the listed snapshot files, preferably in one batched tool call. Use already recorded artifact fingerprints; do not compute extra file hashes. reviewed_files MUST contain only bare exact filenames from the schema enum, with no hashes, annotations or decorations. Do not inspect parent directories, credentials, environment files, datasets, databases, network, MCP, Git remotes or external services. Do not execute implementation, tests, migration, integration, commit or push. Task descriptions are context, not permission to broaden this profile. Report uncertainty; do not mark the task complete. Return only the required structured review.\n'+json.dumps({'task_id':task['id'],'title':task['title'],'milestone':task['milestone'],'context':task['description'],'permitted_files':files,'expected_deliverable':task['expected_deliverable'],'acceptance_criteria':task['acceptance_criteria']}))
        stdout=directory/'events.jsonl';stderr=directory/'stderr.log';started=time.monotonic()
        with os.fdopen(os.open(stdout,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as out,os.fdopen(os.open(stderr,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as err:
            # A trusted gate keeps the leader alive until its exact ownership is
            # durable; stop/pause cannot race a not-yet-registered child launch.
            with self.lock('control',True):
                if self.control()['mode'] in {'paused','emergency_stop','approval_required'}: return {'success':False,'interrupted':True}
                process=subprocess.Popen([sys.executable,'-c',CHILD_WRAPPER,*command],stdin=subprocess.PIPE,stdout=out,stderr=err,cwd=snapshot,env=env,start_new_session=True)
                identity=process_identity(process.pid)
                if not identity:
                    process.stdin.close();process.wait(timeout=3);raise SafetyError('Cannot establish child ownership; execution refused.')
                atomic_json(self.run_path,{'task_id':task['id'],'run_id':run_id,'controller':process_identity(os.getpid()),'child':identity,'started_at':stamp()})
            interrupted=False;timed_out=False
            try:
                process.stdin.write(b'G'+prompt.encode());process.stdin.close()
                while process.poll() is None:
                    interrupted=self.control()['mode'] in {'paused','emergency_stop','approval_required'}
                    timed_out=time.monotonic()-started>timeout or stdout.stat().st_size+stderr.stat().st_size>8*1024*1024
                    if interrupted or timed_out: terminate_group(identity);break
                    time.sleep(0.1)
                process.wait(timeout=3)
            finally:
                terminate_group(identity)
                if process.poll() is None: process.wait(timeout=3)
        usage={};limited=False
        for line in stdout.read_text(errors='replace').splitlines():
            try:
                event=json.loads(line)
                if event.get('type')=='turn.completed': usage={key:value for key,value in event.get('usage',{}).items() if isinstance(value,int)}
                text=json.dumps(event).lower()
                if any(value in text for value in ('usage_limit_reached','rate_limit_exceeded','usage limit reached','hit your usage limit')): limited=True
            except json.JSONDecodeError: pass
        if limited or interrupted: return {'success':False,'usage_limit':limited,'interrupted':interrupted,'elapsed_seconds':time.monotonic()-started,'usage':usage}
        if timed_out or process.returncode or not last.exists(): return {'success':False,'failure':'Bounded Codex result unavailable.','elapsed_seconds':time.monotonic()-started}
        if last.stat().st_size>128*1024: raise SafetyError('Unbounded structured result.')
        result=read_json(last);validate_review_result(result,task['id'],files)
        return {'success':True,'result_path':str(last),'elapsed_seconds':time.monotonic()-started,'usage':usage}
