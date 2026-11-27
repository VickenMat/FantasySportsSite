import type {SimulationInput} from './types';
/** Professional final knowledge is a simulation input, never inferred from a
 * score, zero activity, a worker receipt or a guessed game duration. */
export function simulationPlayerLocked(input:SimulationInput,playerId:string,at:number){
 for(const game of input.fixtures){
  if(game.startsAt>at||game.knownAt>=game.startsAt||game.finalKnownAt!==undefined&&game.finalKnownAt<at)continue;
  const facts=input.roster.filter(r=>r.playerId===playerId&&r.knownAt<game.startsAt&&r.effectiveAt<game.startsAt).sort((a,b)=>b.effectiveAt-a.effectiveAt||b.knownAt-a.knownAt);
  if(facts[0]?.team&&game.teams.includes(facts[0].team))return true;
 }
 return false;
}
