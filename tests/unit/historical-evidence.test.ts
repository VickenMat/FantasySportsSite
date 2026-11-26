import { expect, it } from 'vitest';
import { historicalStatsForScoring } from '@/scoring/historical-evidence';

it('withholds inferred legacy shutout credit without altering source records or explicit credit', () => {
  const normalized = { shutout: 1, goalsAgainst: 0, saves: 30 };
  const input = { provider: 'v9-historical', role: 'GOALIE' as const, normalized, raw: { original: { original: { toi: '65:00', starter: 'True', goalsAgainst: '0' } } } };
  expect(historicalStatsForScoring(input)).toMatchObject({ shutout: null, saves: 30 });
  expect(normalized.shutout).toBe(1);
  expect(historicalStatsForScoring({ ...input, raw: { shutout: '1.0' } })).toBe(normalized);
  expect(historicalStatsForScoring({ ...input, raw: { shutout: '' } }).shutout).toBeNull();
  expect(historicalStatsForScoring({ ...input, role: 'SKATER' })).toBe(normalized);
});
