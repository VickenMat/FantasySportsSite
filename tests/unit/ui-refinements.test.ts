import {expect,it} from 'vitest';
import {draftTimeCandidates,draftTimeOptions} from '@/lib/draft-time';
import {scoringComparisons} from '@/scoring/comparisons';
import {startablePositions} from '@/server/player-browser';
it('offers all 96 quarter hours and validates Eastern daylight saving gaps and repeated hours',()=>{
 expect(draftTimeOptions).toHaveLength(96);expect(new Set(draftTimeOptions.map(t=>t.value)).size).toBe(96);expect(draftTimeOptions[0].label).toBe('12:00 AM');expect(draftTimeOptions[95].label).toBe('11:45 PM');
 expect(draftTimeCandidates('2027-03-14','02:30','America/New_York')).toEqual([]);
 expect(draftTimeCandidates('2027-11-07','01:30','America/New_York')).toEqual(['2027-11-07T05:30:00.000Z','2027-11-07T06:30:00.000Z']);
 expect(draftTimeCandidates('2027-07-01','12:00','America/New_York')).toEqual(['2027-07-01T16:00:00.000Z']);
 expect(draftTimeCandidates('2027-01-01','12:00','America/New_York')).toEqual(['2027-01-01T17:00:00.000Z']);
 expect(draftTimeCandidates('2027-02-30','12:00','America/New_York')).toEqual([]);
});
it('resolves only configured starter positions including underlying flex and utility positions',()=>{
 expect(startablePositions('NFL',['QB','FLEX','BENCH','IR'])).toEqual(['QB','RB','WR','TE']);
 expect(startablePositions('NBA',['G','UTIL'])).toEqual(['PG','SG','SF','PF','C']);
 expect(startablePositions('MLB',['MI','SP'])).toEqual(['2B','SS','SP']);
});
it('uses active weights and guards unavailable/zero denominators without claiming balance',()=>{
 const rules=[{sport:'NFL' as const,statKey:'receptions',coefficient:3.2},{sport:'NBA' as const,statKey:'AST',coefficient:.7}];
 expect(scoringComparisons(rules,['NFL','NBA'])[0].label).toContain('4.57');
 expect(scoringComparisons(rules.map(r=>({...r,coefficient:0})),['NFL','NBA'])).toEqual([]);
 expect(scoringComparisons(rules,['NFL'])).toEqual([]);
});
