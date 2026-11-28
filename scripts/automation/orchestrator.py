#!/usr/bin/env python3
"""Local bounded controller; default cycle is a dry run in assisted mode."""
import argparse,json,sys
from pathlib import Path
from engine import Engine,SafetyError,task_fingerprint

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2])
parser.add_argument('--runtime',type=Path)
parser.add_argument('--queue',type=Path)
parser.add_argument('--approvals',type=Path)
commands=parser.add_subparsers(dest='command',required=True)
for command in ['status','tasks','handoff','pause','stop']:commands.add_parser(command)
resume=commands.add_parser('resume');resume.add_argument('--acknowledge-stop',action='store_true')
cycle=commands.add_parser('cycle');cycle.add_argument('--execute-read-only',action='store_true');cycle.add_argument('--max-tasks',type=int,default=1);cycle.add_argument('--timeout-seconds',type=int,default=180);cycle.add_argument('--codex',default='/opt/homebrew/bin/codex')
worktree=commands.add_parser('worktree');worktree.add_argument('--task-id',required=True)
fingerprint=commands.add_parser('fingerprint');fingerprint.add_argument('--task-id',required=True)
activation=commands.add_parser('activation-plan');activation.add_argument('--approval-id',default='AUTO-ACTIVATION-001')
activate=commands.add_parser('activate');activate.add_argument('--approval-id',required=True)
review=commands.add_parser('review');review.add_argument('--task-id',required=True);review.add_argument('--task-fingerprint',required=True);review.add_argument('--reviewer',choices=['project_owner','orchestrator','independent_reviewer'],required=True);review.add_argument('--reviewer-run-id',required=True);review.add_argument('--evidence',required=True);review.add_argument('--decision',choices=['accept','reject'],required=True);review.add_argument('--associated-commit')
develop=commands.add_parser('develop');develop.add_argument('--max-tasks',type=int,default=2);develop.add_argument('--dry-run',action='store_true')
recover=commands.add_parser('recover-development');recover.add_argument('--task-id',required=True);recover.add_argument('--worktree',required=True);recover.add_argument('--head',required=True)
for name in ['development-plan','prepare-development','activate-development','install-development','uninstall-development']:
 sub=commands.add_parser(name);sub.add_argument('--approval-id',default='DEV-ACTIVATION-001')
args=parser.parse_args()
try:
 engine=Engine(args.repo,args.runtime,args.queue,args.approvals)
 if args.command in {'develop','recover-development','development-plan','prepare-development','activate-development','install-development','uninstall-development'}:
  from development import DevEngine
  engine=DevEngine(args.repo,args.runtime,args.queue,args.approvals)
  if args.command=='develop':result=engine.develop(not args.dry_run,args.max_tasks)
  elif args.command=='recover-development':result=engine.recover_checkpoint(args.task_id,args.worktree,args.head)
  else:
   import development_activation as activation
   if args.command=='development-plan':result=engine.activation_plan(args.approval_id)
   elif args.command=='prepare-development':result=activation.prepare(engine,bind_pending=True)
   elif args.command=='activate-development':result=activation.activate(engine,args.approval_id)
   elif args.command=='install-development':result=activation.install(engine,args.approval_id)
   else:result=activation.uninstall(engine,args.approval_id)
 elif args.command=='status':result=engine.status()
 elif args.command=='tasks':result=engine.status()['tasks']
 elif args.command=='handoff':result=[task for task in engine.status()['tasks'] if task['status']=='verification']
 elif args.command=='pause':result=engine.pause()
 elif args.command=='stop':result=engine.pause(True)
 elif args.command=='resume':result=engine.resume(args.acknowledge_stop)
 elif args.command=='cycle':result=engine.cycle(args.execute_read_only,args.max_tasks,args.timeout_seconds,args.codex)
 elif args.command=='worktree':result=engine.worktree(args.task_id)
 elif args.command=='activation-plan':result=engine.activation_plan(args.approval_id)
 elif args.command=='activate':result=engine.activate(args.approval_id)
 elif args.command=='review':result=engine.review(args.task_id,args.task_fingerprint,args.reviewer,args.reviewer_run_id,args.evidence,args.decision,args.associated_commit)
 elif args.command=='fingerprint':
  task=next(task for task in engine.queue()['tasks'] if task['id']==args.task_id);result={'task_id':task['id'],'task_fingerprint':task_fingerprint(task)}
 print(json.dumps(result,indent=2,ensure_ascii=False))
except (SafetyError,ValueError,StopIteration) as error:
 print(json.dumps({'error':str(error) or 'Task not found','type':type(error).__name__}),file=sys.stderr);sys.exit(2)
