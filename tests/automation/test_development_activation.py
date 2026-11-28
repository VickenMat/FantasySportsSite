"""No real launchd installation, activation, model execution or database access."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/automation'))
from engine import Engine, SafetyError, atomic_json, fingerprint, stamp, now, task_fingerprint
import development_activation as activation


def task(key, actions, **changes):
    return {'id': key, 'title': 'Isolated development policy fixture',
            'description': 'Fixture only; no real execution authority.',
            'milestone': 'AUTOMATION', 'priority': 1, 'dependencies': [],
            'assigned_role': 'operations_engineer',
            'authorization_scope': {'actions': actions, 'target_fingerprint': None, 'approval_id': None},
            'execution_kind': 'implementation_handoff', 'expected_deliverable': 'Fixture evidence',
            'acceptance_criteria': ['No real activation'], 'status': 'approval_required',
            'attempt_count': 0, **changes}


class DevelopmentActivationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='development-activation-test-')
        self.repo = Path(self.temporary.name) / 'repo'
        self.repo.mkdir()
        subprocess.run(['/usr/bin/git', 'init', '--quiet'], cwd=self.repo, check=True)
        for relative in activation.CRITICAL:
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('Public isolated source fixture\n')
        self.queue_path = self.repo / 'docs/automation/TASK_QUEUE.json'
        self.approval_path = self.repo / 'docs/automation/APPROVAL_QUEUE.json'
        self.queue = {'version': 1, 'mode': 'assisted', 'max_specialists': 3, 'tasks': [
            task(activation.TASK_ID, activation.SCOPES),
            task('SAFE-IMPLEMENT-1', ['implement', 'run_tests'], status='ready',
                 development={'budget_kind': 'implementation', 'writable_paths': ['src/example.ts'],
                              'tests': [['node', '--test', 'tests/example.test.mjs']]})]}
        self.approvals = {'version': 1, 'approvals': [
            {'id': 'AUTO-ACTIVATION-001', 'status': 'approved', 'scope': ['enable_unattended'],
             'target_fingerprint': 'a' * 64, 'task_fingerprint': 'b' * 64,
             'expires_at': stamp(now() + dt.timedelta(hours=1)),
             'decision': {'actor_kind': 'human', 'actor': 'project_owner', 'recorded_at': stamp()}},
            {'id': activation.APPROVAL_ID, 'status': 'pending', 'scope': activation.SCOPES,
             'decision': None, 'target_fingerprint': None, 'task_fingerprint': None, 'expires_at': None}]}
        atomic_json(self.queue_path, self.queue)
        atomic_json(self.approval_path, self.approvals)
        atomic_json(self.repo / 'docs/automation/DEVELOPMENT_TASKS.json',
                    {'version': 1, 'grants': [{'task_id': 'SAFE-IMPLEMENT-1',
                                              'task_fingerprint': task_fingerprint(self.queue['tasks'][1])}]})
        self.engine = Engine(self.repo)
        self.environment = mock.patch.dict(os.environ, {'AUTOMATION_AGENT_CONTEXT': '0'})
        self.environment.start()
        self.job = self.repo.parent / 'fake-owner/Library/LaunchAgents' / (activation.LABEL + '.plist')
        self.destination = mock.patch.object(activation, '_destination', return_value=self.job)
        self.destination.start()
        self.launchctl = mock.patch.object(activation, '_launchctl')
        self.run = self.launchctl.start()
        self.loaded = mock.patch.object(activation, '_job_loaded', return_value=True)
        self.loaded.start()

    def tearDown(self):
        self.loaded.stop()
        self.launchctl.stop()
        self.destination.stop()
        self.environment.stop()
        self.temporary.cleanup()

    def prepare(self):
        return activation.prepare(self.engine, bind_pending=True)

    def approve(self):
        result = self.prepare()
        value = self.engine.approvals()
        value['approvals'][1].update(status='approved', expires_at=stamp(now() + dt.timedelta(hours=1)),
                                    decision={'actor_kind': 'human', 'actor': 'project_owner',
                                              'recorded_at': stamp(now() - dt.timedelta(seconds=1))})
        atomic_json(self.approval_path, value)
        return result

    def test_proposal_is_separate_inert_and_binds_exact_budgets_grants_and_scheduler(self):
        result = self.prepare()
        plan = activation.development_activation_plan(self.engine)
        self.assertEqual(result['target_fingerprint'], plan['target_fingerprint'])
        self.assertEqual(plan['configuration']['daily_model_launch_limit'], 12)
        self.assertEqual(plan['configuration']['budgets']['local'], 7200)
        self.assertEqual(plan['configuration']['max_active_model_stages'], 1)
        self.assertIn('docs/automation/DEVELOPMENT_TASKS.json', plan['manifest']['files'])
        self.assertEqual(self.engine.approvals()['approvals'][1]['status'], 'pending')
        self.assertIsNone(self.engine.approvals()['approvals'][1]['decision'])
        self.assertFalse(result['installed'])
        self.assertFalse(result['armed'])
        self.assertEqual(self.engine.control()['mode'], 'assisted')
        self.assertFalse((self.engine.runtime / 'development-activation.json').exists())
        self.assertFalse(self.job.exists())
        self.run.assert_not_called()
        plist = plistlib.loads(Path(result['scheduler']).read_bytes())
        self.assertEqual(plist['ProgramArguments'][-3:], ['develop', '--max-tasks', '2'])
        self.assertFalse(plist['RunAtLoad'])
        self.assertEqual(plist['StartInterval'], 900)

    def test_old_readonly_approval_and_pending_development_cannot_arm(self):
        self.prepare()
        with self.assertRaises(SafetyError):
            activation.activate(self.engine, 'AUTO-ACTIVATION-001')
        with self.assertRaises(SafetyError):
            activation.activate(self.engine)
        with self.assertRaises(SafetyError):
            activation.install(self.engine)
        self.run.assert_not_called()

    def test_approved_but_unarmed_or_disarmed_policy_cannot_execute(self):
        self.approve()
        with self.assertRaises(SafetyError):
            activation.verify_armed(self.engine)
        activation.activate(self.engine)
        self.assertEqual(activation.verify_armed(self.engine)['approval_id'], activation.APPROVAL_ID)
        activation.uninstall(self.engine)
        with self.assertRaisesRegex(SafetyError, 'not been separately armed'):
            activation.verify_armed(self.engine)

    def test_expiry_wrong_actor_wrong_scope_and_wrong_task_fail_closed(self):
        self.approve()
        baseline = self.engine.approvals()
        changes = [
            {'expires_at': stamp(now() - dt.timedelta(seconds=1))},
            {'decision': {'actor_kind': 'agent', 'actor': 'project_owner', 'recorded_at': stamp()}},
            {'scope': ['enable_unattended']}, {'task_fingerprint': 'c' * 64},
            {'decision': None},
        ]
        for change in changes:
            value = json.loads(json.dumps(baseline))
            value['approvals'][1].update(change)
            atomic_json(self.approval_path, value)
            with self.assertRaises(SafetyError):
                activation.verify(self.engine)
        self.assertEqual(self.engine.control()['mode'], 'assisted')

    def test_source_grant_and_queue_authority_changes_invalidate_proposal(self):
        self.prepare()
        source = self.repo / 'scripts/automation/development.py'
        original = source.read_bytes()
        source.write_text('Changed security source')
        with self.assertRaisesRegex(SafetyError, 'source hashes changed'):
            activation.verify(self.engine, False)
        source.write_bytes(original)
        grant = self.repo / 'docs/automation/DEVELOPMENT_TASKS.json'
        grant.write_text('{"version":2}')
        with self.assertRaisesRegex(SafetyError, 'source hashes changed'):
            activation.verify(self.engine, False)
        self.prepare()
        queue = self.engine.queue()
        queue['tasks'][1]['development']['writable_paths'].append('src/unauthorized.ts')
        atomic_json(self.queue_path, queue)
        with self.assertRaisesRegex(SafetyError, 'authorization changed'):
            activation.verify(self.engine, False)

    def test_priority_progress_do_not_expand_grants_or_reset_shared_counters(self):
        self.approve()
        queue = self.engine.queue()
        queue['tasks'][1].update(priority=99, status='completed')
        atomic_json(self.queue_path, queue)
        timestamps = [stamp(now() - dt.timedelta(minutes=i)) for i in range(4)]
        state = self.engine.state()
        state['executions'] = timestamps
        self.engine.save(state)
        activation.activate(self.engine)
        self.assertEqual(self.engine.control()['mode'], 'development_autonomous')
        self.assertEqual(self.engine.state()['executions'], timestamps)
        self.assertFalse(self.job.exists())
        self.run.assert_not_called()

    def test_agent_cannot_arm_install_uninstall_or_bind_owner_approval_records(self):
        self.approve()
        with mock.patch.dict(os.environ, {'AUTOMATION_AGENT_CONTEXT': '1'}):
            for call in [lambda: activation.activate(self.engine), lambda: activation.install(self.engine),
                         lambda: activation.uninstall(self.engine), lambda: activation.prepare(self.engine, True)]:
                with self.assertRaises(SafetyError):
                    call()
        self.assertEqual(self.engine.control()['mode'], 'assisted')

    def test_rendered_command_or_unexpected_source_injection_is_rejected(self):
        result = self.prepare()
        path = Path(result['scheduler'])
        value = plistlib.loads(path.read_bytes())
        value['ProgramArguments'] = ['/bin/sh', '-c', 'unreviewed command']
        path.write_bytes(plistlib.dumps(value))
        manifest_path = self.repo / activation.MANIFEST
        manifest = json.loads(manifest_path.read_text())
        manifest['rendered_scheduler']['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        atomic_json(manifest_path, manifest)
        with self.assertRaisesRegex(SafetyError, 'exact reviewed command'):
            activation.verify(self.engine, False)
        self.prepare()
        manifest = json.loads(manifest_path.read_text())
        manifest['files']['.env'] = 'a' * 64
        atomic_json(manifest_path, manifest)
        with self.assertRaisesRegex(SafetyError, 'source hashes changed'):
            activation.verify(self.engine, False)

    def test_approved_proposal_cannot_be_overwritten_and_symlinks_are_refused(self):
        self.approve()
        with self.assertRaisesRegex(SafetyError, 'cannot be silently replaced'):
            self.prepare()
        path = self.repo / 'scripts/automation/development.py'
        path.unlink()
        path.symlink_to(self.repo / 'AGENTS.md')
        with self.assertRaisesRegex(SafetyError, 'symlink'):
            activation.verify(self.engine, False)

    def test_install_is_gated_and_uninstall_can_stop_after_expiry_without_unknown_deletion(self):
        self.approve()
        activation.activate(self.engine)
        result = activation.install(self.engine)
        self.assertTrue(result['installed'])
        self.assertEqual(self.run.call_args.args[0][0], 'bootstrap')
        self.assertEqual(self.job.stat().st_mode & 0o777, 0o600)
        approvals = self.engine.approvals()
        approvals['approvals'][1]['expires_at'] = stamp(now() - dt.timedelta(seconds=1))
        atomic_json(self.approval_path, approvals)
        with self.assertRaises(SafetyError):
            activation.verify(self.engine)
        stopped = activation.uninstall(self.engine)
        self.assertFalse(stopped['installed'])
        self.assertFalse(self.job.exists())
        self.assertEqual(self.engine.control()['mode'], 'paused')
        self.assertEqual(self.run.call_args.args[0][0], 'bootout')
        self.assertFalse(activation.uninstall(self.engine)['installed'])

    def test_partial_bootstrap_receipt_observes_job_before_removal(self):
        self.approve()
        activation.activate(self.engine)
        self.run.side_effect = SafetyError('Simulated process interruption after bootstrap')
        with self.assertRaises(SafetyError):
            activation.install(self.engine)
        self.assertTrue(self.job.exists())
        self.run.side_effect = None
        activation.uninstall(self.engine)
        self.assertEqual(self.run.call_args.args[0][0], 'bootout')
        self.assertFalse(self.job.exists())

    def test_install_never_overwrites_unknown_or_changed_owner_files(self):
        self.approve()
        activation.activate(self.engine)
        self.job.parent.mkdir(parents=True)
        self.job.write_text('Unrelated existing file')
        with self.assertRaisesRegex(SafetyError, 'never overwritten'):
            activation.install(self.engine)
        with self.assertRaisesRegex(SafetyError, 'No owned installation receipt'):
            activation.uninstall(self.engine)
        self.assertEqual(self.job.read_text(), 'Unrelated existing file')
        self.run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
