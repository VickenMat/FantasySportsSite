/** Public offline entrypoint. Complete inputs are never scoring authorization;
 * the final package requires full-vector corroboration and its quarantine mask. */
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {captureM6DependencyLock,assertM6DependencyLock,saveM6DependencyLock} from './m6-dependency-lock.mjs';
const options=new Set(process.argv.slice(2));if([...options].some(value=>value!=='--verify-existing'))throw Error('Supported option: --verify-existing.');
const verify=options.has('--verify-existing');
const commands=verify?[['python3','scripts/verify-m6-partition-replay.py'],['python3','scripts/prepare-m6-scoring-package.py','--verify-existing']]:['scripts/prepare-m6-historical.py','scripts/enrich-m6-historical-nhl.py','scripts/prepare-m6-role-quality.py','scripts/prepare-m6-pitching-timeline.py','scripts/report-m6-preparation-impact.py','scripts/verify-m6-partition-replay.py','scripts/audit-m6-nhl-full-box.py'].map(script=>['python3',script]).concat([['node','scripts/report-m6-dependency-provenance.mjs'],['python3','scripts/prepare-m6-scoring-package.py']]);
const dependencyLock=await captureM6DependencyLock();
if(verify){const provenance=JSON.parse(await readFile('reports/m6-dependency-provenance.json','utf8'));await assertM6DependencyLock(provenance.reviewRuntimeLock);}
const startupLockPath=await saveM6DependencyLock(dependencyLock);
for(const [command,...args]of commands){await assertM6DependencyLock(dependencyLock);const result=spawnSync(command,args,{stdio:'inherit'});if(result.status!==0)throw Error(`M6 preparation stopped at ${args[0]}; no final scoring-qualified package approved. Original sources/database remain untouched.`);await assertM6DependencyLock(dependencyLock);}
console.log(`Runtime provenance: ${startupLockPath}`);
