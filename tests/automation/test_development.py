"""Recovery/security fixtures. Actual CLI lifecycle is separately demonstrated."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/automation'))
from engine import Engine,SafetyError,BusyError,atomic_json,task_fingerprint,stamp,now
from development import DevEngine,validate_development,safe_output,UsageUnavailable,Interrupted,result_schema,validate_result,DAILY_MODELS

class DevelopmentTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()/'repo';self.root.mkdir();self.env=mock.patch.dict(os.environ,{'AUTOMATION_AGENT_CONTEXT':'0'});self.env.start()
  self.git('init','-b','main','--quiet');self.git('config','user.name','Fixture');self.git('config','user.email','fixture@example.invalid');(self.root/'.gitignore').write_text('.automation/\n.agent-output/\n.agent-review.json\n__pycache__/\n.env\ndata/\n');(self.root/'AGENTS.md').write_text('Fixture context')
  self.git('add','.');self.git('commit','-qm','fixture');self.queue=self.root/'docs/automation/TASK_QUEUE.json';self.grants=self.root/'docs/automation/DEVELOPMENT_TASKS.json';self.approvals=self.root/'docs/automation/APPROVAL_QUEUE.json';atomic_json(self.approvals,{'version':1,'approvals':[]});self.set_tasks([self.task('A')]);self.git('add','.');self.git('commit','-qm','tasks');self.dev=DevEngine(self.root)
 def tearDown(self):self.env.stop();self.tmp.cleanup()
 def git(self,*args,tree=None):return subprocess.run(['/usr/bin/git','-c','core.hooksPath=/dev/null',*args],cwd=tree or self.root,capture_output=True,check=True).stdout
 def task(self,key,**kw):
  p=f'examples/{key}.py';return {'id':key,'title':'Fixture implementation','description':'Write a harmless constant and its check','milestone':'AUTOMATION','priority':1,'dependencies':[],'assigned_role':'software_engineer','authorization_scope':{'actions':['implement','run_tests'],'target_fingerprint':None,'approval_id':None},'execution_kind':'writable_implementation','expected_deliverable':'Tested fixture','acceptance_criteria':['Local check and independent review'],'status':'ready','attempt_count':0,'last_execution_time':None,'associated_commit':None,'blocker_classification':None,'development':{'writable_paths':[p],'datasets':[],'checks':[{'kind':'python_script','path':p}],'budget_kind':'implementation','model_seconds':60,'test_seconds':30,'push':False},**kw}
 def set_tasks(self,tasks):
  atomic_json(self.queue,{'version':1,'mode':'assisted','max_specialists':3,'tasks':tasks});atomic_json(self.grants,{'version':1,'tasks':{t['id']:{'task_fingerprint':task_fingerprint(t),'development':t['development']} for t in tasks if 'development' in t}})
 def implement(self,t,tree,phase,run_id,timeout,findings):
  if phase=='implementation':
   p=tree/t['development']['writable_paths'][0];p.parent.mkdir(exist_ok=True,parents=True);p.write_text('assert 2+2 == 4\n');return {'task_id':t['id'],'summary':'Implemented fixture','requires_owner_decision':False,'changed_files':[str(p.relative_to(tree))]}
  return {'task_id':t['id'],'summary':'Independent fixture review','requires_owner_decision':False,'verdict':'accept','findings':[]}
 def checker(self,*args):return [{'exitCode':0,'kind':'synthetic_test_fixture'}]
 def run_cycle(self,**kw):return self.dev.develop(True,executor=self.implement,checker=self.checker,**kw)
 def test_real_git_isolation_review_integration_and_next_dependency(self):
  a=self.task('A');b=self.task('B',dependencies=['A'],priority=0);self.set_tasks([b,a]);self.git('add','.');self.git('commit','-qm','dependency')
  r=self.run_cycle();self.assertEqual([x['id'] for x in r['results']],['A','B']);self.assertTrue(all(x['status']=='completed' for x in r['results']));self.assertTrue((self.root/'examples/B.py').exists());self.assertEqual(self.git('status','--porcelain').strip(),b'');self.assertEqual(len(self.dev.state()['executions']),4)
  rows=self.dev.state()['tasks'];self.assertNotEqual(rows['A']['execution_history'][0]['run_id'],rows['A']['verification']['review_run_id']);self.assertEqual(rows['A']['execution_history'][1]['role'],'independent_reviewer')
 def test_no_useful_work_never_calls_model(self):
  a=self.task('A',status='blocked');self.set_tasks([a]);self.git('add','.');self.git('commit','-qm','blocked');self.assertEqual(self.run_cycle()['executed'],0);self.assertEqual(self.dev.state()['executions'],[])
 def test_model_budget_exhaustion_stops_without_reset(self):
  s=self.dev.state();s['executions']=[stamp()]*DAILY_MODELS;self.dev.save(s);r=self.run_cycle();self.assertEqual(r['results'][0]['status'],'blocked');self.assertEqual(len(self.dev.state()['executions']),DAILY_MODELS);self.assertEqual(self.dev.control()['mode'],'paused')
 def test_model_reported_usage_exhaustion_pauses(self):
  with mock.patch.object(self.dev,'model',side_effect=UsageUnavailable('exhausted')):self.dev.develop(True,checker=self.checker)
  self.assertEqual(self.dev.control()['mode'],'paused');self.assertTrue(Path(self.dev.state()['tasks']['A']['worktree_path']).exists())
 def test_failed_checks_never_review_or_integrate(self):
  r=self.dev.develop(True,executor=self.implement,checker=lambda *a:[{'exitCode':1}]);self.assertEqual(r['results'][0]['status'],'blocked');self.assertFalse((self.root/'examples/A.py').exists());self.assertEqual(len(self.dev.state()['tasks']['A']['execution_history']),1)
 def test_failed_independent_review_preserves_work(self):
  def reject(*args):
   r=self.implement(*args)
   if args[2]=='review':r.update(verdict='changes_requested',findings=['Unsupported implementation'])
   return r
  r=self.dev.develop(True,executor=reject,checker=self.checker);self.assertEqual(r['results'][0]['status'],'blocked');self.assertEqual(len(self.dev.state()['tasks']['A']['execution_history']),4);self.assertFalse((self.root/'examples/A.py').exists())
 def test_supported_review_findings_get_one_bounded_revision(self):
  count=0
  def revise(*args):
   nonlocal count
   r=self.implement(*args)
   if args[2]=='review':
    count+=1
    if count==1:r.update(verdict='changes_requested',findings=['Add exact check'])
   return r
  r=self.dev.develop(True,executor=revise,checker=self.checker);self.assertEqual(r['results'][0]['status'],'completed');self.assertEqual(count,2)
 def test_authority_does_not_come_from_reviewer(self):
  t=self.task('A');t['authorization_scope']['actions'].append('apply_migration');self.set_tasks([t]);self.git('add','.');self.git('commit','-qm','restricted');self.assertEqual(self.run_cycle()['executed'],0);self.assertEqual(self.dev.state()['tasks']['A']['status'],'approval_required')
 def test_exact_grant_changed_scope_rejected(self):
  t=self.task('A');t['development']['model_seconds']=59;atomic_json(self.queue,{'version':1,'mode':'assisted','max_specialists':3,'tasks':[t]});self.git('add','.');self.git('commit','-qm','changed');self.assertEqual(self.run_cycle()['executed'],0)
 def test_protected_output_enforced(self):
  for p in ['data/raw/a.json','prisma/a.py','src/scoring/a.ts','docs/automation/APPROVAL_QUEUE.json','.git/config','.env','../escape.py','scripts/automation/development.py','AGENTS.md']:
   with self.subTest(p=p),self.assertRaises(SafetyError):safe_output(p)
 def test_model_cannot_modify_ungranted_file_or_symlink(self):
  def escape(*a):
   r=self.implement(*a)
   if a[2]=='implementation':(a[1]/'ungranted.py').write_text('x')
   return r
  self.dev.develop(True,executor=escape,checker=self.checker);self.assertEqual(self.dev.state()['tasks']['A']['status'],'blocked');self.assertFalse((self.root/'ungranted.py').exists())
 def test_dirty_checkout_is_not_claimed_or_overwritten(self):
  (self.root/'user.py').write_text('user work')
  with self.assertRaises(SafetyError):self.run_cycle()
  self.assertEqual((self.root/'user.py').read_text(),'user work');self.assertNotIn('A',self.dev.state()['tasks'])
 def test_conflicting_primary_change_prevents_integration(self):
  def check(*a):
   (self.root/'user.py').write_text('concurrent user work');return self.checker(*a)
  r=self.dev.develop(True,executor=self.implement,checker=check);self.assertEqual(r['results'][0]['status'],'blocked');self.assertFalse((self.root/'examples/A.py').exists());self.assertEqual((self.root/'user.py').read_text(),'concurrent user work')
 def test_pause_emergency_and_duplicate_lease(self):
  self.dev.pause()
  with self.assertRaises(Interrupted):self.run_cycle()
  self.dev.resume();self.dev.pause(True)
  with self.assertRaises(SafetyError):self.dev.resume()
  self.dev.resume(True)
  with self.dev.lock(),self.assertRaises(BusyError):self.run_cycle()
 def test_interrupted_worktree_kept_no_blind_replay(self):
  def interrupt(*a):
   self.implement(*a);raise Interrupted('fixture interruption')
  self.dev.develop(True,executor=interrupt,checker=self.checker);row=self.dev.state()['tasks']['A'];tree=Path(row['worktree_path']);self.assertTrue((tree/'examples/A.py').exists());self.assertEqual(self.run_cycle()['executed'],0)
  self.dev.recover_checkpoint('A',str(tree),self.git('rev-parse','HEAD',tree=tree).decode().strip());self.assertEqual(self.run_cycle()['results'][0]['status'],'completed')
 def test_restart_reconciles_running_checkpoint_not_session_id(self):
  s=self.dev.state();s['tasks']['A']={'status':'running','development_workflow':True,'attempt_count':1,'session_id':'historical-only','phase':'implementation'};self.dev.save(s);restored=DevEngine(self.root);restored.develop(False);self.assertEqual(restored.state()['tasks']['A']['blocker_classification'],'INTERRUPTED_CHECKPOINT_REVIEW_REQUIRED');self.assertEqual(restored.state()['tasks']['A']['attempt_count'],1)
 def test_old_readonly_activation_cannot_launch_writable(self):
  atomic_json(self.dev.control_path,{'version':1,'mode':'autonomous'})
  with self.assertRaises(SafetyError):self.run_cycle()
 def test_budget_and_arbitrary_commands_validation(self):
  p=self.task('A')['development']
  for changed in [{**p,'model_seconds':1801},{**p,'test_seconds':7201},{**p,'checks':[{'kind':'shell','path':'x.py'}]},{**p,'datasets':[{'path':'../.env','sha256':'a'*64}]}]:
   with self.assertRaises(SafetyError):validate_development(changed)
 def test_agent_context_cannot_integrate(self):
  with mock.patch.dict(os.environ,{'AUTOMATION_AGENT_CONTEXT':'1'}),self.assertRaises(SafetyError):self.run_cycle()
 def test_requires_product_decision_not_integrated(self):
  def blocked(*a):
   r=self.implement(*a)
   if a[2]=='review':r['requires_owner_decision']=True
   return r
  self.dev.develop(True,executor=blocked,checker=self.checker);self.assertEqual(self.dev.state()['tasks']['A']['status'],'blocked')

 def test_tested_output_cannot_change_during_review(self):
  def mutate(*args):
   r=self.implement(*args)
   if args[2]=='review':(args[1]/args[0]['development']['writable_paths'][0]).write_text('untested change')
   return r
  self.dev.develop(True,executor=mutate,checker=self.checker);self.assertEqual(self.dev.state()['tasks']['A']['status'],'blocked');self.assertFalse((self.root/'examples/A.py').exists())
 def test_checker_cannot_change_tested_output(self):
  def mutate(t,tree,*args):
   (tree/t['development']['writable_paths'][0]).write_text('changed by check');return self.checker()
  self.dev.develop(True,executor=self.implement,checker=mutate);self.assertEqual(self.dev.state()['tasks']['A']['status'],'blocked');self.assertEqual(len(self.dev.state()['tasks']['A']['execution_history']),1)

 def test_tracked_project_config_refused_before_model(self):
  p=self.root/'.codex/config.toml';p.parent.mkdir();p.write_text('[mcp_servers.unsafe]\ncommand="unsafe"\n');self.git('add','.');self.git('commit','-qm','unsafe project config')
  self.run_cycle();row=self.dev.state()['tasks']['A'];self.assertEqual(row['status'],'blocked');self.assertFalse(row.get('execution_history'))
 def test_queue_pause_and_unknown_control_fail_closed(self):
  q=json.loads(self.queue.read_text());q['mode']='paused';atomic_json(self.queue,q)
  with self.assertRaises(Interrupted):self.run_cycle()
  q['mode']='assisted';atomic_json(self.queue,q);atomic_json(self.dev.control_path,{'version':1,'mode':'unknown'})
  with self.assertRaises(SafetyError):self.run_cycle()

 def test_malformed_profile_blocks_only_affected_task(self):
  bad=self.task('BAD',priority=0);bad['development']['writable_paths']=[{}];self.set_tasks([bad,self.task('GOOD')]);self.git('add','.');self.git('commit','-qm','bad profile fixture')
  r=self.run_cycle();self.assertEqual(r['results'][0]['id'],'GOOD');self.assertEqual(self.dev.state()['tasks']['BAD']['status'],'blocked');self.assertEqual(self.dev.state()['tasks']['GOOD']['status'],'completed')
 def test_all_malformed_profile_fields_raise_safetyerror(self):
  p=self.task('A')['development']
  for change in [{'writable_paths':[None]},{'budget_kind':[]},{'datasets':[{'path':{},'sha256':[]} ]},{'checks':[None]},{'checks':[{'kind':{},'path':'a.py'}]}]:
   with self.subTest(change=change),self.assertRaises(SafetyError):validate_development({**p,**change})
 def test_pending_verified_push_recovers_without_new_model(self):
  t=self.task('A');t['development']['push']=True;self.set_tasks([t]);self.git('add','.');self.git('commit','-qm','push fixture')
  with mock.patch.object(self.dev,'push_verified',side_effect=SafetyError('synthetic offline transport')):self.run_cycle()
  before=len(self.dev.state()['executions']);row=self.dev.state()['tasks']['A'];self.assertTrue(row['integration_complete']);self.assertTrue(row['push_pending']);self.assertEqual(row['blocker_classification'],'PUSH_RETRY_REQUIRED')
  def recovered(row,state):row['push_pending']=False;self.dev.save(state)
  with mock.patch.object(self.dev,'push_verified',side_effect=recovered):r=self.run_cycle()
  self.assertEqual(r['results'][0]['recovered'],'verified_pending_push_only');self.assertEqual(self.dev.state()['tasks']['A']['status'],'completed');self.assertEqual(len(self.dev.state()['executions']),before)

 def test_usage_recovery_requires_fresh_supported_availability(self):
  state=self.dev.state();state['tasks']['A']={'status':'blocked','attempt_count':1,'definition_fingerprint':task_fingerprint(self.task('A')),'blocker_classification':'USAGE_LIMIT_REQUIRES_SUPPORTED_RECOVERY'};self.dev.save(state)
  with mock.patch.object(self.dev,'quota_check',side_effect=UsageUnavailable('still unavailable')),self.assertRaises(UsageUnavailable):self.run_cycle()
  self.assertEqual(self.dev.state()['tasks']['A']['status'],'blocked')
  with mock.patch.object(self.dev,'quota_check',return_value=None):r=self.run_cycle()
  self.assertEqual(r['results'][0]['status'],'completed');self.assertEqual(self.dev.state()['tasks']['A']['attempt_count'],2)

 def test_project_instructions_explicit_scoped_order_and_protected(self):
  task=self.task('A');row={'attempt_count':1};tree=self.dev.worktree_create(task,row);(tree/'examples/AGENTS.md').write_text('Scoped instruction')
  instructions=self.dev.project_instructions(tree,task);self.assertEqual([r['path'] for r in instructions],['AGENTS.md','examples/AGENTS.md'])
  self.assertEqual(instructions[-1]['instructions'],'Scoped instruction')
  for name in ['examples/AGENTS.md','examples/AGENTS.override.md']:
   with self.assertRaises(SafetyError):safe_output(name)
 def test_clean_failed_checkpoint_retries_fresh_without_erasing_first(self):
  def fail(*args):raise SafetyError('pre-inference startup fixture')
  self.dev.develop(True,executor=fail,checker=self.checker);row=self.dev.state()['tasks']['A'];old=Path(row['worktree_path']);head=self.git('rev-parse','HEAD',tree=old).decode().strip()
  self.dev.recover_checkpoint('A',str(old),head);self.assertFalse(self.dev.state()['tasks']['A']['resume_checkpoint']);self.assertEqual(self.run_cycle()['results'][0]['status'],'completed');self.assertTrue(old.exists());self.assertEqual(self.dev.state()['tasks']['A']['attempt_count'],2)
 def test_recovery_carries_scoped_diff_after_unrelated_main_checkpoint(self):
  def interrupt(*args):self.implement(*args);raise Interrupted('controlled')
  self.dev.develop(True,executor=interrupt,checker=self.checker);row=self.dev.state()['tasks']['A'];old=Path(row['worktree_path']);head=self.git('rev-parse','HEAD',tree=old).decode().strip()
  (self.root/'controller-fix.txt').write_text('verified unrelated fix');self.git('add','.');self.git('commit','-qm','controller checkpoint')
  self.dev.recover_checkpoint('A',str(old),head);r=self.run_cycle();self.assertEqual(r['results'][0]['status'],'completed');new=self.dev.state()['tasks']['A'];self.assertNotEqual(new['worktree_path'],str(old));self.assertTrue(old.exists());self.assertEqual(new['preserved_checkpoints'][0]['path'],str(old))
 def test_recovery_refuses_changed_target_on_main(self):
  def interrupt(*args):self.implement(*args);raise Interrupted('controlled')
  self.dev.develop(True,executor=interrupt,checker=self.checker);row=self.dev.state()['tasks']['A'];old=Path(row['worktree_path']);head=self.git('rev-parse','HEAD',tree=old).decode().strip()
  (self.root/'examples').mkdir(exist_ok=True);(self.root/'examples/A.py').write_text('user target');self.git('add','.');self.git('commit','-qm','user target')
  self.dev.recover_checkpoint('A',str(old),head);self.run_cycle();self.assertEqual(self.dev.state()['tasks']['A']['status'],'blocked');self.assertEqual((self.root/'examples/A.py').read_text(),'user target');self.assertTrue(old.exists())

 def test_recovery_copy_rejects_swapped_leaf_or_parent_symlink(self):
  from development import scoped_bytes
  tree=self.root/'old';tree.mkdir();(tree/'out').mkdir();file=tree/'out/result.py';file.write_text('approved output');outside=self.root/'harmless-private-fixture.py';outside.write_text('never copy this')
  self.assertEqual(scoped_bytes(tree,'out/result.py'),b'approved output');file.unlink();file.symlink_to(outside)
  with self.assertRaises(SafetyError):scoped_bytes(tree,'out/result.py')
  file.unlink();(tree/'out').rmdir();(tree/'out').symlink_to(self.root)
  with self.assertRaises(SafetyError):scoped_bytes(tree,'out/harmless-private-fixture.py')
