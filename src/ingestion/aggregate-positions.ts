import type { Prisma } from '@/generated/prisma/client';
import type { Observation } from './contracts';
import { resolveProfessionalPlayer } from './identity-resolutions';

/** Acceptance retains an audited aggregate observation; it creates no LISTED or game evidence. */
export async function promoteAggregatePosition(tx: Prisma.TransactionClient, input: Observation & { normalized: Extract<Observation['normalized'], { kind: 'POSITION_AGGREGATE' }> }) {
  const n = input.normalized;
  const player = await resolveProfessionalPlayer(tx, input.sport, n.player, new Date(input.observedAt));
  const season = await tx.season.findUnique({ where: { sport_startYear: { sport: input.sport, startYear: n.seasonStartYear } } });
  if (input.sport !== 'MLB') return { outcome: 'QUARANTINED' as const, reason: 'Season aggregate fielding eligibility is MLB-only.', targets: {} };
  if (!player || !season) return { outcome: 'PENDING_DATA' as const, reason: 'Aggregate evidence requires a canonical player and season.', targets: {} };
  const targets = { playerId: player.playerId, seasonId: season.id, code: n.code, scope: n.scope };
  if (!input.effectiveAt || !input.publishedAt || input.revisionOrdinal == null) return { outcome: 'PENDING_DATA' as const, reason: 'Aggregate evidence requires explicit effective, known/publication times and ordered revisions; no observed-time substitution.', targets };
  if (new Date(input.effectiveAt) < new Date(n.periodEndsAt)) return { outcome: 'QUARANTINED' as const, reason: 'A cumulative total cannot be effective before its evidence period ends.', targets };
  if (input.entityKey !== `position-aggregate:${n.player.provider}:${n.player.externalId}:${n.seasonStartYear}:${n.code}`) return { outcome: 'QUARANTINED' as const, reason: 'Use the stable player-season-position aggregate stream for replacements/retractions.', targets };
  return { outcome: 'ACCEPTED' as const, reason: n.scope === 'PLAYER_SEASON_TOTAL' ? 'Reviewed complete non-overlapping source season total retained separately from LISTED and FIELDING evidence.' : 'Reviewed independent source threshold retained as a lower bound; no all-team completeness or summed counts claimed.', targets };
}
