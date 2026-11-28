/** Corrected evidence closure run; preserves all M61 baseline trace files. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseSnapshot} from '@/simulation/snapshot';
import {runSimulationCycle} from '@/simulation/cycle';
import {seasonDiagnostics} from '@/simulation/diagnostics';
import {campaignSeed,protectHoldout} from '@/simulation/methodology/seeds';
import {fingerprint} from '@/ingestion/contracts';
const seed=Number(process.argv[2]??31);protectHoldout(2023,seed);
const report=JSON.parse(await readFile('reports/m62-terminal-evidence.json','utf8'));
const inputs=[];
for(const source of report.inputs){const bytes=await readFile(source.path);if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Derived evidence fingerprint differs.');inputs.push(parseSnapshot(bytes.toString()));}
const start=performance.now(),result=runSimulationCycle(inputs,{teams:12,seed,rankingModel:'TRAILING20_SHRINK4',lockMode:'INDIVIDUAL_GAME',classification:'DIAGNOSTIC',sharedBenchAllocation:campaignSeed(seed).sharedBenchAllocation,profile:true});
await mkdir('data/simulation/evidence_closure_v1/corrected',{recursive:true});
const output={version:'m62-reconciled-source-calendar-diagnostic-1',gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),seed,year:2023,methodologyChanged:false,methodologyFingerprint:JSON.parse(await readFile('reports/m61-approved-methodology.json','utf8')).fingerprint,elapsedMs:performance.now()-start,result,diagnostics:result.runs.map(seasonDiagnostics),inputs:report.inputs,officialBaseline:false,sourceCalendarChronologyStillUnaccepted:true,productionWrites:0};
await writeFile(`data/simulation/evidence_closure_v1/corrected/seed-${seed}.json`,JSON.stringify(output)+'\n');
console.log(JSON.stringify({seed,fingerprint:result.fingerprint,metrics:result.runs.map(r=>({sport:r.sport,known:r.metrics.scoredStarts,dnp:r.metrics.explicitDidNotPlayStarts,inapplicableRole:r.metrics.roleNotScoredAssignments,unresolved:r.metrics.unscoredStarts,truthAdded:r.metrics.sourceTruthAddedAssignments,expected:r.metrics.filledSlots}))}));
const old=JSON.parse(await readFile('data/simulation/evidence_closure_v1/baseline/seed31.json','utf8'));
const summary={version:'m62-corrected-seed31-1',seed,resultFingerprint:result.fingerprint,methodologyFingerprint:output.methodologyFingerprint,baselineTraceFingerprint:old.result.fingerprint,elapsedMs:output.elapsedMs,sourceCalendarDiagnosticOnly:true,officialSpread:null,sports:result.runs.map(r=>({sport:r.sport,original:old.result.runs.find((o:{sport:string})=>o.sport===r.sport).metrics,corrected:r.metrics,diagnostics:seasonDiagnostics(r)})),productionWrites:0};
if(seed===31)await writeFile('reports/m62-corrected-seed31.json',JSON.stringify({...summary,fingerprint:fingerprint(summary)},null,2)+'\n');
