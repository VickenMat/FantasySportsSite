"""Preparation is local and inert; it cannot turn a proposal into approval."""
import json,plistlib,subprocess,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/automation'))
from engine import Engine,SafetyError,fingerprint,task_fingerprint
from prepare_activation import prepare,CRITICAL

class ActivationPreparation(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.repo=Path(self.temp.name)/'repo';self.repo.mkdir()
  subprocess.run(['/usr/bin/git','init','--quiet'],cwd=self.repo,check=True)
  for name in CRITICAL:
   p=self.repo/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('harmless source fixture\n')
  source=Path(__file__).resolve().parents[2]/'docs/automation'
  queue=json.loads((source/'TASK_QUEUE.json').read_text());queue['tasks']=[t for t in queue['tasks'] if t['id']=='AUTO-UNATTENDED-009']
  for name,data in [('TASK_QUEUE.json',queue),('APPROVAL_QUEUE.json',json.loads((source/'APPROVAL_QUEUE.json').read_text()))]:
   p=self.repo/'docs/automation'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data))
 def tearDown(self):self.temp.cleanup()
 def test_bound_proposal_never_arms_installs_or_approves(self):
  result=prepare(self.repo,True);engine=Engine(self.repo);plan=engine.activation_plan();task=engine.queue()['tasks'][0]
  self.assertEqual(result['target_fingerprint'],plan['target_fingerprint']);self.assertEqual(plan['task_fingerprint'],task_fingerprint(task))
  self.assertFalse(result['armed']);self.assertFalse(result['installed']);self.assertEqual(engine.control()['mode'],'assisted')
  approval=engine.approvals()['approvals'][0];self.assertEqual(approval['status'],'pending');self.assertIsNone(approval['decision'])
  scheduler=plistlib.loads(Path(result['scheduler']).read_bytes());self.assertFalse(scheduler['RunAtLoad']);self.assertEqual(scheduler['StartInterval'],900)
  with self.assertRaises(SafetyError):engine.activate('AUTO-ACTIVATION-001')
 def test_preparation_cannot_replace_an_approved_target(self):
  prepare(self.repo,True);p=self.repo/'docs/automation/APPROVAL_QUEUE.json';data=json.loads(p.read_text());data['approvals'][0]['status']='approved';p.write_text(json.dumps(data))
  with self.assertRaisesRegex(SafetyError,'approved target'):prepare(self.repo,True)
 def test_source_change_invalidates_the_prepared_activation(self):
  prepare(self.repo,True);(self.repo/'scripts/automation/engine.py').write_text('changed reviewed source')
  with self.assertRaisesRegex(SafetyError,'hash changed'):Engine(self.repo).activation_plan()

if __name__=='__main__':unittest.main()
