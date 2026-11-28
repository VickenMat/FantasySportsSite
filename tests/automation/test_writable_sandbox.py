import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'automation'))
from engine import SafetyError
from writable_sandbox import permission_flags, sandbox_probe, PROFILE, REVIEW_PROFILE


class WritableSandboxTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.owner = (Path(self.temp.name) / 'owner').resolve()
        self.owner.mkdir()
        self.git('init', '--quiet')
        (self.owner / '.gitignore').write_text('.automation/\n.agent-output/\n')
        (self.owner / 'readme.md').write_text('harmless fixture')
        self.git('add', '.')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture')
        self.tree = self.owner / '.automation' / 'worktrees' / 'fixture'
        self.tree.parent.mkdir(parents=True)
        self.git('worktree', 'add', '--quiet', '--detach', str(self.tree))
        self.data = self.owner / 'data' / 'accepted' / 'fixture.csv'
        self.data.parent.mkdir(parents=True)
        self.data.write_text('native_id,value\n123,4\n')
        self.probe = self.owner / '.automation' / 'runs' / 'probe'

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.run(['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', *args], cwd=self.owner, capture_output=True, check=True).stdout

    def profile(self, review=False, writable=None, datasets=None):
        flags = permission_flags(self.owner, self.tree, writable if writable is not None else ['.agent-output', 'docs/result.md'], datasets if datasets is not None else [self.data], review)
        config = '\n'.join(flags[i+1] for i in range(0, len(flags), 2))
        return flags, tomllib.loads(config)

    def test_exact_write_scope_and_protected_paths_with_installed_profile_schema(self):
        flags, config = self.profile()
        fs = config['permissions'][PROFILE]['filesystem']
        self.assertEqual(config['default_permissions'], PROFILE)
        self.assertEqual(fs[':root'], 'deny')
        self.assertEqual(fs[str(self.tree)]['.'], 'read')
        self.assertEqual(fs[str(self.tree / 'docs/result.md')], 'write')
        self.assertEqual(fs[str(self.tree / '.agent-output')], 'write')
        self.assertEqual(fs[str(self.tree / '.git')], 'deny')
        self.assertEqual(fs[str(self.owner / '.git')], 'deny')
        self.assertEqual(fs[str(self.owner)], 'deny')
        self.assertEqual(fs[str(Path.home() / 'Library' / 'Keychains')], 'deny')
        self.assertEqual(fs['/usr/bin/security'], 'deny')
        self.assertEqual(fs['/usr/bin/osascript'], 'deny')
        self.assertEqual(fs[str(self.data)], 'read')
        self.assertEqual(fs[str(self.tree)]['src/scoring'], 'read')
        self.assertFalse(config['permissions'][PROFILE]['network']['enabled'])
        self.assertNotIn('--sandbox', flags)

    def test_independent_review_cannot_write_even_implementation_outputs(self):
        _, config = self.profile(review=True)
        self.assertEqual(config['default_permissions'], REVIEW_PROFILE)
        fs = config['permissions'][REVIEW_PROFILE]['filesystem']
        self.assertEqual(fs[str(self.tree / 'docs/result.md')], 'read')
        self.assertEqual(fs[str(self.tree / '.agent-output')], 'read')
        self.assertEqual(fs[str(Path.home() / 'Library' / 'Keychains')], 'deny')
        self.assertEqual(fs['/usr/bin/security'], 'deny')
        self.assertEqual(fs['/usr/bin/osascript'], 'deny')
        self.assertNotIn('write', json.dumps(fs))

    def test_unsafe_or_protected_output_scopes_rejected(self):
        for value in ['.', '', '../escape', '/tmp/escape', 'src', 'src/scoring/ubp-v9.ts', 'prisma/new.sql', '.git/config', '.automation/state.json', 'docs/automation/APPROVAL_QUEUE.json', 'scripts/automation/engine.py', '.env', 'src/.env.local', 'data/enriched.json', 'src/generated/file', 'bad*glob']:
            with self.subTest(value=value), self.assertRaises(SafetyError):
                self.profile(writable=[value])

    def test_output_symlinks_and_input_credential_roots_rejected(self):
        (self.tree / 'linked').symlink_to(self.owner, target_is_directory=True)
        with self.assertRaises(SafetyError):
            self.profile(writable=['linked/new.md'])
        with self.assertRaises(SafetyError):
            self.profile(datasets=[self.owner / '.git' / 'config'])
        alias = self.data.parent / 'alias.csv'
        alias.symlink_to(self.data)
        with self.assertRaises(SafetyError):
            self.profile(datasets=[alias])
        self.assertEqual(self.data.read_text(), 'native_id,value\n123,4\n')

    def test_owner_checkout_and_other_repository_markers_rejected(self):
        with self.assertRaises(SafetyError):
            permission_flags(self.owner, self.owner, ['.agent-output'], [])
        (self.tree / '.git').write_text('gitdir: /tmp/nonexistent-foreign-gitdir')
        with self.assertRaises((SafetyError, FileNotFoundError)):
            self.profile()

    def test_probe_refuses_unscoped_scratch_or_nonprivate_receipts(self):
        with self.assertRaises(SafetyError):
            sandbox_probe('/fake/codex', self.owner, self.tree, ['docs/result.md'], [], self.probe)
        with self.assertRaises(SafetyError):
            sandbox_probe('/fake/codex', self.owner, self.tree, ['.agent-output'], [], self.tree / 'probe')

    def test_failed_probe_is_fail_closed_and_never_launches_a_model(self):
        fake = subprocess.CompletedProcess([], 1, '', 'fixture sandbox unavailable')
        with mock.patch('writable_sandbox.socket.socket') as network, mock.patch('writable_sandbox.subprocess.run', return_value=fake) as run:
            network.return_value.__enter__.return_value.getsockname.return_value=('127.0.0.1', 12345)
            with self.assertRaises(SafetyError):
                sandbox_probe('/fake/codex', self.owner, self.tree, ['.agent-output'], [self.data], self.probe)
        command = run.call_args.args[0]
        self.assertEqual(command[1], 'sandbox')
        self.assertNotIn('exec', command)
        receipt = json.loads((self.probe / 'writable-sandbox-probe.json').read_text())
        self.assertFalse(receipt['passed'])
        self.assertFalse(receipt['model_called'])
        self.assertFalse(receipt['actual_credentials_opened'])
        self.assertEqual(self.data.read_text(), 'native_id,value\n123,4\n')

    def test_complete_probe_result_validated_and_dataset_and_git_unchanged(self):
        checks = {key: True for key in ['worktree_read_allowed', 'owner_read_denied', 'credential_canary_denied', 'git_metadata_denied', 'controller_write_denied', 'scoring_write_denied', 'outside_scope_write_denied', 'explicit_output_write_policy', 'datasets_read_only', 'network_denied', 'unix_socket_denied']}
        marker = (self.tree / '.git').read_bytes()
        with mock.patch('writable_sandbox.socket.socket') as network, mock.patch('writable_sandbox.subprocess.run', return_value=subprocess.CompletedProcess([], 0, json.dumps(checks), '')):
            network.return_value.__enter__.return_value.getsockname.return_value=('127.0.0.1', 12345)
            result = sandbox_probe('/fake/codex', self.owner, self.tree, ['.agent-output'], [self.data], self.probe, review=True)
        self.assertTrue(result['report']['passed'])
        self.assertEqual(result['profile'], REVIEW_PROFILE)
        self.assertEqual((self.tree / '.git').read_bytes(), marker)
        self.assertEqual(list((self.tree / '.agent-output').iterdir()), [])

    @unittest.skipUnless(os.environ.get('RUN_ACTUAL_CODEX_WORKTREE_PROBE') == '1', 'Explicit no-model host sandbox opt-in required.')
    def test_actual_installed_writable_and_review_profiles(self):
        binary = shutil.which('codex')
        self.assertTrue(binary)
        for review in (False, True):
            result = sandbox_probe(binary, self.owner, self.tree, ['.agent-output', 'docs/result.md'], [self.data], self.probe, review=review)
            self.assertTrue(result['report']['passed'])
            self.assertTrue(all(result['report']['checks'].values()))
        self.assertEqual(self.data.read_text(), 'native_id,value\n123,4\n')


if __name__ == '__main__':
    unittest.main()
