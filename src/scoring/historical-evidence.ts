import type { GameStatRole } from '@/generated/prisma/enums';
import type { StatValues } from './engine';

/** Preserve legacy records, but do not score an inferred positive goalie shutout. */
export function historicalStatsForScoring(input: { provider: string; role: GameStatRole; normalized: StatValues; raw: unknown }): StatValues {
  if (input.provider !== 'v9-historical' || input.role !== 'GOALIE' || input.normalized.shutout !== 1) return input.normalized;
  let original = input.raw;
  for (let depth = 0; depth < 10 && original && typeof original === 'object' && 'original' in original; depth++) original = original.original;
  const credit = original && typeof original === 'object' && 'shutout' in original ? original.shutout : null;
  if (credit !== null && credit !== undefined && String(credit).trim() !== '' && Number(credit) === 1) return input.normalized;
  return { ...input.normalized, shutout: null };
}
