import {expect,it} from 'vitest';
import {scoringCompleteness,type HistoricalAppearance} from '@/scoring/completeness';
import type {ScoringRuleInput} from '@/scoring/engine';
const rules:ScoringRuleInput[]=[{sport:'NFL',statKey:'tight_end_reception_bonus',applicability:'tightEnd',coefficientTenths:5}];
const base:HistoricalAppearance={playerId:'source-athlete',gameId:'canonical-game',role:'FOOTBALL',normalized:{receptions:2},observedPositions:[]};
it('keeps source-only TE context unknown until exact scoring evidence is supplied',()=>{expect(scoringCompleteness([base],rules).issues).toEqual([{reason:'FOOTBALL:tight_end_reception_bonus',appearances:1,players:1}]);});
it('uses explicit true and false persisted score context without granting positions',()=>{for(const teEligible of[true,false]){const row={...base,teEligible};expect(scoringCompleteness([row],rules).affectedPlayers).toBe(0);expect(row.observedPositions).toEqual([]);}});
it('retains historical observed-position context when no persisted override is supplied',()=>{expect(scoringCompleteness([{...base,observedPositions:['TE']}],rules).affectedAppearances).toBe(0);});
