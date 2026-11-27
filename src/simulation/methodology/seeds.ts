import {seededRandom} from '../config';
export const seedGroups = {
  development: Array.from({length:20}, (_, i) => i+11),
  validation: Array.from({length:20}, (_, i) => i+31),
  holdout: Array.from({length:20}, (_, i) => i+51),
} as const;
export function campaignSeed(seed:number) {
  const group = Object.entries(seedGroups).find(([, seeds]) => seeds.includes(seed));
  if (!group) throw Error('Seed was not preregistered.');
  const sports = ['NFL','MLB','NBA','NHL'] as const;
  const extra = (seed-group[1][0]) % 4;
  const random = seededRandom(seed), draftOrder = Array.from({length:12},(_, i)=>i);
  for(let i=11;i>0;i--){const j=Math.floor(random()*(i+1));[draftOrder[i],draftOrder[j]]=[draftOrder[j],draftOrder[i]];}
  return {seed,group:group[0],draftOrder,sportDraftOrder:[...sports],sharedBenchAllocation:Object.fromEntries(sports.map((s,i)=>[s,1+Number(i===extra)]))};
}
export function protectHoldout(year:number,seed:number) {
  if(year===2025 || campaignSeed(seed).group==='holdout') throw Error('Held-out season/seeds are sealed for later evaluation.');
}
