import { expect, it } from 'vitest';
import { legacyPositionFallback } from '@/server/positions';
import { fitsSlot } from '@/simulation/config';
import { openAcquisitionSlot } from '@/rosters/acquisition-slot';
it('never turns original or repaired historical observations into current starter eligibility', () => {
  expect(legacyPositionFallback({ provider: 'v9-historical', observedPositions: ['QB'], raw: {} })).toEqual([]);
  expect(legacyPositionFallback({ provider: 'v9-historical', observedPositions: ['C'], raw: { original: { position: 'C' } } })).toEqual([]);
  expect(legacyPositionFallback({ provider: 'fixture', observedPositions: ['QB'], raw: { reviewedNflStatistics: {} } })).toEqual([]);
  expect(legacyPositionFallback({ observedPositions: ['C'], raw: { historicalPositionRepair: {} } })).toEqual([]);
  expect(fitsSlot('NHL','F',new Set(legacyPositionFallback({ provider: 'v9-historical', observedPositions: ['C'], raw: {} })))).toBe(false);
  expect(fitsSlot('NFL','QB',new Set(legacyPositionFallback({ provider: 'v9-historical', observedPositions: ['QB'], raw: {} })))).toBe(false);
});
it('preserves demo/synthetic fallback and unknown-position bench acquisition without granting a starting slot', () => {
  expect(legacyPositionFallback({ provider: 'demo', observedPositions: ['QB'], raw: { synthetic: true } })).toEqual(['QB']);
  expect(legacyPositionFallback({ observedPositions: ['C'], raw: { synthetic: true } })).toEqual(['C']);
  expect(openAcquisitionSlot({ sport: 'NFL', rosterId: 'fixture', starters: ['QB'], bench: 1, universalBench: 0, positions: new Set(), entries: [] })).toEqual({ slot: 'BENCH', slotIndex: 1 });
});
