import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import hashlib
import plistlib
from unittest import mock

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/automation'))
from engine import Engine,SafetyError,BusyError,atomic_json,authorize,approval_valid,task_fingerprint,child_environment,process_identity,terminate_group,owned_group_members,permission_flags,CHILD_WRAPPER,stamp,now,validate_queue,review_output_schema,validate_review_result,native_telemetry,fingerprint

def task(key='REVIEW-1',**changes):
    return {'id':key,'title':'Read project memory','description':'Harmless fixture review','milestone':'AUTOMATION','priority':1,'dependencies':[],'assigned_role':'independent_reviewer','authorization_scope':{'actions':['read_files','review_code'],'target_fingerprint':None,'approval_id':None},'execution_kind':'read_only_review','expected_deliverable':'A bounded evidence summary','acceptance_criteria':['No false completion claims'],'status':'ready','attempt_count':0,'last_execution_time':None,'associated_commit':None,'blocker_classification':None,**changes}

class AutomationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.repo=(Path(self.temp.name)/'repo').resolve();self.repo.mkdir()
        self.environment=mock.patch.dict(os.environ,{'AUTOMATION_AGENT_CONTEXT':'0'});self.environment.start()
        self.git('init','--quiet');(self.repo/'.gitignore').write_text('.automation/\n.env\ndata/\n');(self.repo/'AGENTS.md').write_text('Fixture read-only memory');(self.repo/'main.txt').write_text('original')
        self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','fixture')
        self.queue_path=self.repo/'queue.json';self.approvals=self.repo/'approvals.json';self.write_queue([task()]);atomic_json(self.approvals,{'version':1,'approvals':[]})
        self.engine=Engine(self.repo,queue=self.queue_path,approvals=self.approvals)
        self.snapshots=[]
    def tearDown(self):
        import shutil
        for path in self.snapshots:shutil.rmtree(path,ignore_errors=True)
        self.environment.stop();self.temp.cleanup()
    def git(self,*args):return subprocess.run(['/usr/bin/git','-c','core.hooksPath=/dev/null',*args],cwd=self.repo,capture_output=True,check=True).stdout
    def write_queue(self,tasks,**options):atomic_json(self.queue_path,{'version':1,'mode':'assisted','max_specialists':3,'tasks':tasks,**options})
    def success(self,task,snapshot,files,run_id,timeout,codex):
        self.snapshots.append(snapshot);result=self.engine.runtime/'test-result.json';atomic_json(result,{'summary':'fixture'})
        return {'success':True,'result_path':str(result),'usage':{'output_tokens':1}}
    def test_duplicate_task_ids_and_dependency_cycles_are_rejected(self):
        with self.assertRaises(SafetyError):validate_queue({'version':1,'tasks':[task(),task()]})
        with self.assertRaises(SafetyError):validate_queue({'version':1,'tasks':[task('A',dependencies=['B']),task('B',dependencies=['A'])]})
    def test_concurrent_orchestrator_and_runtime_override_refused(self):
        with self.engine.lock():
            with self.assertRaises(BusyError):Engine(self.repo,queue=self.queue_path).cycle()
        with self.assertRaises(SafetyError):Engine(self.repo,runtime=self.repo/'different-runtime')
    def test_duplicate_claim_refused_and_results_require_independent_review(self):
        self.engine.cycle(True,executor=self.success);again=self.engine.cycle(True,executor=self.success)
        row=self.engine.status()['tasks'][0]
        self.assertEqual(row['status'],'verification');self.assertFalse(row['review_handoff']['self_completion_allowed']);self.assertEqual(row['review_handoff']['assigned_role'],'independent_reviewer');self.assertEqual(row['attempt_count'],1);self.assertEqual(again['results'],[])
    def test_dependency_order_and_persistent_context(self):
        self.write_queue([task('CHILD',priority=0,dependencies=['PARENT']),task('PARENT',priority=2)])
        plan=self.engine.cycle();self.assertEqual([row['id'] for row in plan['candidates']],['PARENT'])
        self.engine.cycle(True,executor=self.success);restored=Engine(self.repo,queue=self.queue_path,approvals=self.approvals)
        self.assertEqual(restored.status()['tasks'][1]['status'],'verification');self.assertEqual(restored.cycle()['candidates'],[])
    def test_interrupted_task_recovery_keeps_attempt_and_backoff(self):
        atomic_json(self.engine.state_path,{'version':1,'tasks':{'REVIEW-1':{'status':'running','attempt_count':1}},'executions':[]})
        self.engine.cycle();row=self.engine.status()['tasks'][0]
        self.assertEqual(row['status'],'failed');self.assertEqual(row['attempt_count'],1);self.assertIsNotNone(row['next_attempt_at'])
    def test_live_orphan_blocks_recovery_until_owned_stop(self):
        child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],start_new_session=True)
        try:
            identity=process_identity(child.pid);atomic_json(self.engine.run_path,{'child':identity})
            with self.assertRaises(BusyError):self.engine.cycle()
            self.engine.pause(True);child.wait(timeout=3);self.assertEqual(self.engine.control()['mode'],'emergency_stop')
        finally:terminate_group(process_identity(child.pid));child.wait(timeout=3)
    def test_approval_actor_expiry_and_exact_fingerprints(self):
        t=task(authorization_scope={'actions':['apply_migration'],'approval_id':'OWNER-1','target_fingerprint':'a'*64});fp=task_fingerprint(t)
        good={'id':'OWNER-1','status':'approved','scope':['apply_migration'],'target_fingerprint':'a'*64,'task_fingerprint':fp,'expires_at':stamp(now()+dt.timedelta(hours=1)),'decision':{'actor_kind':'human','actor':'project_owner','recorded_at':stamp(now()-dt.timedelta(seconds=1))}}
        self.assertTrue(approval_valid(t['authorization_scope'],fp,['apply_migration'],{'approvals':[good]}))
        for changed in [{**good,'expires_at':stamp(now()-dt.timedelta(seconds=1))},{**good,'target_fingerprint':'b'*64},{**good,'task_fingerprint':'b'*64},{**good,'decision':{**good['decision'],'actor_kind':'agent'}}]:self.assertFalse(approval_valid(t['authorization_scope'],fp,['apply_migration'],{'approvals':[changed]}))
        self.assertEqual(authorize(t,{'approvals':[good]})[0],'verification')
    def test_unauthorized_milestone_and_database_write_rejected(self):
        self.assertEqual(authorize(task(milestone='M7'),{'approvals':[]})[0],'approval_required')
        self.assertEqual(authorize(task(authorization_scope={'actions':['database_write']}),{'approvals':[]})[0],'blocked')
        self.assertEqual(authorize(task(authorization_scope={'actions':['database_reset']}),{'approvals':[]})[0],'blocked')
    def test_block_only_affected_task_and_continue_independent(self):
        self.write_queue([task('DENIED',priority=0,milestone='M7'),task('INDEPENDENT',priority=1)])
        result=self.engine.cycle(True,max_tasks=1,executor=self.success)
        statuses={row['id']:row['status'] for row in self.engine.status()['tasks']}
        self.assertEqual(statuses,{'DENIED':'approval_required','INDEPENDENT':'verification'});self.assertEqual(len(result['results']),2)
    def test_retry_exhaustion_is_persistent(self):
        def fail(*args):raise SafetyError('controlled failure')
        for _ in range(3):
            self.engine.cycle(True,executor=fail);state=self.engine.state();state['tasks']['REVIEW-1']['next_attempt_at']=stamp(now()-dt.timedelta(seconds=1));self.engine.save(state)
        row=self.engine.status()['tasks'][0];self.assertEqual(row['attempt_count'],3);self.assertEqual(row['status'],'blocked');self.assertEqual(row['blocker_classification'],'RETRY_EXHAUSTED');self.assertEqual(self.engine.cycle()['candidates'],[])
    def test_usage_exhaustion_pauses_without_retry(self):
        self.engine.cycle(True,executor=lambda *args:{'usage_limit':True});self.assertEqual(self.engine.control()['mode'],'paused');self.assertTrue(self.engine.cycle()['blocked']);self.assertEqual(self.engine.status()['execution_count'],1)
    def test_pause_stop_acknowledgement_and_agent_controls(self):
        self.engine.pause();self.assertTrue(self.engine.cycle()['blocked']);self.engine.resume();self.assertEqual(self.engine.control()['mode'],'assisted')
        self.engine.pause(True)
        with self.assertRaises(SafetyError):self.engine.resume()
        self.engine.resume(True)
        with mock.patch.dict(os.environ,{'AUTOMATION_AGENT_CONTEXT':'1'}):
            with self.assertRaises(SafetyError):self.engine.resume()
            with self.assertRaises(SafetyError):self.engine.pause()
    def test_unattended_mode_is_not_implicitly_activated(self):
        self.write_queue([task()],mode='autonomous')
        with self.assertRaises(SafetyError):self.engine.cycle(True,executor=self.success)
    def test_child_environment_has_no_database_or_api_credentials(self):
        with mock.patch.dict(os.environ,{'DATABASE_URL':'fixture-not-a-real-url','PGPASSWORD':'fixture','OPENAI_API_KEY':'fixture','NODE_OPTIONS':'fixture'}):
            env=child_environment()
            for name in ['DATABASE_URL','PGPASSWORD','OPENAI_API_KEY','NODE_OPTIONS']:self.assertNotIn(name,env)
            self.assertNotIn(str(self.repo),env['PATH'])
    def test_snapshot_omits_env_data_projectconfig_and_git_remote(self):
        (self.repo/'.env').write_text('fake fixture secret');(self.repo/'data').mkdir();(self.repo/'data/private').write_text('fixture');(self.repo/'.codex').mkdir();(self.repo/'.codex/config.toml').write_text('fixture')
        snapshot,files=self.engine.snapshot('test');self.snapshots.append(snapshot)
        self.assertFalse((snapshot/'.env').exists());self.assertFalse((snapshot/'data').exists());self.assertFalse((snapshot/'.codex').exists());self.assertTrue((snapshot/'AGENTS.md').exists());self.assertNotIn('remote "origin"',(snapshot/'.git/config').read_text())
    def test_worktree_isolation_preserves_dirty_main_and_omits_secrets(self):
        roles=self.repo/'.codex/agents';roles.mkdir(parents=True);(roles/'software-engineer.toml').write_text('name="fixture"')
        self.git('add','.codex/agents/software-engineer.toml');self.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','role')
        (self.repo/'main.txt').write_text('unrelated user edit');(self.repo/'.env').write_text('fake private fixture');(self.repo/'data').mkdir();(self.repo/'data/input').write_text('fixture')
        self.write_queue([task(execution_kind='implementation_handoff',authorization_scope={'actions':['implement']})]);before=self.engine.repository_context();result=self.engine.worktree('REVIEW-1');path=Path(result['path'])
        self.assertEqual(before,self.engine.repository_context());self.assertEqual((self.repo/'main.txt').read_text(),'unrelated user edit');self.assertEqual((path/'main.txt').read_text(),'original');self.assertFalse((path/'.env').exists());self.assertFalse((path/'data').exists());self.assertTrue((path/'.codex/agents/software-engineer.toml').exists());self.assertFalse(result['automatic_write_execution']);self.assertEqual(result['integration_authority'],'OWNER_REVIEW_REQUIRED')
    def test_permission_profile_has_no_legacy_override(self):
        values=permission_flags(self.repo,self.repo/'fake-auth/auth-fixture.json');serialized=' '.join(values)
        self.assertNotIn('--sandbox',values);self.assertIn('network.enabled=false',serialized);self.assertIn('":root"="deny"',serialized);self.assertIn('".env"="deny"',serialized);self.assertIn(str(self.repo),serialized)
    def test_probe_uses_installed_interpreter_instead_of_xcode_shim(self):
        flags=' '.join(permission_flags(self.repo,self.repo/'fake-auth/auth-fixture.json'))
        self.assertIn(str(Path(sys.executable).resolve().parents[1]),flags)
        self.assertNotEqual(Path(sys.executable).resolve(),Path('/usr/bin/python3'))
    def test_wrong_pid_identity_never_signalled(self):
        process=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],start_new_session=True)
        try:
            identity=process_identity(process.pid);wrong={**identity,'started':'not-the-process-start'}
            self.assertFalse(terminate_group(wrong));self.assertIsNone(process.poll())
        finally:terminate_group(process_identity(process.pid));process.wait(timeout=3)
    def test_group_leader_exit_does_not_leave_term_ignoring_child(self):
        marker=self.repo/'child-ready';code="import signal,time,pathlib,sys;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path(sys.argv[1]).write_text('ready');time.sleep(30)"
        leader=subprocess.Popen([sys.executable,'-c',"import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]]);time.sleep(30)",code,str(marker)],start_new_session=True)
        identity=process_identity(leader.pid)
        try:
            deadline=time.monotonic()+3
            while not marker.exists() and time.monotonic()<deadline:time.sleep(.02)
            self.assertTrue(marker.exists());self.assertTrue(terminate_group(identity,grace=.15));leader.wait(timeout=3);self.assertEqual(owned_group_members(identity),[])
        finally:terminate_group(identity);leader.wait(timeout=3)
    def test_unbuffered_launch_gate_preserves_entire_prompt(self):
        prompt=('read-only fixture\n'*2048).encode();result=subprocess.run([sys.executable,'-c',CHILD_WRAPPER,sys.executable,'-c','import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())'],input=b'G'+prompt,capture_output=True,check=True)
        self.assertEqual(result.stdout,prompt)
    def test_schema_enum_rejects_decorated_reviewed_file_paths(self):
        files=['AGENTS.md'];schema=review_output_schema(files);self.assertEqual(schema['properties']['reviewed_files']['items']['enum'],files)
        result={'task_id':'REVIEW-1','summary':'review','reviewed_files':['AGENTS.md'],'findings':[],'requires_owner_decision':False,'recommended_next_step':'independent review'}
        validate_review_result(result,'REVIEW-1',files)
        with self.assertRaises(SafetyError):validate_review_result({**result,'reviewed_files':['AGENTS.md — SHA-256 fixture']},'REVIEW-1',files)
    def test_native_usage_and_session_survive_failed_result_validation(self):
        def invalid(task,snapshot,files,run_id,*args):
            directory=self.engine.runtime/'runs'/run_id;directory.mkdir(parents=True);(directory/'events.jsonl').write_text(json.dumps({'type':'thread.started','thread_id':'fixture-session'})+'\n'+json.dumps({'type':'turn.completed','usage':{'input_tokens':123,'output_tokens':7,'output_tokens_details':{'reasoning_tokens':2}}})+'\n')
            raise SafetyError('Structured result rejected')
        self.engine.cycle(True,executor=invalid);row=self.engine.status()['tasks'][0]
        self.assertEqual(row['status'],'failed');self.assertEqual(row['session_id'],'fixture-session');self.assertEqual(row['usage']['input_tokens'],123);self.assertEqual(row['usage']['output_tokens_details']['reasoning_tokens'],2);self.assertGreaterEqual(row['elapsed_seconds'],0)
    def review_fixture(self):
        self.engine.cycle(True,executor=self.success);row=self.engine.status()['tasks'][0];report=self.repo/'reports/review.json';report.parent.mkdir();report.write_text('{"review":"verified fixture"}')
        return row,'reports/review.json'
    def test_ordinary_review_accepts_exact_independent_evidence_and_unblocks_dependency(self):
        self.write_queue([task(),task('NEXT',dependencies=['REVIEW-1'])]);row,evidence=self.review_fixture()
        result=self.engine.review('REVIEW-1',row['definition_fingerprint'],'project_owner','different-review-run',evidence,'accept')
        self.assertEqual(result['status'],'completed');self.assertFalse(result['restricted_approval']);self.assertEqual(self.engine.cycle()['candidates'][0]['id'],'NEXT')
    def test_review_rejects_self_run_changed_fingerprint_and_restricted_actions(self):
        row,evidence=self.review_fixture()
        with self.assertRaises(SafetyError):self.engine.review('REVIEW-1',row['definition_fingerprint'],'project_owner',row['run_id'],evidence,'accept')
        with self.assertRaises(SafetyError):self.engine.review('REVIEW-1','b'*64,'project_owner','different',evidence,'accept')
        changed=task(description='Changed target');self.write_queue([changed])
        with self.assertRaises(SafetyError):self.engine.review('REVIEW-1',row['definition_fingerprint'],'project_owner','different',evidence,'accept')
        protected=task(authorization_scope={'actions':['apply_migration'],'target_fingerprint':'a'*64,'approval_id':'A'});self.write_queue([protected]);state=self.engine.state();state['tasks']['REVIEW-1']['definition_fingerprint']=task_fingerprint(protected);self.engine.save(state)
        with self.assertRaises(SafetyError):self.engine.review('REVIEW-1',task_fingerprint(protected),'project_owner','different',evidence,'accept')
    def activation_fixture(self):
        root=self.repo/'scripts/automation';root.mkdir(parents=True)
        names=['engine.py','orchestrator.py','task_queue.schema.json','approval_queue.schema.json','com.fantasyevolution.assisted.plist.in','prepare_activation.py']
        hashes={}
        for name in names:
            path=root/name;path.write_text('harmless activation fixture '+name);hashes[str(path.relative_to(self.repo))]=hashlib.sha256(path.read_bytes()).hexdigest()
        scheduler=self.engine.runtime/'launchd/com.fantasyevolution.readonly.plist';scheduler.parent.mkdir()
        scheduler.write_bytes(plistlib.dumps({'Label':'com.fantasyevolution.readonly','ProgramArguments':[str(Path(sys.executable).resolve()),str(self.repo/'scripts/automation/orchestrator.py'),'cycle','--execute-read-only','--max-tasks','1','--timeout-seconds','180'],'WorkingDirectory':str(self.repo),'StartInterval':900,'RunAtLoad':False,'ProcessType':'Background','LowPriorityIO':True,'Nice':10,'StandardOutPath':str(self.engine.runtime/'scheduler-logs/launchd.stdout.log'),'StandardErrorPath':str(self.engine.runtime/'scheduler-logs/launchd.stderr.log')}))
        manifest={'version':1,'files':hashes,'configuration':{'mode':'autonomous','execution_profile':'read_only_snapshot','max_tasks':1,'timeout_seconds':180,'interval_seconds':900,'max_attempts':3,'daily_execution_limit':6,'scheduler_label':'com.fantasyevolution.readonly'},'rendered_scheduler':{'path':'.automation/launchd/com.fantasyevolution.readonly.plist','sha256':hashlib.sha256(scheduler.read_bytes()).hexdigest()}}
        atomic_json(self.repo/'docs/automation/ACTIVATION_MANIFEST.json',manifest)
        activation=task('AUTO-UNATTENDED-009',status='approval_required',execution_kind='implementation_handoff',authorization_scope={'actions':['enable_unattended'],'target_fingerprint':fingerprint(manifest),'approval_id':'AUTO-ACTIVATION-001'})
        self.write_queue([activation,task()]);plan=self.engine.activation_plan()
        approval={'id':'AUTO-ACTIVATION-001','status':'approved','scope':['enable_unattended'],'target_fingerprint':plan['target_fingerprint'],'task_fingerprint':plan['task_fingerprint'],'expires_at':stamp(now()+dt.timedelta(hours=1)),'decision':{'actor_kind':'human','actor':'project_owner','recorded_at':stamp(now()-dt.timedelta(seconds=1))}}
        return approval
    def test_activation_missing_expired_or_changed_hash_refuses(self):
        approval=self.activation_fixture()
        with self.assertRaises(SafetyError):self.engine.activate('AUTO-ACTIVATION-001')
        atomic_json(self.approvals,{'version':1,'approvals':[{**approval,'expires_at':stamp(now()-dt.timedelta(seconds=1))}]})
        with self.assertRaises(SafetyError):self.engine.activate('AUTO-ACTIVATION-001')
        atomic_json(self.approvals,{'version':1,'approvals':[approval]});(self.repo/'scripts/automation/engine.py').write_text('changed')
        with self.assertRaises(SafetyError):self.engine.activate('AUTO-ACTIVATION-001')
        self.assertEqual(self.engine.control()['mode'],'assisted')
    def test_valid_activation_arms_only_disposable_state_and_revalidates_each_cycle(self):
        approval=self.activation_fixture();atomic_json(self.approvals,{'version':1,'approvals':[approval]});result=self.engine.activate('AUTO-ACTIVATION-001')
        self.assertEqual(result['mode'],'autonomous');self.assertFalse(result['scheduler_installed']);self.assertFalse(result['writable_execution_enabled'])
        self.assertFalse(self.engine.cycle()['dry_run'] is False)
        atomic_json(self.approvals,{'version':1,'approvals':[{**approval,'status':'rejected'}]});blocked=self.engine.cycle(True,executor=self.success)
        self.assertEqual(blocked['executed'],0);self.assertEqual(self.engine.control()['mode'],'approval_required')
    def test_activation_rejects_extra_keepalive_trigger_even_when_hash_matches(self):
        self.activation_fixture();scheduler=self.engine.runtime/'launchd/com.fantasyevolution.readonly.plist';value=plistlib.loads(scheduler.read_bytes());value['KeepAlive']=True;scheduler.write_bytes(plistlib.dumps(value))
        path=self.repo/'docs/automation/ACTIVATION_MANIFEST.json';manifest=json.loads(path.read_text());manifest['rendered_scheduler']['sha256']=hashlib.sha256(scheduler.read_bytes()).hexdigest();atomic_json(path,manifest)
        with self.assertRaisesRegex(SafetyError,'exact reviewed'):self.engine.activation_plan()
    def test_native_usage_keeps_head_session_and_tail_usage_above_log_bound(self):
        path=self.repo/'large-private-events.jsonl'
        with path.open('wb') as out:
            out.write((json.dumps({'type':'thread.started','thread_id':'session-head'})+'\n').encode());out.write(b'{"type":"item.completed","text":"'+b'x'*(9*1024*1024)+b'"}\n');out.write((json.dumps({'type':'turn.completed','usage':{'input_tokens':123,'output_tokens':4}})+'\n').encode())
        value=native_telemetry(path);self.assertEqual(value['session_id'],'session-head');self.assertEqual(value['usage']['input_tokens'],123);self.assertTrue(value['turn_completed']);self.assertTrue(value['log_truncated'])

if __name__=='__main__':unittest.main()
