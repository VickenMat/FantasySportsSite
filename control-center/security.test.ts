import {it,expect} from 'vitest';
import {publicAutomation,publicApproval,validateControl} from './security';
it('projects allowlisted public fields and redacts credential-shaped text',()=>{const result=publicAutomation({mode:'assisted',apiKey:'secret',tasks:[{id:'t',title:'Test',description:'password=hunter2',privateDatabaseRows:[1],result_path:'/private/logs'}]});expect(JSON.stringify(result)).not.toContain('hunter2');expect(JSON.stringify(result)).not.toContain('privateDatabase');expect(JSON.stringify(result)).not.toContain('result_path');expect(publicApproval({id:'a',rawAuthorization:'secret'})).not.toHaveProperty('rawAuthorization');});
it('refuses shell actions, injected fields and credential guidance',()=>{expect(()=>validateControl({action:'exec',command:'anything'})).toThrow();expect(()=>validateControl({action:'pause',actor:'human'})).toThrow();expect(()=>validateControl({action:'guidance',taskId:'t',guidance:'api_key=private'})).toThrow();expect(validateControl({action:'pause'})).toBe('pause');});

it('allows only two fixed start workflows and never interprets arbitrary arguments',async()=>{
 const {executionArguments,publicDevelopmentProfile}=await import('./security');
 expect(validateControl({action:'start',workflow:'development',confirmed:true})).toBe('start');
 expect(executionArguments(undefined,false)).toEqual(['cycle','--execute-read-only','--max-tasks','1','--timeout-seconds','180']);
 expect(executionArguments('development',true)).toEqual(['develop','--max-tasks','2']);
 expect(()=>executionArguments('development',false)).toThrow();
 for(const workflow of ['shell','development --max-tasks 999',{},1])expect(()=>validateControl({action:'start',workflow,confirmed:true})).toThrow();
 expect(()=>validateControl({action:'start',workflow:'development',command:'ignored'})).toThrow();
 expect(publicDevelopmentProfile({available:false,budgets:{implementation:1800},credential:'private'})).toMatchObject({available:false,budgets:{implementation:1800}});
 expect(JSON.stringify(publicDevelopmentProfile({available:true,credential:'private'}))).not.toContain('private');
});
it('exposes bounded task phase and scope without raw model messages or credentials',()=>{
 const data=publicAutomation({active_run:{run_id:'r',phase:'reviewing',child:{pid:42,secret:'never'}},tasks:[{id:'t',phase:'testing',worktree_path:'/private/tmp/reviewed-worktree',implementation_scope:['reports/fixture.json'],execution_budget:{implementation_seconds:1800},rawMessages:'secret'}]});
 expect(data.active_run).toMatchObject({phase:'reviewing',child:{pid:42}});expect(data.tasks[0]).toMatchObject({phase:'testing',implementation_scope:['reports/fixture.json']});expect(JSON.stringify(data)).not.toContain('secret');
});
it('keeps distinct model phases and independent historical sessions separate from live managed PIDs',async()=>{
 const {agentProjection}=await import('./server');
 const state={process_observation_available:true,active_run_observed_alive:true,active_run:{run_id:'review',task_id:'t',child:{pid:42},controller:{pid:21}},tasks:[{id:'t',run_id:'review',phase:'reviewing',status:'running',worktree_path:'/tmp/isolated',branch:'automation/t',implementation_scope:['reports/test.json'],execution_history:[{run_id:'implementation',phase:'implementation'}]}]};
 const result=agentProjection(state,[{runId:'implementation',taskId:'t',state:'completed'},{runId:'review',taskId:'t',state:'running'},{runId:'history:external',sessionId:'external',state:'historical'}],()=>({worktree:null,lastActivity:null}));
 expect(result).toHaveLength(3);expect(result[0]).toMatchObject({phase:'implementation',active:false,state:'completed'});
 expect(result[1]).toMatchObject({phase:'reviewing',active:true,state:'reviewing',childPid:42,controllerPid:21,scope:['reports/test.json']});
 expect(result[2]).toMatchObject({managed:false,active:false,state:'historical',provenance:'independent_historical_codex_session',childPid:null});
 const unavailable=agentProjection({...state,process_observation_available:false,active_run_observed_alive:false},[{runId:'review',taskId:'t',state:'running'}],()=>({worktree:null,lastActivity:null}));expect(unavailable[0]).toMatchObject({active:null,state:'unavailable',childPid:null});
});
