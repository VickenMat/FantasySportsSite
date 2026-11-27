import {sportByRole} from '@/scoring/engine';
import {fingerprint} from '@/ingestion/contracts';
import type {Sport} from '@/generated/prisma/enums';
import {configSchema,defaultSlots,seededRandom} from './config';
import {seasonSimulationEvents} from './engine';
import {simulationPlayerLocked} from './game-locks';
import {SharedSimulationRoster} from './shared-roster';
import type {SimulationInput} from './types';
export const cycleVersion='m6-simulation-cycle-1';
export function balanceMetrics(values:Readonly<Record<Sport,number>>) {
 const entries=Object.entries(values) as [Sport,number][];
 if(entries.length!==4||['NFL','MLB','NBA','NHL'].some(s=>!Object.hasOwn(values,s))||entries.some(([,v])=>!Number.isFinite(v)))throw Error('Four finite comparable sport values required.');
 const mean=entries.reduce((sum,[,value])=>sum+value,0)/4;
 return {
  metric:'(max sport median - min sport median) / mean sport median * 100',
  validForPositiveBalanceTarget:mean>0&&entries.every(([,v])=>v>=0),
  spreadPercent:mean>0?(Math.max(...entries.map(([,v])=>v))-Math.min(...entries.map(([,v])=>v)))/mean*100:null,
  sportContributionPercent:Object.fromEntries(entries.map(([sport,v])=>[sport,mean?v/(4*mean)*100:null])),
  pairwisePercentOfMean:entries.flatMap(([sport,v],i)=>entries.slice(i+1).map(([other,w])=>({sport,other,differencePercent:mean?(v-w)/mean*100:null}))),
 };
}
export function runSimulationCycle(inputs:readonly SimulationInput[],options:{teams:number;seed:number;rankingModel?:'TRAILING20_SHRINK4'|'V5_TRAILING10_PRIOR_FALLBACK'|'PRIOR_SEASON_ONLY';lockMode?:'INDIVIDUAL_GAME'|'DAILY_FIRST_START';classification:'FIXTURE'|'DIAGNOSTIC';sharedBenchAllocation?:Partial<Record<Sport,number>>;slots?:Partial<Record<Sport,readonly string[]>>;includeTrace?:boolean;profile?:boolean;irMoves?:readonly {at:number;team:number;sport:Sport;playerId:string;knownAt:number;eligible:boolean;ir:boolean}[]}){
 const sports=['NFL','MLB','NBA','NHL'] as const;if(inputs.length!==4||new Set(inputs.map(x=>x.sport)).size!==4)throw Error('Exactly one input per sport is required.');
 if(!['FIXTURE','DIAGNOSTIC'].includes(options.classification))throw Error('Official baseline requires a separately accepted methodology and dataset.');
 for(const input of inputs){
  const keys=new Set<string>();for(const outcome of input.outcomes){if(options.classification==="DIAGNOSTIC"&&outcome.participation===undefined)throw Error("Historical diagnostic outcomes require explicit participation; absence is not DNP.");if(outcome.seasonYear>input.year||sportByRole[outcome.role]!==input.sport)throw Error("Invalid sport/season scoring role.");if(!Number.isFinite(outcome.playedAt)||!Number.isFinite(outcome.knownAt)||outcome.knownAt<outcome.playedAt)throw Error('Invalid historical result chronology.');const key=JSON.stringify([outcome.playerId,outcome.gameId,outcome.role]);if(keys.has(key))throw Error('Duplicate statistical outcome.');keys.add(key);}
  if(input.sport==='MLB'){const selected=new Set<string>();for(const outcome of input.outcomes.filter(row=>row.seasonYear===input.year)){const key=JSON.stringify([outcome.playerId,outcome.gameId]);if(selected.has(key))throw Error('MLB requires one source-selected role per player/game before simulation.');selected.add(key);}}
 }
 const allocation=options.sharedBenchAllocation??{};if(Object.values(allocation).some(v=>!Number.isInteger(v)||v<0)||Object.values(allocation).reduce((a,b)=>a+b,0)>5)throw Error('At most five universal bench seats may be allocated.');
 const starters=Object.fromEntries(sports.map(s=>[s,(options.slots?.[s]??defaultSlots[s]).length])) as Record<Sport,number>;
 const ledger=new SharedSimulationRoster(options.teams,starters);const random=seededRandom(options.seed),order=Array.from({length:options.teams},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 const tasks=sports.map(sport=>inputs.find(input=>input.sport===sport)!).map(input=>{const config=configSchema.parse({sport:input.sport,teams:options.teams,seed:options.seed,rankingModel:options.rankingModel,draftOrder:order,slots:options.slots?.[input.sport],bench:5+(allocation[input.sport]??0),lockMode:options.lockMode??'INDIVIDUAL_GAME',strictGameMutationLocks:true,lineupObjective:'EXPECTED_POINTS',includeTrace:options.includeTrace??true});const iterator=seasonSimulationEvents(input,config,{draft:picks=>{for(const p of picks)ledger.acquire(p.team,input.sport,p.playerId);},waiver:w=>ledger.replace(w.team,input.sport,w.add,w.drop),lineupEligible:(_team,id)=>!ledger.isIr(input.sport,id),irHeld:(_team,id)=>ledger.isIr(input.sport,id)});return{sport:input.sport,iterator,step:iterator.next()};});
 const phaseTimingsMs={DRAFT:0,WAIVER:0,LINEUP:0};
 const irMoves=[...options.irMoves??[]].sort((a,b)=>a.at-b.at||a.sport.localeCompare(b.sport)||a.playerId.localeCompare(b.playerId));let irIndex=0;
 while(tasks.some(t=>!t.step.done)){const pending=tasks.filter(t=>!t.step.done).sort((a,b)=>{if(a.step.done||b.step.done)return 0;return a.step.value.at-b.step.value.at||a.sport.localeCompare(b.sport);});const task=pending[0];if(task.step.done)throw Error('Unexpected completed task.');while(irIndex<irMoves.length&&irMoves[irIndex].at<task.step.value.at){const move=irMoves[irIndex++];if(move.knownAt>=move.at)throw Error('IR eligibility was not known before the decision.');if(simulationPlayerLocked(inputs.find(input=>input.sport===move.sport)!,move.playerId,move.at))throw Error('Player is locked by an unfinished professional game.');ledger.moveIr(move.team,move.sport,move.playerId,move.ir,move.eligible);}const phase=task.step.value.kind,start=performance.now();task.step=task.iterator.next();phaseTimingsMs[phase]+=performance.now()-start;}
 const runs=tasks.map(t=>{if(!t.step.done)throw Error('Unfinished simulation.');return t.step.value;});
 const balance=balanceMetrics(Object.fromEntries(runs.map(r=>[r.sport,r.metrics.medianTenths])) as Record<Sport,number>);
 if(runs.some(r=>r.metrics.unscoredStarts>0)){balance.spreadPercent=null;balance.validForPositiveBalanceTarget=false;}
 const result={cycleVersion,classification:options.classification,officialBaseline:false,configuration:options,draftOrder:order,rosterPolicy:{sportBench:5,universalBench:5,universalIr:5,sharedBenchAllocation:allocation,unallocatedSharedSeats:5-Object.values(allocation).reduce((a,b)=>a+b,0),automaticIrStrategy:'NOT_SELECTED'},runs,ownership:ledger.snapshot(),balance,balanceStarterInputsComplete:runs.every(r=>r.metrics.unscoredStarts===0),productionWrites:0,v10Active:false};return{...result,fingerprint:fingerprint(result),...(options.profile?{phaseTimingsMs}: {})};
}
