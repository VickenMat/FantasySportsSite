"""Bounded worktree specialist -> local checks -> independent review -> sole integration authority.

No database client, arbitrary shell, inferred product approval or credential copy.
Private checkpoints are durable before each phase. Models cannot reach Git's common
metadata or the owner queue; only this trusted controller can integrate and push.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid
from engine import (Engine,SafetyError,BusyError,authorize,atomic_json,read_json,task_fingerprint,
                    fingerprint,child_environment,now,stamp,parse_time,native_telemetry,
                    process_identity,owned_group_members,terminate_group,CHILD_WRAPPER,ID)

from development_activation import CONFIGURATION
BUDGETS=CONFIGURATION['budgets']
DAILY_MODELS=CONFIGURATION['daily_model_launch_limit']
# These paths never become model writable even if a queue claims otherwise.
PROTECTED=('data/','Datasets/','.git','.codex/','.automation/','prisma/','src/scoring/','src/server/score-ledger.ts','src/server/score-administration.ts','src/server/competition-scoring.ts','src/simulation/scoring.ts','src/workers/recalculate-score.ts',
           'docs/automation/','control-center/','scripts/automation/',
           'scripts/automation/engine.py','scripts/automation/orchestrator.py',
           'scripts/automation/writable_sandbox.py','scripts/automation/prepare_activation.py',
           'AGENTS.md','PROJECT_STATUS.md','docs/AUTHORIZATION_POLICY.md','docs/DECISION_LOG.md',
           'docs/M4_MASTER','docs/M6_MASTER','docs/M6_APPROVED','package.json','package-lock.json')

class UsageUnavailable(SafetyError): pass
class Interrupted(SafetyError): pass


def safe_output(name):
    if not isinstance(name,str):raise SafetyError('Output path must be text.')
    p=Path(name)
    if any(part.startswith('.agent-output') or part in {'.agent-review.json','.agent-review.diff'} for part in p.parts):raise SafetyError('Controller scratch/review artifacts are reserved.')
    if not name or p.is_absolute() or any(x in {'..','.'} for x in p.parts) or '\\' in name or not re.fullmatch(r'[A-Za-z0-9_./-]+',name):raise SafetyError('Unsafe output path.')
    if any(name==x.rstrip('/') or name.startswith(x) for x in PROTECTED) or any(x.startswith('.env') or x in {'.ssh','.aws','.git','node_modules'} for x in p.parts):raise SafetyError('Protected output path.')
    if p.suffix not in {'.py','.ts','.tsx','.js','.mjs','.json','.md','.css','.txt'}:raise SafetyError('Only reviewed source/report formats may be integrated.')
    return name


def validate_development(value):
    if not isinstance(value,dict) or set(value)!={'writable_paths','datasets','checks','budget_kind','model_seconds','test_seconds','push'}:raise SafetyError('Exact development profile required.')
    paths=value['writable_paths']
    if not isinstance(paths,list) or not 1<=len(paths)<=40 or not all(isinstance(p,str) for p in paths) or len(set(paths))!=len(paths):raise SafetyError('Bounded explicit output files required.')
    for p in paths:safe_output(p)
    if not isinstance(value['budget_kind'],str) or value['budget_kind'] not in BUDGETS or value['budget_kind']=='local':raise SafetyError('Invalid model budget kind.')
    for field,maximum in [('model_seconds',BUDGETS[value['budget_kind']]),('test_seconds',BUDGETS['local'])]:
        if type(value[field]) is not int or not 5<=value[field]<=maximum:raise SafetyError('Task execution budget exceeded.')
    if type(value['push']) is not bool:raise SafetyError('Explicit push policy required.')
    if not isinstance(value['datasets'],list) or len(value['datasets'])>80:raise SafetyError('Bounded read-only data grants required.')
    for d in value['datasets']:
        if not isinstance(d,dict) or set(d)!={'path','sha256'} or not isinstance(d.get('path'),str) or not isinstance(d.get('sha256'),str) or not re.fullmatch(r'data/[A-Za-z0-9_./-]+',d['path']) or '..' in Path(d['path']).parts or not re.fullmatch('[a-f0-9]{64}',d['sha256']):raise SafetyError('Exact read-only dataset fingerprint required.')
    if not isinstance(value['checks'],list) or not 1<=len(value['checks'])<=8:raise SafetyError('Task-specific checks required.')
    for c in value['checks']:
        if not isinstance(c,dict) or set(c)!={'kind','path'} or not isinstance(c.get('kind'),str) or c['kind'] not in {'python_unittest','python_script','node_test'}:raise SafetyError('Unsupported local check; arbitrary shell is unavailable.')
        safe_output(c['path'])
    return value


def result_schema(task,phase):
    props={'task_id':{'const':task['id']},'summary':{'type':'string'},'requires_owner_decision':{'type':'boolean'}}
    if phase=='implementation':props['changed_files']={'type':'array','items':{'type':'string','enum':task['development']['writable_paths']}}
    else:props.update(verdict={'enum':['accept','changes_requested','blocked']},findings={'type':'array','items':{'type':'string'}})
    return {'type':'object','additionalProperties':False,'properties':props,'required':list(props)}


def validate_result(result,task,phase):
    schema=result_schema(task,phase)
    if not isinstance(result,dict) or set(result)!=set(schema['required']) or result.get('task_id')!=task['id'] or not isinstance(result.get('summary'),str) or type(result.get('requires_owner_decision')) is not bool:raise SafetyError('Invalid specialist result.')
    if phase=='implementation':
        files=result.get('changed_files')
        if not isinstance(files,list) or not all(isinstance(x,str) and x in task['development']['writable_paths'] for x in files):raise SafetyError('Invalid claimed changes.')
    elif result.get('verdict') not in {'accept','changes_requested','blocked'} or not isinstance(result.get('findings'),list) or not all(isinstance(x,str) for x in result['findings']):raise SafetyError('Invalid independent verdict.')
    return result


class DevEngine(Engine):
    def profile(self):
        return {'available':True,'maxTasks':2,'maxSpecialists':3,'execution':'serial specialist stages, isolated worktrees','budgets':BUDGETS,'dailyModelLaunchLimit':DAILY_MODELS,'automaticReview':True,'automaticIntegration':True}
    def activation_plan(self,approval_id='DEV-ACTIVATION-001'):
        from development_activation import development_activation_plan
        if approval_id!='DEV-ACTIVATION-001':raise SafetyError('Development proposal ID differs.')
        return development_activation_plan(self)
    def policy(self,task,validate_data=True):
        denied,reason=authorize(task,self.approvals())
        if denied:raise SafetyError(reason)
        if task['execution_kind']!='writable_implementation' or not {'implement','run_tests'}.issubset(task['authorization_scope']['actions']):raise SafetyError('Explicit writable implementation/test scope required.')
        value=validate_development(task.get('development'))
        grant=read_json(self.owner_root/'docs/automation/DEVELOPMENT_TASKS.json')
        if grant.get('version')!=1 or grant.get('tasks',{}).get(task['id'])!={'task_fingerprint':task_fingerprint(task),'development':value}:raise SafetyError('Task lacks unchanged exact owner-maintained development grant.')
        for item in value['datasets'] if validate_data else []:
            source=self.owner_root/item['path']
            if not source.is_file() or source.is_symlink() or not source.resolve().is_relative_to(self.owner_root/'data') or hashlib.file_digest(source.open('rb'),'sha256').hexdigest()!=item['sha256']:raise SafetyError('Dataset grant missing or changed.')
        return value
    def guard(self,task=None):
        control=self.control();mode=control.get('mode')
        queue_mode=self.queue().get('mode','assisted')
        if mode in {'paused','emergency_stop','approval_required','manual'} or queue_mode in {'paused','emergency_stop','approval_required','manual'}:raise Interrupted('Persistent owner control prevents further phases.')
        if queue_mode not in {'assisted','development_autonomous'}:raise SafetyError('Queue mode is not authorized for development.')
        if mode=='development_autonomous':
            from development_activation import verify_armed
            verify_armed(self)
        elif mode!='assisted' or queue_mode not in {'assisted','development_autonomous'}:raise SafetyError('Only explicit assisted or armed development execution is permitted.')
        if task:
            current=next((x for x in self.queue()['tasks'] if x['id']==task['id']),None)
            if not current or task_fingerprint(current)!=task_fingerprint(task):raise SafetyError('Task definition changed during execution.')
            self.policy(current,validate_data=False)
    def reserve_model(self,state):
        recent=[s for s in state['executions'] if parse_time(s)>now()-dt.timedelta(days=1)]
        if len(recent)>=DAILY_MODELS:raise UsageUnavailable('Rolling model-launch ceiling reached; no reset or inference polling.')
        state['executions']=recent+[stamp()];self.save(state)
    def worktree_create(self,task,row):
        # A real linked Git worktree; models are denied its .git file/common dir.
        branch=f"automation/dev-{task['id']}-{task_fingerprint(task)[:10]}-{row['attempt_count']}"
        destination=self.runtime/'worktrees'/branch.split('/')[-1]
        if destination.exists():raise SafetyError('Stale worktree preserved; explicit checkpoint recovery required.')
        tracked=self.git('ls-tree','-r','--name-only','HEAD').decode().splitlines()
        if any((p.startswith('.codex/') and not(p.startswith('.codex/agents/') and p.endswith('.toml'))) or p.startswith('.agents/') or p in {'.mcp.json','mcp.json'} for p in tracked):raise SafetyError('Unreviewed project agent/hook/MCP configuration cannot enter execution.')
        if any(p.startswith(('data/','Datasets/','.automation/')) or any(x=='.env' or x.startswith('.env.') and x!='.env.example' for x in Path(p).parts) for p in tracked):raise SafetyError('Tracked sensitive inputs cannot enter agent checkout.')
        links=self.git('ls-tree','-r','HEAD').decode().splitlines()
        if any(line.startswith(('120000','160000')) for line in links):raise SafetyError('Symlinks/submodules require separate review.')
        destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        self.git('worktree','add','-b',branch,str(destination),'HEAD')
        (destination/'.agent-output').mkdir(mode=0o700)
        for name in task['development']['writable_paths']:(destination/name).parent.mkdir(parents=True,exist_ok=True)
        row.update(worktree_path=str(destination),branch=branch,base_commit=self.git('rev-parse','HEAD').decode().strip());return destination
    def changes(self,task,tree):
        # Include all untracked files; ignore only controller scratch and Python cache.
        status=self.git('status','--porcelain=v1','-z','--untracked-files=all',cwd=tree)
        names=[]
        parts=status.decode().split('\0');i=0
        while i<len(parts):
            item=parts[i];i+=1
            if not item:continue
            code,name=item[:2],item[3:]
            if 'R' in code or 'C' in code:raise SafetyError('Rename/copy integration requires explicit follow-up.')
            if name.startswith('.agent-output/') or name in {'.agent-review.json','.agent-review.diff'} or '__pycache__' in Path(name).parts:continue
            safe_output(name)
            if name not in task['development']['writable_paths']:raise SafetyError('Change outside exact output grant.')
            p=tree/name
            if p.is_symlink() or not p.is_file() or p.stat().st_size>1024*1024:raise SafetyError('Missing, oversized or unsafe generated source.')
            if any(parent.is_symlink() for parent in p.parents if parent!=tree):raise SafetyError('Output parent cannot be a symlink.')
            names.append(name)
        if not names:raise SafetyError('No implementation change to verify.')
        if sum((tree/p).stat().st_size for p in names)>4*1024*1024:raise SafetyError('Integration output budget exceeded.')
        return sorted(names)
    def quota_check(self):
        # Reuse documented metadata-only RPC collector; never start a model turn.
        previous=read_json(self.runtime/'development-quota.json',{})
        if previous.get('retry_after') and parse_time(previous['retry_after'])>now():raise UsageUnavailable('Bounded subscription recovery backoff remains active.')
        code="import {probeSubscription} from './control-center/telemetry.ts'; console.log(JSON.stringify(await probeSubscription()));"
        result=subprocess.run(['/opt/homebrew/bin/node','--input-type=module','-e',code],cwd=self.owner_root,env=child_environment(),capture_output=True,text=True,timeout=12)
        try:quota=json.loads(result.stdout)
        except ValueError:quota={}
        previous=read_json(self.runtime/'development-quota.json',{})
        if not quota.get('available') or quota.get('authenticationMethod')!='chatgpt':
            failures=min(previous.get('failures',0)+1,3)
            atomic_json(self.runtime/'development-quota.json',{'available':False,'failures':failures,'retry_after':stamp(now()+dt.timedelta(seconds=60*2**failures))})
            raise UsageUnavailable('Subscription availability unavailable; bounded metadata recovery required.')
        blocked=[w for w in [quota.get('primary'),quota.get('secondary')] if w and w.get('usedPercent',0)>=100]
        atomic_json(self.runtime/'development-quota.json',{'available':True,'failures':0,'checked_at':stamp(),'blocked':bool(blocked),'windows':[{k:w.get(k) for k in ['usedPercent','windowMinutes','resetAt']} for w in blocked]})
        if blocked:raise UsageUnavailable('Supported subscription window exhausted.')
    def model(self,task,tree,phase,run_id,timeout,findings=None):
        from writable_sandbox import sandbox_probe
        self.quota_check()
        directory=self.runtime/'runs'/run_id;directory.mkdir(parents=True,mode=0o700)
        binary=Path('/opt/homebrew/bin/codex');env=child_environment()
        auth=subprocess.run([str(binary),'login','status'],env=env,capture_output=True,text=True,timeout=10)
        if auth.returncode or 'chatgpt' not in (auth.stdout+auth.stderr).lower():raise UsageUnavailable('Existing ChatGPT authentication unavailable; no paid fallback.')
        datasets=[self.owner_root/d['path'] for d in task['development']['datasets']]
        if (self.owner_root/'node_modules').is_dir():datasets.append(self.owner_root/'node_modules')
        permissions=sandbox_probe(binary,self.owner_root,tree,[*task['development']['writable_paths'],'.agent-output'],datasets,directory,env,review=phase=='review')
        schema=directory/'output-schema.json';atomic_json(schema,result_schema(task,phase));last=directory/'last-message.json'
        flags=permissions['flags']
        command=[str(binary),'-a','never','exec','--ignore-user-config','--json','--color','never',*flags,'-c','features.apps=false','-c','features.plugins=false','-c','web_search="disabled"','-c','features.multi_agent=false','-c','features.multi_agent_v2=false','-C',str(tree),'--output-schema',str(schema),'-o',str(last),'-']
        role='independent_reviewer' if phase=='review' else task['assigned_role']
        prompt={'task_id':task['id'],'role':role,'phase':phase,'task':task['description'],'acceptance_criteria':task['acceptance_criteria'],'permitted_outputs':task['development']['writable_paths'],'read_only_datasets':[str(x) for x in datasets if x.name!='node_modules'],'review_findings':findings or [],'instructions':('Review the trusted .agent-review.diff/files and .agent-review.json local check receipt independently. Do not modify files. Accept only supported ordinary code correctness; flag product decisions as requires_owner_decision. Never authorize a milestone or restricted action.' if phase=='review' else 'Implement only the exact authorized files. Read relevant installed guides if Next code. Do not run git, network, databases, package installation, credentials, migrations, backfills or scheduling. Tests run separately by the controller; implement meaningful tests required by the task. Do not broaden scope. Preserve unknown evidence. Return exact structured result.')}
        out=directory/'events.jsonl';err=directory/'stderr.log';started=time.monotonic()
        with out.open('xb') as stdout,err.open('xb') as stderr:
            self.run_process(command,tree,env,json.dumps(prompt).encode(),stdout,stderr,timeout,task,run_id,phase)
        data=native_telemetry(out)
        raw=out.read_text(errors='replace').lower()
        if any(s in raw for s in ['usage_limit_reached','rate_limit_exceeded','hit your usage limit']):raise UsageUnavailable('Codex reported exhausted allowance.')
        if not data['turn_completed'] or not data['session_id'] or not last.is_file() or last.stat().st_size>128*1024:raise SafetyError('No bounded completed structured specialist result.')
        return validate_result(read_json(last),task,'implementation' if phase=='implementation' else 'review')
    def run_process(self,command,tree,env,body,stdout,stderr,timeout,task,run_id,phase):
        self.guard(task)
        with self.lock('control',True):
            if self.control()['mode'] in {'paused','emergency_stop','approval_required'}:raise Interrupted('Owner paused execution.')
            process=subprocess.Popen([sys.executable,'-c',CHILD_WRAPPER,*command],stdin=subprocess.PIPE,stdout=stdout,stderr=stderr,cwd=tree,env=env,start_new_session=True)
            identity=process_identity(process.pid)
            if not identity:
                process.stdin.close();process.wait(timeout=3);raise SafetyError('Cannot verify subprocess ownership.')
            atomic_json(self.run_path,{'task_id':task['id'],'run_id':run_id,'controller':process_identity(os.getpid()),'child':identity,'phase':phase,'worktree_path':str(tree),'started_at':stamp()})
        started=time.monotonic()
        try:
            process.stdin.write(b'G'+body);process.stdin.close()
            while process.poll() is None:
                self.guard(task)
                if time.monotonic()-started>timeout:raise SafetyError('Task phase deadline exceeded; preserve checkpoint.')
                if stdout.tell()+stderr.tell()>8*1024*1024:raise SafetyError('Phase log size exceeded.')
                time.sleep(.5)
            if process.returncode:raise SafetyError('Bounded local process failed.')
        finally:
            terminate_group(identity)
            if process.poll() is None:process.wait(timeout=3)
            if not owned_group_members(identity):self.run_path.unlink(missing_ok=True)
    def checks(self,task,tree,row,state):
        from writable_sandbox import permission_flags
        profile=task['development'];run_id=uuid.uuid4().hex;directory=self.runtime/'runs'/run_id;directory.mkdir(mode=0o700,parents=True)
        datasets=[self.owner_root/d['path'] for d in profile['datasets']]
        flags=permission_flags(self.owner_root,tree,['.agent-output'],datasets)
        env={**child_environment(),'PYTHONDONTWRITEBYTECODE':'1','TMPDIR':str(tree/'.agent-output')}
        results=[]
        deadline=time.monotonic()+profile['test_seconds']
        for index,check in enumerate(profile['checks']):
            self.guard(task)
            path=tree/check['path']
            if path.is_symlink() or not path.is_file():raise SafetyError('Local check target missing or unsafe.')
            if check['kind']=='python_unittest':args=[str(Path(sys.executable).resolve()),'-B','-I','-m','unittest','discover','-s',str(path.parent),'-p',path.name]
            elif check['kind']=='python_script':args=[str(Path(sys.executable).resolve()),'-B','-I',str(path)]
            else:args=['/opt/homebrew/bin/node','--test',str(path)]
            command=['/opt/homebrew/bin/codex','sandbox','-P','automation-worktree','-C',str(tree),*flags,'--',*args]
            remaining=deadline-time.monotonic()
            if remaining<=0:raise SafetyError('Total local-check budget exhausted.')
            check_started=time.monotonic()
            with (directory/f'check-{index}.out').open('xb') as out,(directory/f'check-{index}.err').open('xb') as err:
                self.run_process(command,tree,env,b'',out,err,remaining,task,run_id,'testing')
            results.append({'elapsedSeconds':time.monotonic()-check_started,'kind':check['kind'],'path':check['path'],'exitCode':0,'stdoutSha256':hashlib.sha256((directory/f'check-{index}.out').read_bytes()).hexdigest(),'stderrSha256':hashlib.sha256((directory/f'check-{index}.err').read_bytes()).hexdigest()})
        return results
    def phase(self,task,row,state,tree,phase,executor=None,findings=None):
        self.guard(task);self.policy(task)
        if shutil.disk_usage(self.runtime).free<512*1024*1024:raise SafetyError('Insufficient local checkpoint disk space.')
        run_id=uuid.uuid4().hex;row.update(status='running',phase=phase,run_id=run_id,phase_started_at=stamp());self.save(state);self.event('development_phase_started',task_id=task['id'],run_id=run_id,phase=phase)
        self.reserve_model(state);started=time.monotonic()
        try:return validate_result((executor or self.model)(task,tree,phase,run_id,min(task['development']['model_seconds'],BUDGETS['review']) if phase=='review' else task['development']['model_seconds'],findings),task,'implementation' if phase=='implementation' else 'review')
        finally:
            telemetry=native_telemetry(self.runtime/'runs'/run_id/'events.jsonl')
            entry={'run_id':run_id,'phase':phase,'role':'independent_reviewer' if phase=='review' else task['assigned_role'],'session_id':telemetry['session_id'],'usage':telemetry['usage'],'elapsed_seconds':time.monotonic()-started,'native_turn_completed':telemetry['turn_completed'],'native_log_truncated':telemetry['log_truncated']}
            row.setdefault('execution_history',[]).append(entry);row.update(session_id=telemetry['session_id'],usage=telemetry['usage'],elapsed_seconds=entry['elapsed_seconds']);self.save(state)
    def integrate(self,task,tree,row,state,context):
        self.guard(task);names=self.changes(task,tree)
        actual=fingerprint({n:hashlib.sha256((tree/n).read_bytes()).hexdigest() for n in names})
        if row.get('verification',{}).get('output_fingerprint')!=actual:raise SafetyError('Reviewed output changed before integration.')
        if self.repository_context()!=context or self.git('status','--porcelain').strip():raise SafetyError('Primary checkout changed or dirty; preserve branch for conflict review.')
        # Tests/reviewer cannot update the index/common Git dir; trusted controller does.
        self.git('add','--',*names,cwd=tree);self.git('diff','--cached','--check',cwd=tree)
        staged=self.git('diff','--cached','--name-only',cwd=tree).decode().splitlines()
        if set(staged)!=set(names):raise SafetyError('Staged scope differs from verified output files.')
        self.git('-c','commit.gpgsign=false','-c','user.name=Fantasy Evolution Automation','-c','user.email=automation@fantasyevolution.invalid','commit','-m',f"feat(automation-task): {task['id']} verified implementation",cwd=tree)
        commit=self.git('rev-parse','HEAD',cwd=tree).decode().strip();row.update(phase='integrating',integration_commit=commit);self.save(state)
        self.guard(task)
        if self.git('rev-parse','HEAD').decode().strip()!=row['base_commit'] or self.git('status','--porcelain').strip():raise SafetyError('Integration conflict: main no longer at exact clean base.')
        self.git('merge','--ff-only','--no-edit',row['branch'])
        row.update(associated_commit=commit,integration_complete=True,push_pending=task['development']['push']);self.save(state)
        if task['development']['push']:self.push_verified(row,state)
        return commit
    def push_verified(self,row,state):
        self.guard()
        branch=self.git('branch','--show-current').decode().strip();remote=self.git('remote','get-url','origin').decode().strip()
        if branch!='main' or remote not in {'https://github.com/VickenMat/FantasySportsSite.git','git@github.com:VickenMat/FantasySportsSite.git'}:raise SafetyError('Push only to configured authorized main/upstream; no alternate remotes.')
        for attempt in range(3):
            self.guard()
            try:self.git('-c','credential.helper=osxkeychain','push','origin','main');break
            except SafetyError:
                if attempt==2:raise
                time.sleep(2**attempt)
        row['push_pending']=False;self.save(state)
    def recover_usage(self,state):
        affected=[(key,row) for key,row in state['tasks'].items() if row.get('blocker_classification')=='USAGE_LIMIT_REQUIRES_SUPPORTED_RECOVERY' and row.get('attempt_count',0)<3]
        if not affected:return
        self.quota_check()
        for key,row in affected:
            task=next((x for x in self.queue()['tasks'] if x['id']==key),None)
            if not task or row.get('definition_fingerprint')!=task_fingerprint(task):continue
            self.policy(task);tree=Path(row['worktree_path']) if row.get('worktree_path') else None
            modified=False
            if tree and tree.is_dir():
                try:self.changes(task,tree);modified=True
                except SafetyError:
                    # A clean pre-model checkpoint may be retried fresh; a scope
                    # violation must stay blocked for exact human inspection.
                    if self.git('status','--porcelain',cwd=tree).strip():continue
            row.update(status='ready',resume_checkpoint=modified,blocker_classification=None)
        self.save(state)
    def retry_pending_pushes(self,state,max_tasks):
        recovered=[]
        for key,row in state['tasks'].items():
            if len(recovered)>=max_tasks:break
            if not(row.get('integration_complete') and row.get('push_pending')):continue
            task=next((x for x in self.queue()['tasks'] if x['id']==key),None)
            if not task or row.get('definition_fingerprint')!=task_fingerprint(task):continue
            self.guard(task)
            if self.git('rev-parse','HEAD').decode().strip()!=row.get('integration_commit') or self.git('status','--porcelain').strip():continue
            try:self.push_verified(row,state)
            except SafetyError:continue
            gated=key in {'M61-INVENTORY-002','M61-COMPLETION-003','M62-PARTICIPATION-004','M62-NHL-STATS-005','M61-ACCEPT-006','M63-BASELINE-007','M63-ACCEPT-008'}
            row.update(status='verification' if gated else 'completed',phase='completed',blocker_classification='HISTORICAL_EVIDENCE_ACCEPTANCE_REQUIRED' if gated else None)
            self.save(state);recovered.append({'id':key,'status':row['status'],'recovered':'verified_pending_push_only','commit':row['integration_commit']})
        return recovered
    def recover_development(self,state):
        active=read_json(self.run_path,{})
        if active.get('child') and owned_group_members(active['child']):raise BusyError('An exact owned group is still running; do not duplicate it.')
        for key,row in state['tasks'].items():
            if row.get('development_workflow') and row.get('status')=='running':
                # Do not replay arbitrary commands/session IDs. Keep branch+diff and
                # require explicit checkpoint inspection before a fresh scoped attempt.
                row.update(status='blocked',blocker_classification='INTERRUPTED_CHECKPOINT_REVIEW_REQUIRED',interrupted_phase=row.get('phase'))
                self.event('development_interrupted',task_id=key)
        if active:self.run_path.unlink(missing_ok=True)
        self.save(state)
    def recover_checkpoint(self,task_id,expected_tree,expected_head):
        if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1':raise SafetyError('Agents cannot accept recovery checkpoints.')
        with self.lock():
            state=self.state();row=state['tasks'].get(task_id,{})
            if row.get('blocker_classification')!='INTERRUPTED_CHECKPOINT_REVIEW_REQUIRED' or row.get('worktree_path')!=expected_tree:raise SafetyError('Exact interrupted checkpoint required.')
            tree=Path(expected_tree)
            if tree.is_symlink() or not tree.resolve().is_relative_to(self.runtime/'worktrees') or self.git('rev-parse','HEAD',cwd=tree).decode().strip()!=expected_head:raise SafetyError('Checkpoint changed; no recovery.')
            task=next(x for x in self.queue()['tasks'] if x['id']==task_id);self.policy(task)
            if row.get('definition_fingerprint')!=task_fingerprint(task):raise SafetyError('Recovery scope changed.')
            row.update(status='ready',resume_checkpoint=True,blocker_classification=None);self.save(state);return {'task_id':task_id,'status':'ready','preservedWorktree':True}
    def develop(self,execute=False,max_tasks=2,executor=None,checker=None,integrator=None):
        if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1':raise SafetyError('Managed specialists cannot operate the integration authority.')
        if type(max_tasks) is not int or not 1<=max_tasks<=2:raise SafetyError('At most two bounded continuations per cycle.')
        with self.lock():
            self.guard();state=self.state();self.recover_development(state);results=[]
            if not execute:return {'dry_run':True,'candidates':[r['id'] for r in self.ready(self.queue(),state) if r['execution_kind']=='writable_implementation'],'profile':self.profile()}
            self.recover_usage(state)
            results.extend(self.retry_pending_pushes(state,max_tasks))
            for _ in range(max_tasks-len(results)):
                self.guard();queue=self.queue();candidates=self.ready(queue,state);selected=None
                # Dependencies are re-evaluated after every integration, not frozen at start.
                for row in candidates:
                    if row['execution_kind']!='writable_implementation':continue
                    task=next(t for t in queue['tasks'] if t['id']==row['id'])
                    try:self.policy(task)
                    except SafetyError as error:
                        target=state['tasks'].setdefault(task['id'],{});target.update(status='approval_required' if authorize(task,self.approvals())[0]=='approval_required' else 'blocked',definition_fingerprint=task_fingerprint(task),blocker_classification='DEVELOPMENT_SCOPE_REQUIRES_REVIEW');self.save(state);continue
                    selected=task;break
                if selected is None:break
                task=selected;row=state['tasks'].setdefault(task['id'],{});context=self.repository_context()
                if self.git('status','--porcelain').strip():raise SafetyError('Dirty primary checkout; no claim or integration.')
                resume=row.pop('resume_checkpoint',False)
                row.update(development_workflow=True,definition_fingerprint=task_fingerprint(task),status='running',phase='claim',attempt_count=row.get('attempt_count',task.get('attempt_count',0))+1,last_execution_time=stamp(),associated_commit=context['commit'],blocker_classification=None)
                self.save(state);self.event('task_claimed',task_id=task['id'],attempt=row['attempt_count'])
                try:
                    tree=Path(row['worktree_path']) if resume else self.worktree_create(task,row);self.save(state)
                    if resume:self.changes(task,tree)
                    feedback=None
                    for revision in range(2):
                        result=self.phase(task,row,state,tree,'implementation',executor,feedback)
                        if result['requires_owner_decision']:raise SafetyError('Implementation reports an unresolved owner decision.')
                        names=self.changes(task,tree)
                        pinned=fingerprint({n:hashlib.sha256((tree/n).read_bytes()).hexdigest() for n in names})
                        row.update(phase='testing');self.save(state)
                        checks=(checker or self.checks)(task,tree,row,state)
                        if not checks or any(c.get('exitCode')!=0 for c in checks):raise SafetyError('Local acceptance checks failed.')
                        if self.changes(task,tree)!=names or fingerprint({n:hashlib.sha256((tree/n).read_bytes()).hexdigest() for n in names})!=pinned:raise SafetyError('Implementation changed during local checks.')
                        import difflib
                        patches=[]
                        for name in names:
                            try:old=self.git('show','HEAD:'+name,cwd=tree).decode().splitlines(keepends=True)
                            except SafetyError:old=[]
                            patches.extend(difflib.unified_diff(old,(tree/name).read_text().splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name))
                        (tree/'.agent-review.diff').write_text(''.join(patches))
                        atomic_json(tree/'.agent-review.json',{'task_id':task['id'],'base_commit':row['base_commit'],'changed_files':names,'output_fingerprint':pinned,'diff_file':'.agent-review.diff','checks':checks,'acceptance_criteria':task['acceptance_criteria'],'revision':revision})
                        review=self.phase(task,row,state,tree,'review',executor)
                        if self.changes(task,tree)!=names or fingerprint({n:hashlib.sha256((tree/n).read_bytes()).hexdigest() for n in names})!=pinned:raise SafetyError('Implementation changed during independent review.')
                        if review['requires_owner_decision'] or review['verdict']=='blocked':raise SafetyError('Independent review requires owner/evidence resolution.')
                        if review['verdict']=='accept':break
                        feedback=review['findings']
                    else:raise SafetyError('Bounded independent review findings remain unresolved.')
                    implementation=next(x for x in reversed(row['execution_history'][:-1]) if x['phase']=='implementation')
                    independent=row['execution_history'][-1]
                    distinct=implementation['run_id']!=independent['run_id'] and independent['role']=='independent_reviewer' and (not implementation['session_id'] or implementation['session_id']!=independent['session_id'])
                    if not distinct:raise SafetyError('Independent reviewer identity differs from implementation required.')
                    row['verification']={'checks':checks,'review_run_id':row['run_id'],'review_verdict':'accept','revision':revision,'output_fingerprint':pinned,'implementation_run_id':implementation['run_id'],'review_session_id':independent['session_id'],'implementation_session_id':implementation['session_id'],'reviewer_distinct':distinct}
                    row.update(phase='integrating');self.save(state)
                    commit=(integrator or self.integrate)(task,tree,row,state,context)
                    gated=task['id'] in {'M61-INVENTORY-002','M61-COMPLETION-003','M62-PARTICIPATION-004','M62-NHL-STATS-005','M61-ACCEPT-006','M63-BASELINE-007','M63-ACCEPT-008'}
                    row.update(status='verification' if gated else 'completed',phase='completed',blocker_classification='HISTORICAL_EVIDENCE_ACCEPTANCE_REQUIRED' if gated else None,associated_commit=commit);self.save(state);self.event('development_completed',task_id=task['id'],status=row['status'])
                except UsageUnavailable:
                    row.update(status='blocked',blocker_classification='USAGE_LIMIT_REQUIRES_SUPPORTED_RECOVERY')
                    atomic_json(self.control_path,{'version':1,'mode':'paused','reason':'CODEX_USAGE_LIMIT','updated_at':stamp()});self.save(state)
                except Interrupted:
                    row.update(status='blocked',blocker_classification='INTERRUPTED_CHECKPOINT_REVIEW_REQUIRED');self.save(state)
                except (SafetyError,OSError,subprocess.SubprocessError) as error:
                    row.update(status='blocked',blocker_classification='PUSH_RETRY_REQUIRED' if row.get('integration_complete') else 'FAILED_IMPLEMENTATION_REVIEW_OR_CONFLICT',last_error=type(error).__name__);self.save(state)
                results.append({'id':task['id'],'status':row['status'],'reason':row.get('blocker_classification'),'commit':row.get('associated_commit')})
                if self.control()['mode'] in {'paused','emergency_stop','approval_required'}:break
            return {'executed':len(results),'results':results,'mode':self.control()['mode']}
