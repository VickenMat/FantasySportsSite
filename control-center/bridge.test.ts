import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
it('keeps writable and legacy read-only activation scopes distinct without recording any decision',()=>{
 const code=`import runpy,sys,types,json
from pathlib import Path
module=runpy.run_path(sys.argv[1]); calls=[]
class Legacy:
 def activation_plan(self,id): calls.append('legacy');return {'id':id}
class Development:
 def __init__(self,repo): pass
 def activation_plan(self,id): calls.append('development');return {'id':id}
sys.modules['development']=types.SimpleNamespace(DevEngine=Development)
plan=module['activation_plan'];failure=module['SafetyError']
for scopes in [['enable_unattended'],['enable_writable_execution'],['enable_unattended','enable_unattended'],['enable_unattended','enable_writable_execution','implement']]:
 try: plan(Legacy(),Path('.'),{'id':'DEV-ACTIVATION-001','scope':scopes});raise AssertionError('wrong scopes accepted')
 except failure: pass
assert calls==[]
assert plan(Legacy(),Path('.'),{'id':'DEV-ACTIVATION-001','scope':['enable_unattended','enable_writable_execution']})['id']=='DEV-ACTIVATION-001'
assert calls==['development']
assert plan(Legacy(),Path('.'),{'id':'AUTO-ACTIVATION-001','scope':['enable_unattended']})['id']=='AUTO-ACTIVATION-001'
assert calls==['development','legacy']
print(json.dumps({'exactScopes':True,'decisionWrites':0,'activationCalls':0}))`;
 const result=JSON.parse(execFileSync('/usr/local/bin/python3',['-c',code,resolve('control-center/bridge.py')],{encoding:'utf8',timeout:5000}));
 expect(result).toEqual({exactScopes:true,decisionWrites:0,activationCalls:0});
});
