#!/usr/bin/env python3
"""Prepare an exact inactive scheduling proposal; never approve, arm or install it."""
import argparse,hashlib,json,os,plistlib,sys
from pathlib import Path
from engine import Engine,SafetyError,atomic_json,fingerprint,task_fingerprint

CRITICAL=('scripts/automation/engine.py','scripts/automation/orchestrator.py',
          'scripts/automation/prepare_activation.py','scripts/automation/task_queue.schema.json',
          'scripts/automation/approval_queue.schema.json','scripts/automation/com.fantasyevolution.assisted.plist.in',
          'AGENTS.md','.gitignore','docs/AUTHORIZATION_POLICY.md','docs/DECISION_LOG.md',
          'docs/automation/AGENT_ROLES.md','package.json','package-lock.json')
def prepare(repo,bind=False):
    engine=Engine(repo)
    with engine.lock():
        if engine.control()['mode']!='assisted':raise SafetyError('Prepare only while assisted and no cycle is active.')
        manifest_path=engine.owner_root/'docs/automation/ACTIVATION_MANIFEST.json'
        existing=engine.approvals()
        if any(a.get('id')=='AUTO-ACTIVATION-001' and a.get('status')=='approved' for a in existing['approvals']):
            raise SafetyError('An approved target cannot be silently replaced; obtain a new reviewed proposal.')
        label='com.fantasyevolution.readonly'
        directory=engine.runtime/'launchd';directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        logs=engine.runtime/'scheduler-logs';logs.mkdir(exist_ok=True,mode=0o700)
        target=directory/(label+'.plist')
        arguments=[str(Path(sys.executable).resolve()),str(engine.owner_root/'scripts/automation/orchestrator.py'),
                   'cycle','--execute-read-only','--max-tasks','1','--timeout-seconds','180']
        plist={'Label':label,'ProgramArguments':arguments,'WorkingDirectory':str(engine.owner_root),
               'StartInterval':900,'RunAtLoad':False,'ProcessType':'Background','LowPriorityIO':True,'Nice':10,
               'StandardOutPath':str(logs/'launchd.stdout.log'),'StandardErrorPath':str(logs/'launchd.stderr.log')}
        payload=plistlib.dumps(plist,sort_keys=True)
        if target.is_symlink():raise SafetyError('Scheduler proposal cannot replace a symlink.')
        temporary=target.with_suffix('.tmp')
        with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as output:output.write(payload)
        os.replace(temporary,target)
        files={}
        control_sources=sorted(str(p.relative_to(engine.owner_root)) for p in (engine.owner_root/'control-center').rglob('*') if p.is_file() and (p.suffix in {'.ts','.tsx','.css','.html','.mjs','.py'} or p.name=='tsconfig.json') and '.test.' not in p.name)
        for name in [*CRITICAL,*control_sources,*sorted(str(p.relative_to(engine.owner_root)) for p in (engine.owner_root/'.codex/agents').glob('*.toml'))]:
            path=engine.owner_root/name
            if path.is_symlink() or not path.is_file():raise SafetyError('Missing or unsafe reviewed source: '+name)
            files[name]=hashlib.sha256(path.read_bytes()).hexdigest()
        manifest={'version':1,'files':files,'configuration':{'mode':'autonomous','execution_profile':'read_only_snapshot',
                  'max_tasks':1,'timeout_seconds':180,'interval_seconds':900,'max_attempts':3,
                  'daily_execution_limit':6,'scheduler_label':label},
                  'rendered_scheduler':{'path':str(target.relative_to(engine.owner_root)),
                                        'sha256':hashlib.sha256(payload).hexdigest()}}
        atomic_json(manifest_path,manifest)
        target_hash=fingerprint(manifest)
        result={'manifest':str(manifest_path),'target_fingerprint':target_hash,'scheduler':str(target),
                'installed':False,'armed':False,'approval_status':'pending'}
        if bind:
            queue=engine.queue();task=next(t for t in queue['tasks'] if t['id']=='AUTO-UNATTENDED-009')
            task['authorization_scope'].update(target_fingerprint=target_hash,approval_id='AUTO-ACTIVATION-001')
            approval=next(a for a in existing['approvals'] if a['id']=='AUTO-ACTIVATION-001')
            approval.update(target_fingerprint=target_hash,task_fingerprint=task_fingerprint(task),status='pending',decision=None)
            atomic_json(engine.queue_path,queue);atomic_json(engine.approval_path,existing)
            result['task_fingerprint']=task_fingerprint(task)
        return result
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--bind-pending-queues',action='store_true')
    args=parser.parse_args()
    try:print(json.dumps(prepare(args.repo,args.bind_pending_queues),indent=2))
    except (SafetyError,StopIteration) as error:print(str(error),file=sys.stderr);sys.exit(2)
