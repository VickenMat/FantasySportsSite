import type { Prisma } from '@/generated/prisma/client';
import { nbaPositionSnapshotSchema, normalizeNbaPosition, projectNbaPositions, type NbaPositionSnapshot } from '@/positions/nba-policy';
import { resolveProfessionalPlayer } from './identity-resolutions';
export type NbaPositionObservationInput = { provider: string; sport: string; entityKey: string; revisionOrdinal: number | null; observedAt: string; effectiveAt: string | null; publishedAt: string | null; normalized: NbaPositionSnapshot };
/** A snapshot retains exact effective/publication as unknown; it creates no dated LISTED claim. */
export async function promoteNbaPositionSnapshot(tx: Prisma.TransactionClient, input: NbaPositionObservationInput, observationId: string) {
  const n = nbaPositionSnapshotSchema.parse(input.normalized);
  if (input.sport !== 'NBA' || input.effectiveAt !== null || input.publishedAt !== null) return { outcome: 'QUARANTINED' as const, reason: 'NBA observed snapshots must keep exact effective/publication instants unknown.', targets: {} };
  const mapping = await resolveProfessionalPlayer(tx, 'NBA', n.player, new Date(input.observedAt));
  const season = await tx.season.findUnique({ where: { sport_startYear: { sport: 'NBA', startYear: n.seasonStartYear } } });
  if (!mapping || !season) return { outcome: 'PENDING_DATA' as const, reason: 'An NBA snapshot requires canonical identity and season.', targets: {} };
  const targets = { playerId: mapping.playerId, seasonId: season.id, policyVersion: n.policyVersion };
  if (input.revisionOrdinal === null || new Date(n.knownAt) > new Date(input.observedAt) || new Date(n.validFrom) < new Date(input.observedAt) || input.entityKey !== `nba-position:${n.player.provider}:${n.player.externalId}:${n.seasonStartYear}`) return { outcome: 'QUARANTINED' as const, reason: 'NBA snapshots require an ordered stable stream and a prospective observation boundary.', targets };
  const existing = await tx.professionalDataObservation.findMany({ where: { sport: 'NBA', category: 'NBA_POSITION_SNAPSHOT', observedAt: { lte: new Date(input.observedAt) }, decisions: { some: { targets: { path: ['playerId'], equals: mapping.playerId } } } }, include: { decisions: { orderBy: { version: 'desc' }, take: 1 } } });
  const candidate = { id: observationId, provider: input.provider, entityKey: input.entityKey, revisionOrdinal: BigInt(input.revisionOrdinal), observedAt: new Date(input.observedAt), normalized: n,
    decisions: [{ outcome: 'ACCEPTED', decidedAt: new Date(input.observedAt), targets }] };
  const result = projectNbaPositions({ playerId: mapping.playerId, seasonYear: n.seasonStartYear, asOf: new Date(n.validFrom), observations: [...existing, candidate] });
  if (result.conflicts.length) return { outcome: 'QUARANTINED' as const, reason: 'Conflicting applicable NBA position evidence requires audited resolution; no broad union.', targets: { ...targets, nbaPositionConflict: true } };
  return { outcome: 'ACCEPTED' as const, reason: 'Approved prospective NBA granular/family snapshot; exact effective/publication unknown, history retained.', targets: { ...targets, normalizedPosition: normalizeNbaPosition(n.sourcePosition).normalized } };
}
