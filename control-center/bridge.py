"""Fixed owner-control adapter for the existing controller. No arbitrary commands."""
import datetime as dt,json,os,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/automation'))
from engine import Engine,SafetyError,BusyError,atomic_json,read_json,task_fingerprint,stamp,now,parse_time,terminate_group,owned_group_members,process_identity,ID,SHA

def control(repo,payload):
 if os.environ.get('AUTOMATION_AGENT_CONTEXT')=='1':raise SafetyError('Managed agents cannot operate owner controls.')
 engine=Engine(repo);action=payload.get('action')
 if action=='status':
  result=engine.status();result['process_observation_available']=process_identity(os.getpid()) is not None
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
  try:
   plan=engine.activation_plan();return {'stale':False,'targetFingerprint':plan['target_fingerprint'],'taskFingerprint':plan['task_fingerprint']}
  except (SafetyError,OSError,ValueError):return {'stale':True}
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
   return {'max_specialists':value,'execution':'serial read-only; native children disabled'}
  if action in {'prioritize','guidance'}:
   task=next((t for t in queue['tasks'] if t['id']==payload.get('taskId')),None)
   if not task:raise SafetyError('Unknown task.')
   if action=='prioritize':
    priority=payload.get('priority')
    if isinstance(priority,bool) or not isinstance(priority,int) or not 0<=priority<=1000:raise SafetyError('Invalid priority.')
    task['priority']=priority
   else:
    merged=next(t for t in engine.merged(queue,engine.state()) if t['id']==task['id'])
    if merged['status']!='ready' or merged.get('attempt_count',0):raise SafetyError('Guidance may only change an unclaimed ready task; use a reviewed follow-up for prior executions.')
    value=payload.get('guidance')
    if not isinstance(value,str) or not 1<=len(value.strip())<=2000 or any(ord(c)<32 and c not in '\n\t' for c in value):raise SafetyError('Guidance must be plain text, at most 2000 characters.')
    # Explicit owner guidance changes the exact task definition, not authority.
    task['description']+='\n\nOwner guidance (within existing authorization only):\n'+value.strip()
    if len(task['description'])>16000:raise SafetyError('Task description limit exceeded.')
   atomic_json(engine.queue_path,queue);return {'taskId':task['id'],'taskFingerprint':task_fingerprint(task)}
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
   if approval.get('scope')==['enable_unattended']:
    plan=engine.activation_plan(approval['id'])
    if plan['target_fingerprint']!=target or plan['task_fingerprint']!=task_hash:raise SafetyError('Activation proposal is stale.')
   else:raise SafetyError('This control center currently reviews only the prepared read-only activation policy.')
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
