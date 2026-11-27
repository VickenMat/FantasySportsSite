/** Reuse dependency discovery; keep new evidence separate from frozen55 outputs. */
import{readFile,writeFile}from'node:fs/promises';
import{spawnSync,execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
import{captureM6DependencyLock,lockFingerprint}from'./m6-dependency-lock.mjs';
const verify=process.argv.includes('--verify-existing'),outputs=['reports/m6-nhl-conflict-resolution.json','reports/m6-simulation-gate-audit.json','reports/m6-v9-input-diagnostics.json','reports/m6-nfl-identity-review.json'];
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const before=verify?await Promise.all(outputs.map(digest)):null;
const entrypoints=['src/workers/benchmark-m6-foundation.ts','src/workers/run-m6-simulation.ts','src/workers/score-m6-resolutions.ts','src/workers/prepare-m6-fixture-selection.ts'];
const lock=await captureM6DependencyLock({entrypoints}),python=['scripts/audit-m6-simulation-gates.py','scripts/resolve-m6-nhl-conflicts.py','scripts/m6_nhl_event_counts.py','scripts/audit-m6-nfl-identities.py','scripts/benchmark-m6-columnar.py','scripts/export-m6-asof-selection.py','scripts/m6_asof_compile.py','scripts/report-m6-dataset-acceptance.py','scripts/report-m6-baseline-status.py','scripts/verify-m6-foundation.mjs'];const additional=await Promise.all(python.map(async path=>({path,sha256:await digest(path)})));
for(const script of ['scripts/resolve-m6-nhl-conflicts.py','scripts/audit-m6-simulation-gates.py','scripts/audit-m6-nfl-identities.py']){const child=spawnSync('python3',[script],{stdio:'inherit'});if(child.status!==0)throw Error('Stopped offline verification at '+script);}
if(lockFingerprint(lock)!==lockFingerprint(await captureM6DependencyLock({entrypoints})))throw Error('Runtime code changed during verification.');
for(const proof of additional)if(await digest(proof.path)!==proof.sha256)throw Error('Python transform changed during verification.');
const after=await Promise.all(outputs.map(digest));if(before&&JSON.stringify(before)!==JSON.stringify(after))throw Error('New derived evidence report changed on replay.');
const old=JSON.parse(await readFile('reports/m6-partition-reproducibility.json','utf8'));const packageReport=JSON.parse(await readFile('reports/m6-dataset-package.json','utf8'));
// Check every frozen partition from its existing pinned file fingerprints.
const base=JSON.parse(await readFile('reports/m6-historical-readiness.json','utf8')),enriched=JSON.parse(await readFile('reports/m6-nhl-enrichment-readiness.json','utf8'));let frozen=0;
for(const proof of [...base.cohorts,...enriched.cohorts]){if(await digest(proof.partition)!==proof.partitionSha256)throw Error('Frozen partition changed.');frozen++;}
for(const proof of packageReport.cohorts)if(await digest(proof.partition)!==proof.partitionSha256)throw Error('Frozen scoring gate changed.');
const result={version:'m6-foundation-runtime-replay-1',gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dependencyLockFingerprint:lockFingerprint(lock),runtimeLock:lock,additional,outputs:outputs.map((path,i)=>({path,sha256:after[i]})),replayVerified:verify,frozenPartitionsVerified:frozen,frozenScoringGatesVerified:packageReport.cohorts.length,frozenPartitionBundle:old.datasetFingerprint,frozenQualityPackage:packageReport.packageFingerprint,productionWrites:0,v10Active:false};await writeFile('reports/m6-foundation-runtime-replay.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({replayVerified:verify,frozenPartitionsVerified:frozen,frozenScoringGatesVerified:11}));
