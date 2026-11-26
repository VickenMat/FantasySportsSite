import { expect, it } from 'vitest';
import { provenMlbRole } from '@/ingestion/open-data/mlb-role';

it('uses confirmed starting-pitcher priority without hindsight, combining scores or treating incomplete absence as zero', () => {
  const both = { bats: true, pitches: true, plateAppearances: 3, pitchingGames: 1, pitchingStarts: 1, complete: false };
  expect(provenMlbRole(both)).toBe('PITCHER');
  expect(provenMlbRole({ ...both, pitchingStarts: 0 })).toBe('HITTER');
  expect(provenMlbRole({ ...both, pitchingStarts: null })).toBeNull();
  const relief = { ...both, bats: false, plateAppearances: 0, pitchingStarts: 0 };
  expect(provenMlbRole(relief)).toBeNull();
  expect(provenMlbRole({ ...relief, complete: true })).toBe('PITCHER');
  expect(provenMlbRole({ ...relief, complete: true, plateAppearances: null })).toBeNull();
  expect(provenMlbRole({ ...both, pitchingStarts: 2 })).toBeNull();
  expect(provenMlbRole({ ...both, pitches: false, pitchingGames: 0, pitchingStarts: null })).toBe('HITTER');
});
