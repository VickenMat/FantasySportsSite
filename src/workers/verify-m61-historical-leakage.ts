import {readFile,writeFile} from 'node:fs/promises';
import {fingerprint} from '@/ingestion/contracts';
import {parseSnapshot} from '@/simulation/snapshot';
import {configSchema} from '@/simulation/config';
import {simulateSeason} from '@/simulation/engine';
const report=JSON.parse(await readFile('reports/m61-diagnostic-selections.json','utf8'));
const results=[];
for(const source of report.snapshots.filter((r:{year:number;informationModel:string;positionModel:string})=>r.year===2023&&r.informationModel==='TWO_DAY'&&r.positionModel==='DATED_CARRY')){
 const data=parseSnapshot(await readFile(source.path,'utf8'));
 const first=data.fixtures.reduce((a,b)=>Math.min(a,b.startsAt),Infinity),end=first+7*86400000;
 const input={...data,fixtures:data.fixtures.filter(f=>f.startsAt<=end)};
 const config=configSchema.parse({sport:input.sport,teams:12,seed:31,bench:6,includeTrace:true,lockMode:'INDIVIDUAL_GAME',strictGameMutationLocks:true,lineupObjective:'EXPECTED_POINTS'});
 const baseline=simulateSeason(input,config);
 const changed={...input,outcomes:input.outcomes.map(o=>o.playedAt>first?{...o,pointsTenths:999999}:o),roster:[...input.roster,{playerId:'future-only-native-identity',team:input.fixtures[0].teams[0],positions:['QB','PG','SP','G'],active:true,effectiveAt:end+1,knownAt:end+1}],positions:input.positions.map(p=>p.knownAt.getTime()>first?{...p,code:'UNSUPPORTED'}:p),availability:[...input.availability,{playerId:'future-only-native-identity',gameId:input.fixtures[0].id,role:input.outcomes[0].role,probability:0,knownAt:end+1}]};
 const counter=simulateSeason(changed,config);
 const early=(r:typeof baseline)=>r.trace!.lineups.filter(p=>p.lockAt<=first);
 if(fingerprint(baseline.trace!.draft)!==fingerprint(counter.trace!.draft)||fingerprint(early(baseline))!==fingerprint(early(counter)))throw Error('Future evidence changed an earlier real-data decision.');
 const earlyWaivers=(r:typeof baseline)=>r.trace!.waivers.filter(w=>w.at<=first);
 if(fingerprint(earlyWaivers(baseline))!==fingerprint(earlyWaivers(counter)))throw Error('Future performance changed an earlier historical waiver claim.');
 // Reverse input order to prove deterministic temporal/ID ordering.
 const reversed=simulateSeason({...input,roster:[...input.roster].reverse(),outcomes:[...input.outcomes].reverse(),fixtures:[...input.fixtures].reverse(),positions:[...input.positions].reverse()},config);
 if(fingerprint(baseline)!==fingerprint(reversed))throw Error('Historical input ordering changed decisions.');
 results.push({sport:input.sport,year:input.year,classification:'REAL_SOURCE_CALENDAR_DIAGNOSTIC',firstGame:new Date(first).toISOString(),testedFixtures:input.fixtures.length,sourceSha256:source.sha256,futureScoreCannotChangeEarlierDraft:true,futureScoreCannotChangeEarlierLineup:true,futurePositionCannotGrantEarlierEligibility:true,futureRosterCannotDiscoverEarly:true,futureAvailabilityCannotChangeEarlierDecisions:true,futurePerformanceCannotChangeEarlierWaivers:true,reorderingStable:true,sourceRoleUnchanged:true,irEvidenceAbsentNoInventedMoves:true,priorSourceRosterFacts:input.roster.filter(r=>r.knownAt<input.draftAt).length});
}
await writeFile('reports/m61-historical-leakage.json',JSON.stringify({version:'m61-historical-leakage-1',results,officialBaselineAcceptance:false,productionWrites:0},null,2)+'\n');
