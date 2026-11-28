"""Exact development-scheduler proposals and owner-gated lifecycle controls.

Preparing a proposal never approves it, arms the controller or installs launchd.
The old read-only approval is deliberately ineligible for these functions.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import uuid

from engine import (SafetyError, atomic_json, approval_valid, child_environment,
                    fingerprint, read_json, stamp, task_fingerprint)

APPROVAL_ID = 'DEV-ACTIVATION-001'
TASK_ID = 'AUTO-DEVELOPMENT-001'
LABEL = 'com.fantasyevolution.development'
SCOPES = ['enable_unattended', 'enable_writable_execution']
MANIFEST = 'docs/automation/DEVELOPMENT_ACTIVATION_MANIFEST.json'
CONFIGURATION = {
    'mode': 'development_autonomous',
    'execution_profile': 'isolated_worktree_development',
    'max_tasks': 2,
    'max_specialists': 3,
    'max_active_model_stages': 1,
    'interval_seconds': 900,
    'max_attempts': 3,
    'daily_model_launch_limit': 16,
    'budgets': {'review': 300, 'research': 900, 'implementation': 1800, 'local': 7200},
    'scheduler_label': LABEL,
    'additional_spending_usd': 0,
}
CRITICAL = (
    'scripts/automation/engine.py', 'scripts/automation/development.py',
    'scripts/automation/development_activation.py', 'scripts/automation/orchestrator.py',
    'scripts/automation/task_queue.schema.json', 'scripts/automation/approval_queue.schema.json',
    'scripts/automation/com.fantasyevolution.development.plist.in',
    'docs/automation/DEVELOPMENT_TASKS.json', 'AGENTS.md', '.gitignore',
    'docs/AUTHORIZATION_POLICY.md', 'docs/DECISION_LOG.md',
    'docs/automation/AGENT_ROLES.md', 'package.json', 'package-lock.json',
)
CONTROL_CRITICAL = (
    'control-center/server.ts', 'control-center/bridge.py', 'control-center/security.ts',
    'control-center/policy.ts', 'control-center/cli.mjs', 'control-center/tsconfig.json',
)


def _owner_only():
    if os.environ.get('AUTOMATION_AGENT_CONTEXT') == '1':
        raise SafetyError('Managed agents cannot arm, install or remove owner scheduler controls.')


def _rooted(engine, relative):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts:
        raise SafetyError('Development activation paths must remain inside the repository.')
    target = engine.owner_root / path
    current = engine.owner_root
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise SafetyError('Development activation cannot follow symlinked inputs.')
    if not target.resolve().is_relative_to(engine.owner_root.resolve()):
        raise SafetyError('Development activation input escaped the repository.')
    return target


def _sources(engine):
    names = set(CRITICAL)
    if (engine.owner_root / 'control-center').exists():
        names.update(CONTROL_CRITICAL)
        for path in (engine.owner_root / 'control-center').rglob('*'):
            if path.is_file() and '.test.' not in path.name and (
                    path.suffix in {'.ts', '.tsx', '.css', '.html', '.mjs', '.py'}
                    or path.name == 'tsconfig.json'):
                names.add(str(path.relative_to(engine.owner_root)))
    for folder, pattern in [('scripts/automation', '*.py'), ('.codex/agents', '*.toml')]:
        for path in (engine.owner_root / folder).glob(pattern):
            if not path.name.startswith('.'):
                names.add(str(path.relative_to(engine.owner_root)))
    result = {}
    for name in sorted(names):
        path = _rooted(engine, name)
        if not path.is_file():
            raise SafetyError('A required development activation source is missing: ' + name)
        result[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def _queue_authorizations(engine):
    # The activation task references the manifest, so including its final target
    # here would create a circular hash. Its separate exact task hash is checked
    # against the owner approval. Other tasks include their development grants.
    return [{key: task.get(key) for key in ('id', 'milestone', 'dependencies', 'assigned_role',
                                            'authorization_scope', 'execution_kind', 'development')}
            for task in sorted(engine.queue()['tasks'], key=lambda row: row['id'])
            if task['id'] != TASK_ID]


def _plist(engine):
    return {
        'Label': LABEL,
        'ProgramArguments': [str(Path(sys.executable).resolve()),
                             str(engine.owner_root / 'scripts/automation/orchestrator.py'),
                             'develop', '--max-tasks', '2'],
        'WorkingDirectory': str(engine.owner_root), 'StartInterval': 900,
        'RunAtLoad': False, 'ProcessType': 'Background', 'LowPriorityIO': True, 'Nice': 10,
        'StandardOutPath': str(engine.runtime / 'scheduler-logs/development.stdout.log'),
        'StandardErrorPath': str(engine.runtime / 'scheduler-logs/development.stderr.log'),
    }


def _atomic_bytes(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise SafetyError('Scheduler records cannot replace symlinks.')
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def _task(engine):
    matches = [task for task in engine.queue()['tasks'] if task['id'] == TASK_ID]
    if len(matches) != 1 or set(matches[0]['authorization_scope']['actions']) != set(SCOPES):
        raise SafetyError('A separate exact development activation task is required.')
    return matches[0]


def _approval_matches(engine, task, plan):
    try:
        return approval_valid(task['authorization_scope'], plan['task_fingerprint'], SCOPES, engine.approvals())
    except (AttributeError, TypeError, ValueError):
        return False


def verify(engine, require_approval=True):
    manifest = read_json(_rooted(engine, MANIFEST))
    if not isinstance(manifest, dict) or set(manifest) != {'version', 'kind', 'configuration', 'files', 'queue_authorizations', 'rendered_scheduler'}:
        raise SafetyError('Unexpected development activation manifest fields.')
    if manifest['version'] != 1 or manifest['kind'] != 'AUTONOMOUS_DEVELOPMENT_PROPOSAL' or manifest['configuration'] != CONFIGURATION:
        raise SafetyError('Development activation configuration differs from the reviewed bounded policy.')
    if manifest['files'] != _sources(engine):
        raise SafetyError('Development activation source hashes changed.')
    if manifest['queue_authorizations'] != _queue_authorizations(engine):
        raise SafetyError('Development task authorization changed.')
    scheduler = manifest['rendered_scheduler']
    relative = '.automation/launchd/' + LABEL + '.plist'
    if not isinstance(scheduler, dict) or set(scheduler) != {'path', 'sha256'} or scheduler['path'] != relative:
        raise SafetyError('Unexpected development scheduler path.')
    path = _rooted(engine, relative)
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != scheduler['sha256']:
        raise SafetyError('Rendered development scheduler changed.')
    try:
        rendered = plistlib.loads(path.read_bytes())
    except (ValueError, plistlib.InvalidFileException) as error:
        raise SafetyError('Rendered development scheduler is invalid.') from error
    if rendered != _plist(engine):
        raise SafetyError('Rendered development scheduler is not the exact reviewed command.')
    task = json.loads(json.dumps(_task(engine)))
    task['authorization_scope'].update(target_fingerprint=fingerprint(manifest), approval_id=APPROVAL_ID)
    plan = {'target_fingerprint': fingerprint(manifest), 'task_fingerprint': task_fingerprint(task),
            'task_id': TASK_ID, 'approval_id': APPROVAL_ID,
            'configuration': json.loads(json.dumps(CONFIGURATION)), 'manifest': manifest}
    if require_approval:
        actual = _task(engine)
        if actual['authorization_scope'].get('approval_id') != APPROVAL_ID or actual['authorization_scope'].get('target_fingerprint') != plan['target_fingerprint'] or task_fingerprint(actual) != plan['task_fingerprint'] or not _approval_matches(engine, actual, plan):
            raise SafetyError('New exact unexpired human development approval is required; read-only approval is insufficient.')
    return plan


def development_activation_plan(engine):
    return verify(engine, require_approval=False)


def prepare(engine, bind_pending=False):
    if bind_pending:
        _owner_only()
    with engine.lock():
        if engine.control()['mode'] not in {'assisted', 'manual'}:
            raise SafetyError('Prepare development scheduling only while the controller is inactive and assisted/manual.')
        approvals = engine.approvals()
        matches = [entry for entry in approvals['approvals'] if entry.get('id') == APPROVAL_ID]
        if len(matches) != 1 or not isinstance(matches[0].get('scope'), list) or not all(isinstance(item, str) for item in matches[0]['scope']) or set(matches[0]['scope']) != set(SCOPES):
            raise SafetyError('A distinct pending development approval record is required.')
        if matches[0].get('status') == 'approved':
            raise SafetyError('An approved development target cannot be silently replaced.')
        _task(engine)
        path = _rooted(engine, '.automation/launchd/' + LABEL + '.plist')
        (engine.runtime / 'scheduler-logs').mkdir(exist_ok=True, mode=0o700)
        payload = plistlib.dumps(_plist(engine), sort_keys=True)
        _atomic_bytes(path, payload)
        manifest = {'version': 1, 'kind': 'AUTONOMOUS_DEVELOPMENT_PROPOSAL',
                    'configuration': json.loads(json.dumps(CONFIGURATION)), 'files': _sources(engine),
                    'queue_authorizations': _queue_authorizations(engine),
                    'rendered_scheduler': {'path': str(path.relative_to(engine.owner_root)),
                                           'sha256': hashlib.sha256(payload).hexdigest()}}
        atomic_json(_rooted(engine, MANIFEST), manifest)
        plan = development_activation_plan(engine)
        if bind_pending:
            queue = engine.queue()
            actual = next(task for task in queue['tasks'] if task['id'] == TASK_ID)
            actual['authorization_scope'].update(target_fingerprint=plan['target_fingerprint'], approval_id=APPROVAL_ID)
            matches[0].update(status='pending', decision=None, expires_at=None,
                              target_fingerprint=plan['target_fingerprint'], task_fingerprint=plan['task_fingerprint'])
            atomic_json(engine.queue_path, queue)
            atomic_json(engine.approval_path, approvals)
        return {**{key: plan[key] for key in ('target_fingerprint', 'task_fingerprint', 'task_id', 'approval_id', 'configuration')},
                'manifest': str(engine.owner_root / MANIFEST), 'scheduler': str(path),
                'installed': False, 'armed': False, 'approval_status': 'pending'}


def _armed(engine, plan):
    receipt = read_json(engine.runtime / 'development-activation.json')
    if not isinstance(receipt, dict) or receipt.get('status') != 'armed' or any(receipt.get(key) != plan[key] for key in ('target_fingerprint', 'task_fingerprint', 'task_id', 'approval_id', 'configuration')):
        raise SafetyError('The exact development policy has not been separately armed.')
    return receipt


def verify_armed(engine):
    """Execution guard: approval is necessary but is not the arming action."""
    plan = verify(engine)
    _armed(engine, plan)
    return plan


def activate(engine, approval_id=APPROVAL_ID):
    _owner_only()
    if approval_id != APPROVAL_ID:
        raise SafetyError('The read-only approval cannot arm development execution.')
    with engine.lock():
        if engine.control()['mode'] not in {'assisted', 'manual'}:
            raise SafetyError('Resolve pause/stop or prior activation before arming development scheduling.')
        plan = verify(engine)
        receipt = {key: plan[key] for key in ('target_fingerprint', 'task_fingerprint', 'task_id', 'approval_id', 'configuration')}
        receipt.update(status='armed', activated_at=stamp(), scheduler_installed=False)
        atomic_json(engine.runtime / 'development-activation.json', receipt)
        state = engine.state()
        state['tasks'].setdefault(TASK_ID, {}).update(
            status='verification', definition_fingerprint=plan['task_fingerprint'],
            blocker_classification='APPROVED_DEVELOPMENT_ARMED_SCHEDULER_NOT_INSTALLED')
        engine.save(state)
        with engine.lock('control', True):
            atomic_json(engine.control_path, {'version': 1, 'mode': CONFIGURATION['mode'],
                                             'reason': 'EXACT_OWNER_DEVELOPMENT_APPROVAL', 'updated_at': stamp()})
        engine.event('owner_armed_development_mode', target_fingerprint=plan['target_fingerprint'], scheduler_installed=False)
        return {'mode': CONFIGURATION['mode'], 'target_fingerprint': plan['target_fingerprint'], 'scheduler_installed': False}


def _destination():
    directory = Path.home() / 'Library/LaunchAgents'
    current = Path.home()
    for part in ('Library', 'LaunchAgents'):
        current = current / part
        if current.is_symlink():
            raise SafetyError('Owner launchd directory cannot be a symlink.')
    return directory / (LABEL + '.plist')


def _launchctl(arguments):
    if sys.platform != 'darwin':
        raise SafetyError('The reviewed development scheduler requires macOS launchd.')
    result = subprocess.run(['/bin/launchctl', *arguments], env=child_environment(),
                            capture_output=True, timeout=10)
    if result.returncode:
        raise SafetyError('Reviewed launchd operation failed; preserve records for owner recovery.')


def _job_loaded():
    if sys.platform != 'darwin':
        raise SafetyError('The reviewed development scheduler requires macOS launchd.')
    result = subprocess.run(['/bin/launchctl', 'print', 'gui/' + str(os.getuid()) + '/' + LABEL],
                            env=child_environment(), capture_output=True, timeout=10)
    if result.returncode == 0:
        return True
    # Never interpret arbitrary launchctl failure (e.g. denied access) as absence.
    message = result.stderr.decode(errors='replace').lower()
    if 'could not find service' in message or 'no such process' in message:
        return False
    raise SafetyError('Cannot verify the owned launchd job; retain installation records.')


def install(engine, approval_id=APPROVAL_ID):
    _owner_only()
    if approval_id != APPROVAL_ID:
        raise SafetyError('A separate development approval is required.')
    with engine.lock():
        plan = verify(engine)
        receipt = _armed(engine, plan)
        if engine.control()['mode'] != CONFIGURATION['mode']:
            raise SafetyError('The separately armed development mode is required before install.')
        destination = _destination()
        if (destination.parent / 'com.fantasyevolution.readonly.plist').exists():
            raise SafetyError('Explicitly remove the previous read-only scheduler before development installation.')
        payload = (engine.owner_root / plan['manifest']['rendered_scheduler']['path']).read_bytes()
        if destination.exists() or destination.is_symlink():
            raise SafetyError('An existing launchd file must be inspected, never overwritten.')
        _atomic_bytes(destination, payload)
        record = {'label': LABEL, 'destination': str(destination), 'sha256': hashlib.sha256(payload).hexdigest(),
                  'target_fingerprint': plan['target_fingerprint'], 'status': 'prepared_for_install', 'at': stamp()}
        atomic_json(engine.runtime / 'development-installation.json', record)
        _launchctl(['bootstrap', 'gui/' + str(os.getuid()), str(destination)])
        record.update(status='installed', at=stamp())
        atomic_json(engine.runtime / 'development-installation.json', record)
        receipt['scheduler_installed'] = True
        atomic_json(engine.runtime / 'development-activation.json', receipt)
        engine.event('development_scheduler_installed', target_fingerprint=plan['target_fingerprint'])
        return {'installed': True, 'label': LABEL, 'target_fingerprint': plan['target_fingerprint']}


def uninstall(engine, approval_id=APPROVAL_ID):
    # Stopping a known owned job must remain possible after approval expiry or
    # source changes. This grants no execution and cannot remove an unknown job.
    _owner_only()
    if approval_id != APPROVAL_ID:
        raise SafetyError('This lifecycle command handles only the development scheduler.')
    with engine.lock():
        if engine.control()['mode'] == CONFIGURATION['mode']:
            with engine.lock('control', True):
                atomic_json(engine.control_path, {'version': 1, 'mode': 'paused',
                                                 'reason': 'OWNER_DEVELOPMENT_UNINSTALL', 'updated_at': stamp()})
        record = read_json(engine.runtime / 'development-installation.json', {})
        if not isinstance(record, dict):
            raise SafetyError('Invalid installation receipt; owner inspection required.')
        destination = _destination()
        if record.get('status') == 'uninstalled' and not destination.exists() and not destination.is_symlink():
            record = {}
        if not record:
            if destination.exists() or destination.is_symlink():
                raise SafetyError('No owned installation receipt; refusing to remove an existing file.')
        else:
            if record.get('label') != LABEL or record.get('destination') != str(destination) or destination.is_symlink() or not destination.is_file() or hashlib.sha256(destination.read_bytes()).hexdigest() != record.get('sha256'):
                raise SafetyError('Installed file ownership changed; no file or job was removed.')
            if record.get('status') not in {'installed', 'prepared_for_install'}:
                raise SafetyError('Installation recovery requires owner inspection.')
            # Bootstrap may have succeeded immediately before the process died,
            # leaving only the pre-install receipt. Observe the actual job first.
            if _job_loaded():
                _launchctl(['bootout', 'gui/' + str(os.getuid()) + '/' + LABEL])
            destination.unlink()
            record.update(status='uninstalled', at=stamp())
            atomic_json(engine.runtime / 'development-installation.json', record)
        receipt = read_json(engine.runtime / 'development-activation.json', {})
        if receipt:
            receipt.update(status='disarmed', scheduler_installed=False, disarmed_at=stamp())
            atomic_json(engine.runtime / 'development-activation.json', receipt)
        engine.event('development_scheduler_uninstalled', installed=False)
        return {'installed': False, 'mode': engine.control()['mode']}
