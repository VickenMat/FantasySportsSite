import {calculateScore,type StatValues} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import type {ScoringRole} from '../config';
/** Scenario-only values never replace source statistics. Corners are valid
 * because this scorer is additive with monotone rounding for these ranges. */
export function fixedAppearanceBounds(role:ScoringRole,source:StatValues,teEligible?:boolean|null){
  const exact=calculateScore(ubpV9Rules,{role,stats:source,teEligible});
  if(!exact.missingStats.length)return {lowerTenths:exact.totalTenths,upperTenths:exact.totalTenths,missing:[],bounded:true};
  const lower={...source},upper={...source};
  for(const field of exact.missingStats){
    if(field==='shutout'||field==='goalie_win'){lower[field]=0;upper[field]=1;}
    else if(field==='shorthanded_points_bonus'&&typeof source.goals==='number'&&typeof source.assists==='number'&&source.goals>=0&&source.assists>=0){lower[field]=0;upper[field]=source.goals+source.assists;}
    else return {lowerTenths:null,upperTenths:null,missing:exact.missingStats,bounded:false};
  }
  const a=calculateScore(ubpV9Rules,{role,stats:lower,teEligible}),b=calculateScore(ubpV9Rules,{role,stats:upper,teEligible});
  return {lowerTenths:Math.min(a.totalTenths,b.totalTenths),upperTenths:Math.max(a.totalTenths,b.totalTenths),missing:exact.missingStats,bounded:!a.missingStats.length&&!b.missingStats.length};
}
