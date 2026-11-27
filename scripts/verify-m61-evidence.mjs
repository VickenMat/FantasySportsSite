import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {captureM6DependencyLock,lockFingerprint} from './m6-dependency-lock.mjs';
const digest=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const entries=['src/workers/freeze-m61-methodology.ts','src/workers/run-m61-historical-diagnostics.ts','src/workers/verify-m61-historical-leakage.ts','src/workers/verify-m61-scoring.ts'];
const runtime=await captureM6DependencyLock({entrypoints:entries});
const scripts=['scripts/m6_policy.py','scripts/prepare-m61-history.py','scripts/audit-m61-holdout.py','scripts/audit-m61-missingness.py','scripts/report-m61-methodology.py','scripts/report-m61-gates.py','scripts/report-m61-campaigns.py','scripts/report-m61-execution.py','scripts/sample-m61-scoring.py','scripts/verify-m61-preservation.mjs','scripts/verify-m61-evidence.mjs'];
const code=await Promise.all(scripts.map(async path=>({path,sha256:await digest(path)})));
const compilation=await load('reports/m61-compilation-proof.json');for(const [path,hash]of Object.entries(compilation.transformations))if(await digest(path)!==hash)throw Error('Compiled transform changed.');
for(const [path,hash]of Object.entries(compilation.reports))if(await digest(path)!==hash)throw Error('Compiled report changed.');
const selections=await load('reports/m61-diagnostic-selections.json');for(const source of selections.snapshots)if(await digest(source.path)!==source.sha256)throw Error('Derived diagnostic snapshot changed.');
const old=await load('reports/m6-historical-readiness.json'),nhl=await load('reports/m6-nhl-enrichment-readiness.json'),gate=await load('reports/m6-dataset-package.json');
let frozen=0;for(const source of [...old.cohorts,...nhl.cohorts,...gate.cohorts]){if(await digest(source.partition)!==source.partitionSha256)throw Error('Frozen partition/gate changed.');frozen++;}
const baseline=await load('reports/m61-accepted-cohorts.json');
const body={version:'m61-evidence-verification-1',gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),implementationUncommittedAtExecution:Boolean(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()),runtimeLock:runtime,dependencyFingerprint:lockFingerprint(runtime),code,frozenPartitionsAndGatesVerified:frozen,diagnosticSnapshotsVerified:selections.snapshots.length,compilationReportsVerified:Object.keys(compilation.reports).length,methodologyFingerprint:selections.methodologyFingerprint,acceptedCohortFingerprint:baseline.fingerprint,strictAuditUnchanged:await digest('reports/m6-simulation-gate-audit.json')===(await load('reports/m61-approved-model-gates.json')).strictAuditUnchanged,sourcePublicationOverwritten:false,productionWrites:0,v10Active:false};
if(!body.strictAuditUnchanged)throw Error('Strict audit changed');
await writeFile('reports/m61-evidence-verification.json',JSON.stringify(body,null,2)+'\n');console.log(JSON.stringify({frozen,diagnosticSnapshots:body.diagnosticSnapshotsVerified,dependencyFingerprint:body.dependencyFingerprint}));
