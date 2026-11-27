import type { Prisma } from '@/generated/prisma/client';
import { snapshotStreamHeads } from '@/positions/player-snapshot-policy';
/** One bounded read across a caller's athletes, never one database query per athlete. */
export async function conflictedSnapshotPlayers(tx: Prisma.TransactionClient, playerIds: readonly string[], facet: 'AVAILABILITY' | 'ROOKIE', asOf: Date, seasonId?: string) {
  if (!playerIds.length) return new Set<string>();
  const rows = await tx.professionalDataObservation.findMany({ where: { category: 'PLAYER_SNAPSHOT', observedAt: { lte: asOf }, normalized: { path: ['facet','type'], equals: facet },
    decisions: { some: { OR: [...new Set(playerIds)].map(playerId => ({ targets: { path: ['playerId'], equals: playerId } })), ...(seasonId ? { AND: [{ targets: { path: ['seasonId'], equals: seasonId } }] } : {}) } },
  }, include: { decisions: { where: { decidedAt: { lte: asOf } }, orderBy: { version: 'desc' } } } });
  const requested = new Set(playerIds);
  return new Set([...snapshotStreamHeads(rows,asOf).values()].filter(row => row.conflict && requested.has(row.targets.playerId) && (!row.value.validUntil || new Date(row.value.validUntil) > asOf)).map(row => row.targets.playerId));
}
