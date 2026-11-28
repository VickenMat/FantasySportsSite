"""Least-privilege worktree profiles and no-model enforcement probes.

No login, model invocation, credential read, database connection, scheduler or
Git mutation occurs here. The integration authority owns worktree creation.
"""
from __future__ import annotations

import errno
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import uuid

from engine import SafetyError, atomic_json, child_environment

PROFILE = 'automation-worktree'
REVIEW_PROFILE = 'automation-worktree-review'
# Scoring is inspectable, but never writable by an autonomous task.
READ_ONLY = ('src/scoring', 'src/server/score-ledger.ts', 'src/server/score-administration.ts',
             'src/server/competition-scoring.ts', 'src/simulation/scoring.ts',
             'src/workers/recalculate-score.ts', 'prisma', 'src/generated', 'node_modules')
DENIED = ('.git', '.automation', '.codex', '.agents', '.aws', '.ssh', 'data',
          'docs/automation', 'scripts/automation', '.env', '.env.*', '.npmrc',
          '.netrc', '.gitconfig', '.git-credentials', '.pypirc', '**/.env',
          '**/.env.*', '**/*.env', '**/.npmrc', '**/auth.json', '**/.git')
SAFE_COMPONENT = re.compile(r'^[A-Za-z0-9_.-]+$')


def _inside(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def _absolute(raw, *, existing=False) -> Path:
    path = Path(raw)
    if not path.is_absolute() or '..' in path.parts:
        raise SafetyError('Sandbox roots require absolute, nontraversing paths.')
    # Canonicalize system aliases such as /tmp, but never accept a declared
    # root which itself is a symlink to a different resource.
    if path.is_symlink():
        raise SafetyError('Sandbox roots cannot be symlinks.')
    try:
        result = path.resolve(strict=existing)
    except OSError as error:
        raise SafetyError('Sandbox root is missing or inaccessible.') from error
    if existing and not result.exists():
        raise SafetyError('Sandbox root is missing.')
    return result


def _relative(raw) -> Path:
    value = str(raw)
    path = Path(value)
    if not value or path.is_absolute() or value in ('.', './') or any(
        part in ('.', '..') or not SAFE_COMPONENT.fullmatch(part)
        for part in value.rstrip('/').split('/')
    ):
        raise SafetyError('Writable scope must name explicit worktree descendants.')
    if len(path.parts) > 20 or len(value) > 512:
        raise SafetyError('Writable path is unbounded.')
    for part in path.parts:
        if part.startswith('.env') or part.endswith('.env') or part in (
            '.git', '.automation', '.codex', '.agents', '.aws', '.ssh',
            '.npmrc', '.netrc', '.gitconfig', '.git-credentials', '.pypirc',
            'auth.json', 'auth.toml', 'config.toml',
        ):
            raise SafetyError('Credential, Git or controller paths are protected.')
    for protected in (*READ_ONLY, 'data', 'docs/automation', 'scripts/automation'):
        other = Path(protected)
        if _inside(path, other) or _inside(other, path):
            raise SafetyError('Writable scope overlaps protected source or control paths.')
    return path


def _roots(owner_root, worktree):
    owner = _absolute(owner_root, existing=True)
    tree = _absolute(worktree, existing=True)
    if not owner.is_dir() or not tree.is_dir() or _inside(owner, tree):
        raise SafetyError('An isolated worktree distinct from main is required.')
    marker = tree / '.git'
    if marker.is_symlink() or not marker.is_file() or marker.stat().st_size > 4096:
        raise SafetyError('Expected a linked Git worktree marker.')
    value = marker.read_text().strip()
    if not value.startswith('gitdir: '):
        raise SafetyError('Malformed linked Git worktree marker.')
    raw = Path(value[8:])
    try:
        gitdir = (raw if raw.is_absolute() else tree / raw).resolve(strict=True)
        if (owner / '.git').is_symlink():
            raise SafetyError('Owner Git directory cannot be a symlink.')
        owner_git = (owner / '.git').resolve(strict=True)
    except OSError as error:
        raise SafetyError('Worktree Git directory is missing or inaccessible.') from error
    if not _inside(gitdir, owner_git) or not gitdir.is_dir():
        raise SafetyError('Worktree Git directory belongs to a different owner.')
    common_marker = gitdir / 'commondir'
    if common_marker.is_symlink() or not common_marker.is_file() or common_marker.stat().st_size > 4096:
        raise SafetyError('Worktree common Git directory must be explicit.')
    common = (gitdir / common_marker.read_text().strip()).resolve(strict=True)
    if common != owner_git:
        raise SafetyError('Worktree common Git directory differs from owner.')
    return owner, tree, gitdir, common


def _scopes(owner, tree, writable_paths, dataset_paths):
    if not isinstance(writable_paths, (list, tuple)) or len(writable_paths) > 64:
        raise SafetyError('At most64 explicit writable paths are supported.')
    if not isinstance(dataset_paths, (list, tuple)) or len(dataset_paths) > 64:
        raise SafetyError('At most64 explicit read-only data paths are supported.')
    writable = []
    for raw in writable_paths:
        relative = _relative(raw)
        target = tree / relative
        for parent in (target, *target.parents):
            if parent == tree:
                break
            if parent.is_symlink():
                raise SafetyError('Writable paths cannot traverse symlinks.')
        if not _inside(target.resolve(), tree):
            raise SafetyError('Writable path escaped its worktree.')
        writable.append(target)
    datasets = []
    for raw in dataset_paths:
        path = _absolute(raw, existing=True)
        supplied = Path(raw)
        if supplied.absolute() != path:
            raise SafetyError('Read-only data paths must be canonical without symlink aliases.')
        if not (_inside(path, owner / 'data') or _inside(path, owner / 'node_modules')):
            raise SafetyError('Only approved owner data/dependency paths can be read-mounted.')
        for part in path.relative_to(owner).parts:
            if part.startswith('.env') or part.endswith('.env') or part in ('.git', '.codex', '.automation', '.aws', '.ssh', 'auth.json'):
                raise SafetyError('Dataset allowlist overlaps a credential/control path.')
        if not (path.is_file() or path.is_dir()):
            raise SafetyError('Dataset input must be a regular file or directory.')
        if any(_inside(path, target) or _inside(target, path) for target in writable):
            raise SafetyError('Input datasets cannot overlap output scope.')
        datasets.append(path)
    return sorted(set(writable)), sorted(set(datasets))


def _toml(value):
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(key) + '=' + _toml(item) for key, item in value.items()) + '}'
    return json.dumps(value)


def permission_flags(owner_root, worktree, writable_paths, dataset_paths, review=False):
    """Return per-invocation named-profile overrides; never pass --sandbox too.

    writable_paths are explicit worktree-relative files/directories. dataset_paths
    are canonical owner/data or owner/node_modules files/directories, always read.
    Profiles fence local commands, not external MCP/browser/connector surfaces.
    """
    if not isinstance(review, bool):
        raise SafetyError('Review mode must be an explicit boolean.')
    owner, tree, gitdir, common = _roots(owner_root, worktree)
    writable, datasets = _scopes(owner, tree, writable_paths, dataset_paths)
    filesystem = {':root': 'deny', ':minimal': 'read', str(owner): 'deny',
                  str(Path.home() / '.codex'): 'deny', str(Path.home() / '.ssh'): 'deny',
                  str(Path.home() / '.aws'): 'deny',
                  str(Path.home() / 'Library' / 'Keychains'): 'deny',
                  ':tmpdir': 'deny', ':slash_tmp': 'deny'}
    if os.environ.get('CODEX_HOME'):
        filesystem[str(Path(os.environ['CODEX_HOME']).resolve())] = 'deny'
    # Grant runtime installations only, never the user's whole home or Homebrew.
    filesystem[str(Path(sys.executable).resolve().parents[1])] = 'read'
    node = shutil.which('node', path='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')
    if node:
        filesystem[str(Path(node).resolve().parents[1])] = 'read'
    # Harden common same-user credential/OS-automation entry points. These
    # denials are not an OS-account boundary: arbitrary native code can have
    # other service interfaces, so do not claim complete same-user isolation.
    for command in ('/usr/bin/security', '/usr/bin/osascript'):
        filesystem[command] = 'deny'
        filesystem[str(Path(command).resolve())] = 'deny'
    filesystem[str(tree)] = {'.': 'read', **{path: 'deny' for path in DENIED},
                              **{path: 'read' for path in READ_ONLY}}
    for path in writable:
        filesystem[str(path)] = 'read' if review else 'write'
    for path in datasets:
        filesystem[str(path)] = 'read'
        if path.is_dir():
            # Exact and glob denies remain narrower than a dataset directory.
            filesystem[str(path)] = {'.': 'read', '**/.env': 'deny', '**/.env.*': 'deny',
                                     '**/*.env': 'deny', '**/auth.json': 'deny',
                                     '**/.git': 'deny', '**/.npmrc': 'deny'}
    # Git metadata is inaccessible even if a future output scope is broad.
    filesystem[str(tree / '.git')] = 'deny'
    filesystem[str(gitdir)] = 'deny'
    filesystem[str(common)] = 'deny'
    profile = REVIEW_PROFILE if review else PROFILE
    return ['-c', f'default_permissions="{profile}"', '-c',
            f'permissions.{profile}.filesystem=' + _toml(filesystem), '-c',
            f'permissions.{profile}.network.enabled=false']


PROBE = r'''import errno,json,os,socket,sys
scope=json.loads(sys.argv[1]); result={}
def denied_read(path):
 try:
  fd=os.open(path,os.O_RDONLY);os.close(fd);return False
 except OSError as error:return error.errno in (errno.EPERM,errno.EACCES)
def denied_write(path):
 try:
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(fd);os.unlink(path);return False
 except OSError as error:return error.errno in (errno.EPERM,errno.EACCES)
result['worktree_read_allowed']=open(scope['allowed_read']).read()=='harmless-readable-canary'
result['owner_read_denied']=denied_read(scope['owner_canary'])
result['credential_canary_denied']=denied_read(scope['credential_canary'])
result['git_metadata_denied']=denied_read(scope['git_marker'])
result['controller_write_denied']=denied_write(scope['controller_write'])
result['scoring_write_denied']=denied_write(scope['scoring_write'])
result['outside_scope_write_denied']=denied_write(scope['outside_write'])
result['explicit_output_write_policy']=denied_write(scope['output_write'])==scope['review']
result['datasets_read_only']=True
for path,directory in scope['datasets']:
 try:
  fd=os.open(path,os.O_RDONLY);os.close(fd)
 except OSError:result['datasets_read_only']=False;continue
 if directory:result['datasets_read_only'] &= denied_write(os.path.join(path,scope['dataset_canary_name']))
 else:
  try:
   fd=os.open(path,os.O_WRONLY);os.close(fd);result['datasets_read_only']=False
  except OSError as error:result['datasets_read_only'] &= error.errno in(errno.EPERM,errno.EACCES)
try:
 s=socket.socket();s.settimeout(1);s.connect(('127.0.0.1',scope['port']));s.close();result['network_denied']=False
except OSError as error:result['network_denied']=error.errno in(errno.EPERM,errno.EACCES)
try:
 s=socket.socket(socket.AF_UNIX);s.settimeout(1);s.connect(scope['unix_socket']);s.close();result['unix_socket_denied']=False
except OSError as error:result['unix_socket_denied']=error.errno in(errno.EPERM,errno.EACCES)
print(json.dumps(result,sort_keys=True))
'''


def sandbox_probe(binary, owner_root, worktree, writable_paths, dataset_paths,
                  probe_directory, env=None, review=False):
    """Prove the selected profile without a model, using harmless canaries only.

    The controller must include .agent-output as an explicit scratch directory.
    A failed/missing/unsupported sandbox is a hard stop, never a weaker fallback.
    """
    owner, tree, _, _ = _roots(owner_root, worktree)
    writable, datasets = _scopes(owner, tree, writable_paths, dataset_paths)
    scratch = tree / '.agent-output'
    if scratch not in writable:
        raise SafetyError('An explicit .agent-output scratch scope is required for probes.')
    directory = _absolute(probe_directory)
    if not _inside(directory, owner / '.automation') or _inside(directory, tree):
        raise SafetyError('Probe receipts must be private owner control records.')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.is_symlink():
        raise SafetyError('Probe receipt directory cannot be a symlink.')
    flags = permission_flags(owner, tree, writable_paths, dataset_paths, review)
    profile = REVIEW_PROFILE if review else PROFILE
    tag = uuid.uuid4().hex
    canaries = directory / f'canaries-{tag}'
    canaries.mkdir(mode=0o700)
    parent = canaries / 'parent-canary'
    credential = canaries / 'fake-auth.json'
    parent.write_text('harmless-parent-canary')
    credential.write_text('{"fake_token":"harmless-not-a-credential"}')
    os.chmod(parent, 0o600); os.chmod(credential, 0o600)
    scratch.mkdir(parents=True, exist_ok=True)
    allowed = scratch / f'read-canary-{tag}'
    allowed.write_text('harmless-readable-canary')
    controller = tree / '.automation'
    scoring = tree / 'src' / 'scoring'
    controller.mkdir(exist_ok=True)
    scoring.mkdir(parents=True, exist_ok=True)
    probe_home = directory / 'probe-codex-home'
    probe_home.mkdir(exist_ok=True, mode=0o700)
    prefix = f'.sandbox-canary-{tag}'
    paths = [allowed, scratch / prefix, controller / prefix, scoring / prefix, tree / prefix]
    try:
        with tempfile.TemporaryDirectory(prefix='fe-sandbox-socket-',dir='/private/tmp') as socket_dir, socket.socket() as listener, socket.socket(socket.AF_UNIX) as unix_listener:
            listener.bind(('127.0.0.1', 0)); listener.listen(1)
            unix_socket = str(Path(socket_dir) / 's')
            unix_listener.bind(unix_socket); unix_listener.listen(1)
            specification = {'allowed_read': str(allowed), 'owner_canary': str(parent),
                             'credential_canary': str(credential), 'git_marker': str(tree / '.git'),
                             'controller_write': str(paths[2]), 'scoring_write': str(paths[3]),
                             'outside_write': str(paths[4]), 'output_write': str(paths[1]),
                             'datasets': [(str(p), p.is_dir()) for p in datasets],
                             'dataset_canary_name': prefix, 'review': review,
                             'port': listener.getsockname()[1], 'unix_socket': unix_socket}
            # No inherited DB/API/cloud credentials, shell startup hooks or auth.
            environment = child_environment()
            if env:
                for key in ('PATH', 'LANG', 'LC_ALL', 'TERM'):
                    if key in env:
                        environment[key] = env[key]
            environment['CODEX_HOME'] = str(probe_home)
            result = subprocess.run([str(Path(binary).resolve()), 'sandbox', '-P', profile,
                                     '-C', str(tree), *flags, '--',
                                     str(Path(sys.executable).resolve()), '-c', PROBE,
                                     json.dumps(specification)], cwd=tree, env=environment,
                                    capture_output=True, text=True, timeout=20)
        try:
            checks = json.loads(result.stdout)
        except (json.JSONDecodeError, TypeError):
            checks = {}
        required = {'worktree_read_allowed', 'owner_read_denied', 'credential_canary_denied',
                    'git_metadata_denied', 'controller_write_denied', 'scoring_write_denied',
                    'outside_scope_write_denied', 'explicit_output_write_policy',
                    'datasets_read_only', 'network_denied', 'unix_socket_denied'}
        report = {'passed': result.returncode == 0 and set(checks) == required and
                  all(value is True for value in checks.values()), 'checks': checks,
                  'returncode': result.returncode, 'profile': profile,
                  'actual_credentials_opened': False, 'model_called': False,
                  'legacy_sandbox_override': False, 'dataset_count': len(datasets)}
        atomic_json(directory / ('review-sandbox-probe.json' if review else 'writable-sandbox-probe.json'), report)
        if not report['passed']:
            raise SafetyError('Worktree filesystem/network canary failed; model execution denied.')
        return {'flags': flags, 'profile': profile, 'report': report}
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SafetyError('Worktree sandbox is unavailable or timed out; model execution denied.') from error
    finally:
        for path in paths:
            path.unlink(missing_ok=True)
        for path in datasets:
            if path.is_dir():
                (path / prefix).unlink(missing_ok=True)
