/** Real archive source-calendar diagnostics, never an accepted baseline.
 * No DB imports. Holdout seasons/seeds are rejected before snapshot reads. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fingerprint} from '@/ingestion/contracts';
import {parseSnapshot} from '@/simulation/snapshot';
import {runSimulationCycle} from '@/simulation/cycle';
import {seasonDiagnostics} from '@/simulation/diagnostics';
import {campaignSeed,protectHoldout} from '@/simulation/methodology/seeds';
import {fixedAppearanceBounds} from '@/simulation/methodology/uncertainty';
import type {SimulationInput} from '@/simulation/types';
const year=Number(process.argv[2]??2023), seeds=(process.argv[3]??'31').split(',').map(Number);
for(const seed of seeds)protectHoldout(year,seed);
const report=JSON.parse(await readFile('reports/m61-diagnostic-selections.json','utf8'));
const accepted=JSON.parse(await readFile('reports/m61-accepted-cohorts.json','utf8'));
const selectionHashes:Record<string,string>={};
const variants={primarySourceCalendar:{informationModel:'TWO_DAY',positionModel:'DATED_CARRY',rankingModel:'TRAILING20_SHRINK4',lockMode:'INDIVIDUAL_GAME'},weekly:{informationModel:'WEEKLY'},nbaPriorEstimate:{positionModel:'PRIOR_ESTIMATE'},dailyFreeze:{lockMode:'DAILY_FIRST_START'},v5:{rankingModel:'V5_TRAILING10_PRIOR_FALLBACK'},priorOnly:{rankingModel:'PRIOR_SEASON_ONLY'},unusedBench:{unusedBench:true},soLow:{shutoutScenario:'LOW'},soHigh:{shutoutScenario:'HIGH'}} as const;
const requested=(process.argv[4]??'primarySourceCalendar').split(',') as (keyof typeof variants)[];
const cache=new Map<string,SimulationInput[]>();
async function inputsFor(informationModel:string,positionModel:string){
 const key=informationModel+positionModel;if(cache.has(key))return cache.get(key)!;
 const sources=report.snapshots.filter((s:{year:number;informationModel:string;positionModel:string})=>s.year===year&&s.informationModel===informationModel&&s.positionModel===positionModel);
 if(sources.length!==4)throw Error('Four exact source diagnostic snapshots required.');
 const inputs=[];
 for(const source of sources){const bytes=await readFile(source.path),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==source.sha256)throw Error('Historical snapshot changed.');selectionHashes[source.path]=hash;const parsed=parseSnapshot(bytes.toString());
 // Retain raw inputs only for a separate uncertainty calculation; production scorer remains sole evaluator.
 const raw=JSON.parse(bytes.toString());const rawByKey=new Map<string,{stats:Record<string,number|null>;teEligible?:boolean}>(raw.outcomes.map((r:{playerId:string;gameId:string;role:string;stats:Record<string,number|null>;teEligible?:boolean})=>[JSON.stringify([r.playerId,r.gameId,r.role]),r]));
 inputs.push({...parsed,outcomes:parsed.outcomes.map(o=>({...o,scoringInputs:rawByKey.get(JSON.stringify([o.playerId,o.gameId,o.role]))}))});}
 cache.set(key,inputs);return inputs;
}
const records=[];await mkdir(`data/simulation/approved_model_v1/campaigns/${year}`,{recursive:true});
for(const variant of requested){
 if(!variants[variant])throw Error('Unregistered sensitivity dimension.');
 const config={...variants.primarySourceCalendar,...variants[variant]};let inputs=await inputsFor(config.informationModel,config.positionModel);
 if('shutoutScenario' in config)inputs=inputs.map(input=>({...input,outcomes:input.outcomes.map(o=>{if(o.missingStats.length!==1||o.missingStats[0]!=='shutout'||!o.scoringInputs)return o;const bound=fixedAppearanceBounds(o.role,o.scoringInputs.stats,o.scoringInputs.teEligible);if(!bound.bounded)return o;return {...o,pointsTenths:(config.shutoutScenario==='LOW'?bound.lowerTenths:bound.upperTenths)!,missingStats:[]};})}));
 for(const seed of seeds){
  const prereg=campaignSeed(seed),allocation='unusedBench' in config?{}:prereg.sharedBenchAllocation;
  const start=performance.now(),result=runSimulationCycle(inputs,{teams:12,seed,rankingModel:config.rankingModel,lockMode:config.lockMode,classification:'DIAGNOSTIC',sharedBenchAllocation:allocation,profile:true});
  const elapsedMs=performance.now()-start;
  const fixedBounds=result.runs.map(run=>{
   const input=inputs.find(i=>i.sport===run.sport)!,byKey=new Map(input.outcomes.map(o=>[JSON.stringify([o.playerId,o.gameId,o.role]),o]));
   const teams=run.metrics.teams.map(t=>({team:t.team,lowerTenths:0,upperTenths:0,unboundedAssignments:0,unknownAssignments:0}));
   for(const assignment of run.trace!.scores){const team=teams[assignment.team];if(assignment.pointsTenths!==null){team.lowerTenths+=assignment.pointsTenths;team.upperTenths+=assignment.pointsTenths;continue;}team.unknownAssignments++;const outcome=byKey.get(JSON.stringify([assignment.playerId,assignment.gameId,assignment.role]));if(!outcome?.scoringInputs){team.unboundedAssignments++;continue;}const bound=fixedAppearanceBounds(outcome.role,outcome.scoringInputs.stats,outcome.scoringInputs.teEligible);if(!bound.bounded||bound.lowerTenths===null||bound.upperTenths===null){team.unboundedAssignments++;continue;}team.lowerTenths+=bound.lowerTenths;team.upperTenths+=bound.upperTenths;}
   return {sport:run.sport,scope:'FIXED_ASSIGNMENT_ONLY_NOT_ADAPTIVE_STRATEGY_BOUND',teams:teams.map(t=>({...t,lowerTenths:t.unboundedAssignments?null:t.lowerTenths,upperTenths:t.unboundedAssignments?null:t.upperTenths}))};
  });
  const payload={version:'m61-real-history-diagnostic-1',classification:'SOURCE_CALENDAR_DIAGNOSTIC_NOT_PRIMARY',year,seed,variant,configuration:config,preregistered:prereg,actualChronologicalSportDraftOrder:[...inputs].sort((a,b)=>a.draftAt-b.draftAt||a.sport.localeCompare(b.sport)).map(i=>({sport:i.sport,draftAt:new Date(i.draftAt).toISOString()})),methodologyFingerprint:report.methodologyFingerprint,acceptedCohortManifestFingerprint:accepted.fingerprint,sourceHashes:{...selectionHashes},gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),elapsedMs,peakRssBytes:process.memoryUsage().rss,result,diagnostics:result.runs.map(seasonDiagnostics),fixedAssignmentBounds:fixedBounds,adaptiveStrategyGlobalBound:false,officialHistoricalSpreadPercent:null,productionWrites:0};
  await writeFile(`data/simulation/approved_model_v1/campaigns/${year}/${variant}-${seed}.json`,JSON.stringify(payload)+'\n');
  const summary={year,seed,variant,outputFingerprint:result.fingerprint,elapsedMs,peakRssBytes:payload.peakRssBytes,configuration:config,sourceHashes:payload.sourceHashes,sports:payload.diagnostics,franchises:result.runs.map(r=>({sport:r.sport,teams:r.metrics.teams,draftUnfilledStarterSeats:r.metrics.draftUnfilledStarterSeats,emptySlots:r.metrics.requestedSlots-r.metrics.filledSlots,faabSpent:r.metrics.teams.reduce((n,t)=>n+100-t.remainingFaab,0),waiverClaims:r.metrics.waiverClaims,waiversWon:r.metrics.waiversWon,quarterbackTenths:r.metrics.quarterbackTenths})),fixedAssignmentBounds:fixedBounds,officialHistoricalSpreadPercent:null};records.push(summary);console.log(JSON.stringify({year,seed,variant,elapsedMs,unscored:result.runs.map(r=>[r.sport,r.metrics.unscoredStarts]),fingerprint:result.fingerprint}));
 }
}
const output={version:'m61-real-history-campaign-summary-1',classification:'SOURCE_CALENDAR_DIAGNOSTIC_NOT_PRIMARY',methodologyFingerprint:report.methodologyFingerprint,acceptedCohortManifestFingerprint:accepted.fingerprint,records,officialHistoricalSpreadPercent:null,unapprovedCompletionDateAssumption:'Scheduled UTC date is used only in this nonprimary diagnostic, never accepted as verified completion date',officialBaselineExecuted:false,v10Active:false};
await mkdir(`data/simulation/approved_model_v1/campaigns/${year}/summaries`,{recursive:true});
await writeFile(`data/simulation/approved_model_v1/campaigns/${year}/summaries/${requested.join('-')}-${seeds[0]}-${seeds.at(-1)}.json`,JSON.stringify({...output,fingerprint:fingerprint(output)},null,2)+'\n');
