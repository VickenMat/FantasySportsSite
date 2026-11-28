/** Offline replay, leakage and immutable-artifact proof for the new settlement layer. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseSnapshot} from '@/simulation/snapshot';
import {runSimulationCycle} from '@/simulation/cycle';
import {campaignSeed} from '@/simulation/methodology/seeds';
import {captureM6DependencyLock,lockFingerprint} from '../../scripts/m6-dependency-lock.mjs';
const load=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const hash=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
const binding=await load('reports/m62-terminal-evidence.json');
const inputs=[];for(const source of binding.inputs){if(await hash(source.path)!==source.sha256)throw Error('Changed derived input');inputs.push(parseSnapshot(await readFile(source.path,'utf8')));}
const config={teams:12,seed:31,rankingModel:'TRAILING20_SHRINK4' as const,lockMode:'INDIVIDUAL_GAME' as const,classification:'DIAGNOSTIC' as const,sharedBenchAllocation:campaignSeed(31).sharedBenchAllocation,profile:true};
const replay=runSimulationCycle(inputs,config),before=await load('data/simulation/evidence_closure_v1/corrected/seed-31.json');if(replay.fingerprint!==before.result.fingerprint)throw Error('Independent corrected replay differs');
const without=runSimulationCycle(inputs.map(i=>({...i,actualMembership:[],terminalEvidence:[]})),config);
for(let i=0;i<replay.runs.length;i++)for(const field of ['draft','managerAssignments','lineups','waivers'] as const)if(JSON.stringify(replay.runs[i].trace?.[field])!==JSON.stringify(without.runs[i].trace?.[field]))throw Error(`Terminal truth leaked into ${field}`);
let frozen=0;for(const report of ['reports/m6-historical-readiness.json','reports/m6-nhl-enrichment-readiness.json','reports/m6-dataset-package.json'])for(const s of (await load(report)).cohorts){if(await hash(s.partition)!==s.partitionSha256)throw Error('Frozen data changed');frozen++;}
const original=await hash('data/simulation/evidence_closure_v1/baseline/seed31.json');if(original!=='d80f04a4deefe266c77c052d0ac3766aa63a515af202402445d6cc4125e0735e')throw Error('Original trace changed');
const strictAuditUnchanged=await hash('reports/m6-simulation-gate-audit.json')===(await load('reports/m61-approved-model-gates.json')).strictAuditUnchanged;
if(!strictAuditUnchanged)throw Error('Strict historical audit changed');
const accepted=await load('reports/m61-accepted-cohorts.json');if(accepted.officialBaselineRunnable||accepted.acceptedFourSportCycles.length)throw Error('Unexpected accepted-cycle promotion');
const runtime=await captureM6DependencyLock({entrypoints:['src/workers/run-m62-reconciled-2023.ts','src/workers/verify-m62-evidence.ts']});
const scripts=['scripts/reconcile-m62-starters.py','scripts/report-m62-bridge.py','scripts/prepare-m62-terminal-evidence.py','scripts/reconcile-m62-game-evidence.py','scripts/verify-m62-nfl-inventory.py','scripts/m62_terminal.py','scripts/report-m62-policies.py','scripts/fetch-m62-nhl-references.mjs','src/workers/fetch-m62-evidence.ts'];
const proof={version:'m62-evidence-proof-1',resultFingerprint:replay.fingerprint,independentReplayMatches:true,terminalTruthDoesNotChangeDecisions:true,leakageSports:replay.runs.map(r=>r.sport),frozenPartitionsAndGates:frozen,originalTraceSha256:original,strictAuditUnchanged,acceptedFourSportCycles:0,methodologyFingerprint:before.methodologyFingerprint,runtimeLock:runtime,dependencyFingerprint:lockFingerprint(runtime),scripts:await Promise.all(scripts.map(async path=>({path,sha256:await hash(path)}))),officialBaseline:false,productionWrites:0};
await writeFile('reports/m62-evidence-verification.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({replay:replay.fingerprint,frozen,leakageSports:proof.leakageSports}));
