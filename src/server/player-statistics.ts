import { getDatabase } from "@/lib/db";

export type PlayerStatistics = { gamesPlayed: number; totalTenths: bigint; averageTenths: number; projectionTenths: null };

export async function playerStatistics(input: { playerIds: string[]; presetId: string; seasonId: string; asOf?: Date }) {
  const ids = [...new Set(input.playerIds)];
  if (!ids.length) return new Map<string, PlayerStatistics>();
  const asOf = input.asOf;
  const ledgers = await getDatabase().scoreLedger.findMany({
    where: {
      playerId: { in: ids }, presetId: input.presetId,
      game: { seasonId: input.seasonId, ...(asOf ? { OR: [{ startsAt: { lte: asOf } }, { startsAt: null, gameDate: { lte: asOf } }] } : {}) },
    },
    select: {
      playerId: true,
      entries: {
        ...(asOf ? { where: { stat: { OR: [{ sourceKnownAt: { lte: asOf } }, { sourceKnownAt: null, recordedAt: { lte: asOf } }] } } } : {}),
        orderBy: { sequence: "desc" }, take: 1, select: { totalTenths: true },
      },
    },
  });
  const totals = new Map<string, { gamesPlayed: number; totalTenths: bigint }>();
  for (const ledger of ledgers) {
    const entry = ledger.entries[0];
    if (!entry) continue;
    const current = totals.get(ledger.playerId) ?? { gamesPlayed: 0, totalTenths: 0n };
    current.gamesPlayed++;
    current.totalTenths += entry.totalTenths;
    totals.set(ledger.playerId, current);
  }
  return new Map([...totals].map(([playerId, value]) => [playerId, {
    ...value,
    averageTenths: value.gamesPlayed ? Number(value.totalTenths) / value.gamesPlayed : 0,
    projectionTenths: null,
  }]));
}

export function displayTenths(value: bigint | number | null | undefined) {
  return value == null ? "N/A" : (Number(value) / 10).toFixed(1);
}
