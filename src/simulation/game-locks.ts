import type {Fixture,RosterSnapshot,SimulationInput} from './types';
/** Index immutable simulation inputs; avoid rescanning the season per claim. */
const indexes=new WeakMap<SimulationInput,{byPlayer:Map<string,RosterSnapshot[]>;byTeam:Map<string,Fixture[]>;fixtures:SimulationInput["fixtures"];roster:SimulationInput["roster"]}>();
function index(input:SimulationInput){
  let value=indexes.get(input);if(value&&value.fixtures===input.fixtures&&value.roster===input.roster)return value;
  value={byPlayer:new Map(),byTeam:new Map(),fixtures:input.fixtures,roster:input.roster};
  for(const fact of input.roster){const facts=value.byPlayer.get(fact.playerId)??[];facts.push(fact);value.byPlayer.set(fact.playerId,facts);}
  for(const facts of value.byPlayer.values())facts.sort((a,b)=>b.effectiveAt-a.effectiveAt||b.knownAt-a.knownAt);
  for(const fixture of input.fixtures)for(const team of fixture.teams){const games=value.byTeam.get(team)??[];games.push(fixture);value.byTeam.set(team,games);}
  indexes.set(input,value);return value;
}
/** Final knowledge is explicit; no score, receipt or guessed duration releases it. */
export function simulationPlayerLocked(input:SimulationInput,playerId:string,at:number){
  const {byPlayer,byTeam}=index(input),facts=byPlayer.get(playerId)??[];
  const possibleTeams=new Set(facts.filter(f=>f.knownAt<at&&f.effectiveAt<at).map(f=>f.team));
  for(const team of possibleTeams){
    if(!team)continue;
    for(const game of byTeam.get(team)??[]){
      if(game.startsAt>at||game.knownAt>=game.startsAt||game.finalKnownAt!==undefined&&game.finalKnownAt<at)continue;
      const fact=facts.find(r=>r.knownAt<game.startsAt&&r.effectiveAt<game.startsAt);
      if(fact?.active&&fact.team&&game.teams.includes(fact.team))return true;
    }
  }
  return false;
}
