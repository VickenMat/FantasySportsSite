/** Runtime dependency provenance; no source acquisition or database access. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const root=process.cwd(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const lockFingerprint=value=>hash(JSON.stringify(stable(value)));
const entries=['src/workers/prepare-historical-simulation-records.ts','src/workers/enrich-historical-simulation-records.ts','src/workers/prepare-m6-role-quality.ts','src/workers/prepare-m6-pitching-timeline.ts','src/workers/prepare-m6-scoring-gates.ts'];
const pythonScripts=['scripts/prepare-m6-historical.py','scripts/enrich-m6-historical-nhl.py','scripts/prepare-m6-role-quality.py','scripts/prepare-m6-pitching-timeline.py','scripts/report-m6-preparation-impact.py','scripts/report-m6-operational-coverage.py','scripts/verify-m6-partition-replay.py','scripts/audit-m6-nhl-full-box.py','scripts/prepare-m6-scoring-package.py'];
export async function captureM6DependencyLock({entrypoints=entries}={}){
 const files=new Set(),bare=new Set(),builtins=new Set(),queue=[...entrypoints];
 for(let index=0;index<queue.length;index++){
  const path=queue[index];if(files.has(path))continue;files.add(path);
  const source=await readFile(path,'utf8'),js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText;
  const parsed=ts.createSourceFile(path,js,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS),references=[];
  const visit=node=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))references.push(node.moduleSpecifier.text);if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))references.push(node.arguments[0].text);ts.forEachChild(node,visit);};visit(parsed);
  for(const specifier of references){if(specifier.startsWith('node:')){builtins.add(specifier);continue;}if(!specifier.startsWith('.')&&!specifier.startsWith('@/')){bare.add(specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0]);continue;}
   const base=specifier.startsWith('@/')?resolve(root,'src',specifier.slice(2)):resolve(dirname(resolve(root,path)),specifier),target=[base,base+'.ts',base+'.tsx',resolve(base,'index.ts')].find(existsSync);if(!target)throw Error(`Unresolved M6 runtime module: ${path} -> ${specifier}`);queue.push(relative(root,target));
  }
 }
 const sourceFiles=[];for(const path of [...new Set([...files,...pythonScripts,'scripts/prepare-m6-dataset.mjs','scripts/m6-dependency-lock.mjs'])].sort())sourceFiles.push({path,sha256:hash(await readFile(path)),scope:files.has(path)?'TRANSITIVE_TYPESCRIPT_RUNTIME':'OFFLINE_PREPARATION_ENTRYPOINT'});
 for(const name of ['tsx','typescript'])bare.add(name);
 const packages=[];for(const name of [...bare].sort()){const path=`node_modules/${name}/package.json`,bytes=await readFile(path),metadata=JSON.parse(bytes);packages.push({name,version:metadata.version,packageJsonSha256:hash(bytes)});}
 const lockfiles=[];for(const path of ['package-lock.json','package.json','tsconfig.json'])lockfiles.push({path,sha256:hash(await readFile(path))});
 const python=spawnSync('python3',['-c','import json,sys,platform,pyarrow as pa;print(json.dumps({"python":platform.python_version(),"pythonImplementation":platform.python_implementation(),"system":platform.system(),"systemRelease":platform.release(),"machine":platform.machine(),"pyarrow":pa.__version__,"arrowCpp":pa.cpp_version,"arrowCppBuild":str(pa.cpp_build_info)}))'],{encoding:'utf8'});if(python.status!==0)throw Error('Unable to inspect installed Python/PyArrow versions.');
 return{version:'m6-runtime-dependency-lock-1',sourceFiles,packages,lockfiles,runtimes:{node:process.version,nodeComponentVersions:process.versions,intlLocale:Intl.DateTimeFormat().resolvedOptions().locale,...JSON.parse(python.stdout)},builtinModules:[...builtins].sort(),scope:'Declared preparation TypeScript entrypoint static/dynamic literal import closure, preparation entry points, package metadata/lockfiles and observed runtime versions. Type-only imports erased before traversal.',portableEnvironmentFullyImageLocked:false,limitations:['Native binaries, OS and all transitive npm module bytes are not a hermetic image lock; package-lock and installed package metadata are recorded.','Same-environment55-partition semantic/byte replay is separate evidence, not cross-platform byte portability.']};
}
export async function assertM6DependencyLock(expected){const current=await captureM6DependencyLock();if(lockFingerprint(current)!==lockFingerprint(expected))throw Error('M6 runtime dependencies/environment changed during preparation; final provenance publication refused.');}
export async function saveM6DependencyLock(lock){await mkdir('data/simulation/preparation-provenance',{recursive:true});const path=`data/simulation/preparation-provenance/runtime-${lockFingerprint(lock)}.json`;await writeFile(path,JSON.stringify({...lock,fingerprint:lockFingerprint(lock)},null,2)+'\n');return path;}
