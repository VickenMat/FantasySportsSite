#!/usr/bin/env node
/** Local lifecycle only. No login, model call, credit purchase or scheduler activation. */
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,existsSync,openSync,closeSync,copyFileSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url))),runtime=join(repo,'.automation/control-center');
process.umask(0o077);for(const path of [join(repo,'.automation'),runtime]){if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Unsafe private runtime.');mkdirSync(path,{recursive:true,mode:0o700});}
const env={PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,LANG:'en_US.UTF-8',...(process.env.CODEX_HOME?{CODEX_HOME:process.env.CODEX_HOME}:{})};
const python='/usr/local/bin/python3',metaPath=join(runtime,'server.json');
const readMeta=()=>{try{return JSON.parse(readFileSync(metaPath,'utf8'));}catch{return null;}};
const [action='status',...args]=process.argv.slice(2);const portArg=args.indexOf('--port');const port=portArg>=0?Number(args[portArg+1]):3100;
let observationAvailable=false;
const identity=(pid)=>{const result=spawnSync(python,[join(repo,'control-center/bridge.py'),repo],{input:JSON.stringify({action:'identity',pid}),encoding:'utf8',env,timeout:5000});try{const parsed=JSON.parse(result.stdout);observationAvailable=parsed.observationAvailable===true;return parsed.identity;}catch{return null;}};
async function compile(){const folder=join(runtime,'web');mkdirSync(folder,{recursive:true,mode:0o700});await build({entryPoints:[join(repo,'control-center/ui/main.tsx')],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:join(folder,'app.js'),minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});copyFileSync(join(repo,'control-center/ui/index.html'),join(folder,'index.html'));console.log('Control Center frontend built locally.');}
try{
 if(action==='build')await compile();
 else if(action==='credentials'){const path=join(runtime,'owner-password.txt');if(!existsSync(path))throw Error('Start the local Control Center first.');console.log(`Open this owner-only file locally to retrieve the password: ${path}`);console.log('The password is never returned by the dashboard or printed by this command.');}
 else if(action==='status'){const meta=readMeta(),actual=meta?.pid?identity(meta.pid):null;const live=actual&&meta.identity&&JSON.stringify(actual)===JSON.stringify(meta.identity);console.log(JSON.stringify({running:live?true:meta&&!observationAvailable?null:false,processObservation:observationAvailable?'verified':'unavailable',url:live?`http://localhost:${meta.port}`:null,schedulerActivated:false}));}
 else if(action==='stop'){const meta=readMeta(),actual=meta?.pid?identity(meta.pid):null;if(!actual||!meta.identity||JSON.stringify(actual)!==JSON.stringify(meta.identity))throw Error('No verified owned dashboard process to stop; no unrelated process was signalled.');process.kill(meta.pid,'SIGTERM');console.log('Sent shutdown to the verified dashboard process. Agent/controller and scheduler state were not changed.');}
 else if(action==='start'){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port.');
  const meta=readMeta(),actual=meta?.pid?identity(meta.pid):null;if(actual&&meta.identity&&JSON.stringify(actual)===JSON.stringify(meta.identity)){console.log(`Already running at http://localhost:${meta.port}`);process.exit(0);}
  await compile();const out=openSync(join(runtime,'server.stdout.log'),'a',0o600),err=openSync(join(runtime,'server.stderr.log'),'a',0o600);
  const child=spawn(process.execPath,['--import','tsx',join(repo,'control-center/server.ts')],{cwd:repo,env:{...env,CONTROL_CENTER_PORT:String(port)},detached:true,stdio:['ignore',out,err]});closeSync(out);closeSync(err);child.once('error',()=>{});child.unref();
  let ready=false;for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));const current=readMeta();if(current?.pid===child.pid&&current.identity){ready=true;break;}if(child.exitCode!==null)break;}
  if(!ready)throw Error('Dashboard did not start. Inspect private server.stderr.log; choose another --port if3100isoccupied.');
  console.log(`Agent Control Center: http://localhost:${port}`);console.log('Owner password: npm run control-center:credentials (local terminal only).');
 }else throw Error('Commands: build, start [--port3100], status, stop, credentials');
}catch(error){console.error(error.message);process.exitCode=1;}
