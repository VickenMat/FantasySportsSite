"""Fixed owner-control adapter for the existing controller. No arbitrary commands."""
import datetime as dt,json,os,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/automation'))
from engine import Engine,SafetyError,BusyError,atomic_json,read_json,task_fingerprint,stamp,now,parse_time,terminate_group,owned_group_members,process_identity,ID,SHA

def development_profile(repo):
 try:
  from development import DevEngine
  return DevEngine(repo).profile()
 except (ImportError,AttributeError,SafetyError,OSError,ValueError):
  return {'available':False,'reason':'Reviewed development profile is unavailable.'}

def activation_plan(engine,repo,approval):
 # Dispatch by the exact prepared approval ID, never reuse read-only authority.
 if approval.get('id')=='DEV-ACTIVATION-001':
  if not isinstance(approval.get('scope'),list) or len(approval['scope'])!=2 or set(approval['scope'])!={'enable_unattended','enable_writable_execution'}:raise SafetyError('Development activation requires both exact restricted scopes.')
  from development import DevEngine
  return DevEngine(repo).activation_plan(approval['id'])
 if approval.get('scope')!=['enable_unattended']:raise SafetyError('Unsupported restricted approval scope.')
 return engine.activation_plan(approval['id'])

def control(repo,payload):
 if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1':raise SafetyError('Managed agents cannot operate owner controls.')
 engine=Engine(repo);action=payload.get('action')
 if action=='status':
  result=engine.status();result['development_profile']=development_profile(repo)
  result['process_observation_available']=process_identity(os.getpid()) is not None
  try:
   with engine.lock():result['controller_lease_busy']=False
  except BusyError:result['controller_lease_busy']=True
  active=result.get('active_run',{});alive=bool(active.get('child') and owned_group_members(active['child']))
  result['active_run_observed_alive']=alive
  result['recovery_required']=bool(active and not alive)
  try:registry=read_json(engine.runtime/'control-center/controller.json',{})
  except (ValueError,OSError,SafetyError):registry={};result['recovery_required']=True
  result['orchestrator_observed_alive']=bool(registry.get('identity') and process_identity(registry['identity']['pid'])==registry['identity'])
  return result
 if action=='proposal':
  plans={}
  for approval in engine.approvals().get('approvals',[]):
   identifier=approval.get('id')
   if not isinstance(identifier,str):continue
   try:
    plan=activation_plan(engine,repo,approval)
    plans[identifier]={'stale':False,'targetFingerprint':plan['target_fingerprint'],'taskFingerprint':plan['task_fingerprint']}
   except (SafetyError,OSError,ValueError,ImportError,AttributeError):plans[identifier]={'stale':True}
  return {'plans':plans}

 if action=='identity':return {'identity':process_identity(int(payload['pid'])),'observationAvailable':process_identity(os.getpid()) is not None}
 if action=='pause':return engine.pause()
 if action=='stop':return engine.pause(True)
 if action=='resume':return engine.resume(payload.get('acknowledgeStop') is True)
 if action=='cancel':
  with engine.lock('control',True):
   active=read_json(engine.run_path,{})
   if not active or active.get('run_id')!=payload.get('runId'):raise SafetyError('The selected execution is no longer current.')
   atomic_json(engine.control_path,{'version':1,'mode':'paused','reason':'OWNER_CANCELLED_EXECUTION','updated_at':stamp()})
  return {'mode':'paused','cancelled':terminate_group(active.get('child'))}
 if action not in {'prioritize','guidance','concurrency','approve','reject'}:raise SafetyError('Unsupported owner control.')
 with engine.lock():
  queue=engine.queue()
  if action=='concurrency':
   value=payload.get('limit')
   if isinstance(value,bool) or not isinstance(value,int) or not 1<=value<=3:raise SafetyError('Concurrency must be between one and three.')
   queue['max_specialists']=value;atomic_json(engine.queue_path,queue)
   return {'max_specialists':value,'execution':'configured maximum; actual stages and liveness are reported separately'}
  if action in {'prioritize','guidance'}:
   grant_update=None
   task=next((t for t in queue['tasks'] if t['id']==payload.get('taskId')),None)
   if not task:raise SafetyError('Unknown task.')
   if action=='prioritize':
    merged=next(t for t in engine.merged(queue,engine.state()) if t['id']==task['id'])
    if merged['status'] in {'running','testing','reviewing','integrating','verification'}:raise SafetyError('Claimed task priority cannot be changed.')
    priority=payload.get('priority')
    if isinstance(priority,bool) or not isinstance(priority,int) or not 0<=priority<=1000:raise SafetyError('Invalid priority.')
    task['priority']=priority
   else:
    merged=next(t for t in engine.merged(queue,engine.state()) if t['id']==task['id'])
    if merged['status']!='ready' or merged.get('attempt_count',0):raise SafetyError('Guidance may only change an unclaimed ready task; use a reviewed follow-up for prior executions.')
    if task.get('execution_kind')=='writable_implementation':
     from development import DevEngine
     DevEngine(repo).policy(task,validate_data=False)
     grant_path=engine.owner_root/'docs/automation/DEVELOPMENT_TASKS.json'
     grant=read_json(grant_path)
     if grant.get('version')!=1 or grant.get('tasks',{}).get(task['id'])!={'task_fingerprint':task_fingerprint(task),'development':task.get('development')}:raise SafetyError('Exact unchanged owner grant required before guidance.')
     grant_update=(grant_path,grant)
    value=payload.get('guidance')
    if not isinstance(value,str) or not 1<=len(value.strip())<=2000 or any(ord(c)<32 and c not in '\n\t' for c in value):raise SafetyError('Guidance must be plain text, at most 2000 characters.')
    # Explicit owner guidance changes the exact task definition, not authority.
    task['description']+='\n\nOwner guidance (within existing authorization only):\n'+value.strip()
    if len(task['description'])>16000:raise SafetyError('Task description limit exceeded.')
   atomic_json(engine.queue_path,queue)
   if grant_update:
    grant_path,grant=grant_update
    # A crash between either atomic replace leaves mismatched hashes and fails closed.
    # Only the text-bound task hash changes; the owner-granted scope is identical.
    grant['tasks'][task['id']]['task_fingerprint']=task_fingerprint(task)
    atomic_json(grant_path,grant)
   return {'taskId':task['id'],'taskFingerprint':task_fingerprint(task),'activationReviewRequired':grant_update is not None}
  approvals=engine.approvals();approval=next((a for a in approvals['approvals'] if a.get('id')==payload.get('approvalId')),None)
  if not approval or approval.get('status') not in {'pending','approved'}:raise SafetyError('No current reviewable approval exists.')
  if payload.get('confirmed') is not True:raise SafetyError('Explicit confirmation is required.')
  target=payload.get('targetFingerprint');task_hash=payload.get('taskFingerprint')
  if not isinstance(target,str) or not SHA.fullmatch(target) or not isinstance(task_hash,str) or not SHA.fullmatch(task_hash) or approval.get('target_fingerprint')!=target or approval.get('task_fingerprint')!=task_hash:raise SafetyError('The exact reviewed target has changed.')
  if action=='approve':
   if approval.get('status')!='pending':raise SafetyError('Approval is already decided.')
   raw_expiry=payload.get('expiresAt')
   if not isinstance(raw_expiry,str):raise SafetyError('Explicit expiration is required.')
   expires=parse_time(raw_expiry)
   if expires<=now():raise SafetyError('A future explicit expiration is required.')
   candidates=[t for t in queue['tasks'] if t['authorization_scope'].get('approval_id')==approval['id']]
   if len(candidates)!=1 or task_fingerprint(candidates[0])!=task_hash or candidates[0]['authorization_scope'].get('target_fingerprint')!=target:raise SafetyError('Approval does not bind the current task.')
   plan=activation_plan(engine,repo,approval)
   if plan['target_fingerprint']!=target or plan['task_fingerprint']!=task_hash:raise SafetyError('Activation proposal is stale.')
   approval.update(status='approved',expires_at=stamp(expires))
  else:approval['status']='rejected'
  approval['decision']={'actor_kind':'human','actor':'project_owner','recorded_at':stamp(),'source_reference':'Authenticated local Control Center owner session; explicit exact-target confirmation'}
  atomic_json(engine.approval_path,approvals)
  # Recording approval NEVER arms the controller or installs a scheduler.
  return {'approvalId':approval['id'],'status':approval['status'],'armed':False,'installed':False}

if __name__=='__main__':
 try:
  repo=Path(sys.argv[1]).resolve();payload=json.loads(sys.stdin.read(16385));print(json.dumps(control(repo,payload)))
 except (SafetyError,OSError,ValueError,TypeError,KeyError) as error:
  print(json.dumps({'error':str(error) if isinstance(error,SafetyError) else 'Invalid or unavailable control operation.','kind':'busy' if isinstance(error,BusyError) else 'refused'}));sys.exit(2)
