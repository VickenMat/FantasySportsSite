import type {Sport} from '@/generated/prisma/enums';
import {applicableRules} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {configSchema,defaultSlots,day,slotRule} from './config';
import {scoreSimulationAppearance} from './scoring';
import type {SimulationInput} from './types';
/** Explicit synthetic workload, never professional evidence or a V9 baseline. */
export function simulationWorkloadFixture(sport:Sport,days=30,playersPerSlot=32):SimulationInput {
 const start=Date.parse('2021-01-01T00:00:00Z'),pool=defaultSlots[sport].flatMap((slot,i)=>Array.from({length:playersPerSlot},(_,n)=>({id:`synthetic-${sport}-${i}-${n}`,position:slotRule(sport,slot).positions[0],role:slotRule(sport,slot).role,n})));
 const fixtures=Array.from({length:days},(_,i)=>({id:`synthetic-${sport}-game-${i}`,slate:`synthetic-${sport}-day-${i}`,startsAt:start+(i+1)*day,knownAt:start-day,finalKnownAt:start+(i+1)*day+2*3600000,teams:['synthetic-A','synthetic-B']}));
 const outcomes=pool.flatMap(player=>[...Array.from({length:5},(_,i)=>({id:`synthetic-prior-${sport}-${i}`,startsAt:start-(i+2)*day,seasonYear:2020})),...fixtures.map(g=>({...g,seasonYear:2021}))].map(game=>{
  const stats=Object.fromEntries(applicableRules(ubpV9Rules,player.role).map(r=>[r.statKey==='pitching_innings'?'pitching_outs':r.applicability==='tightEnd'?'receptions':r.statKey,0]));
  if(player.role==='FOOTBALL'){stats.receiving_yards=40+player.n;stats.receptions=3;stats.passing_yards=150;}
  if(player.role==='HITTER'){stats.atBats=4;stats.hits=1;}
  if(player.role==='PITCHER'){stats.pitching_outs=15;stats.strikeOuts=4;}
  if(player.role==='BASKETBALL'){stats.PTS=15+player.n;stats.AST=4;}
  if(player.role==='SKATER'){stats.sog=2;stats.assists=player.n%2;}
  if(player.role==='GOALIE'){stats.saves=25+player.n;stats.goalsAgainst=2;}
  const score=scoreSimulationAppearance({role:player.role,stats,teEligible:player.position==='TE'});if(score.pointsTenths===null)throw Error('Synthetic workload unexpectedly incomplete.');
  return{playerId:player.id,gameId:game.id,seasonYear:game.seasonYear,role:player.role,playedAt:game.startsAt+3600000,knownAt:game.startsAt+2*3600000,pointsTenths:score.pointsTenths,missingStats:[],participation:'PLAYED' as const,scoringInputs:{stats,teEligible:player.position==='TE'},observedPositions:[player.position]};
 }));
 return{sport,year:2021,label:'SYNTHETIC workload only',coverage:'UNVERIFIED',coverageReason:'Synthetic fixture, not an observed professional season',mode:'as-of',draftAt:start,fixtures,outcomes,roster:pool.map(p=>({playerId:p.id,team:'synthetic-A',positions:[p.position],active:true,knownAt:start-day,effectiveAt:start-day})),availability:fixtures.flatMap(game=>pool.map(p=>({playerId:p.id,gameId:game.id,role:p.role,probability:1,usage:'starter' as const,knownAt:game.startsAt-3600000}))),positions:[],source:{hashes:{fixture:'synthetic-workload-v1'},acceptedRows:outcomes.length,rejectedRows:0,unscheduledRows:0,assumptions:['All professional facts in this workload are synthetic.','No inferred real health, ownership, schedule or publication.']}};
}
export function standardSimulationSlots(){return Object.fromEntries((['NFL','MLB','NBA','NHL'] as const).map(s=>[s,configSchema.parse({sport:s}).slots]));}
