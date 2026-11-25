import { getDatabase } from "@/lib/db";
import { calculateScore, type StatValues } from "@/scoring/engine";

export type PlayerStatistics = { gamesPlayed: number; scoredGames: number; totalTenths: bigint | null; averageTenths: number | null; projectionTenths: null };

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
      playerId: true, gameId: true,
      entries: {
        ...(asOf ? { where: { stat: { OR: [{ sourceKnownAt: { lte: asOf } }, { sourceKnownAt: null, recordedAt: { lte: asOf } }] } } } : {}),
        orderBy: { sequence: "desc" }, take: 1, select: { totalTenths: true },
      },
    },
  });
  const perGame = new Map<string, { playerId: string; score: bigint | null }>();
  for (const ledger of ledgers) {
    const entry = ledger.entries[0];
    if (!entry) continue;
    perGame.set(`${ledger.playerId}:${ledger.gameId}`, { playerId: ledger.playerId, score: entry.totalTenths });
  }
  // Historical analytics can be computed without creating competitive ledger events.
  // Unknown fields or ambiguous two-way roles produce an unknown total, never zero.
  const [rows, rules] = await Promise.all([
    getDatabase().playerGameStat.findMany({ where: { playerId: { in: ids }, game: { seasonId: input.seasonId,
      ...(asOf ? { OR: [{ startsAt: { lte: asOf } }, { startsAt: null, gameDate: { lte: asOf } }] } : {}) },
      ...(asOf ? { OR: [{ sourceKnownAt: { lte: asOf } }, { sourceKnownAt: null, recordedAt: { lte: asOf } }] } : {}) },
      orderBy: [{ revision: "desc" }, { recordedAt: "desc" }],
      distinct: ["playerId", "gameId", "role"],
      select: { playerId: true, gameId: true, role: true, normalized: true, observedPositions: true } }),
    getDatabase().scoringRule.findMany({ where: { presetId: input.presetId } }),
  ]);
  const weights = rules.map((rule) => ({ sport: rule.sport, statKey: rule.statKey, applicability: rule.applicability,
    coefficientTenths: Math.round(Number(rule.coefficient) * 10) }));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.playerId}:${row.gameId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [key, appearances] of groups) {
    if (perGame.has(key)) continue;
    const row = appearances[0];
    let score: bigint | null = null;
    if (appearances.length === 1) {
      const result = calculateScore(weights, { role: row.role, stats: row.normalized as StatValues,
        teEligible: row.role === "FOOTBALL" && row.observedPositions.length ? row.observedPositions.includes("TE") : null });
      if (!result.missingStats.length) score = BigInt(result.totalTenths);
    }
    perGame.set(key, { playerId: row.playerId, score });
  }
  const totals = new Map<string, { gamesPlayed: number; scoredGames: number; totalTenths: bigint }>();
  for (const { playerId, score } of perGame.values()) {
    const value = totals.get(playerId) ?? { gamesPlayed: 0, scoredGames: 0, totalTenths: 0n };
    value.gamesPlayed++;
    if (score != null) { value.scoredGames++; value.totalTenths += score; }
    totals.set(playerId, value);
  }
  return new Map([...totals].map(([playerId, value]) => [playerId, {
    ...value,
    totalTenths: value.scoredGames === value.gamesPlayed ? value.totalTenths : null,
    averageTenths: value.scoredGames === value.gamesPlayed ? Number(value.totalTenths) / value.gamesPlayed : null,
    projectionTenths: null,
  }]));
}

export function displayTenths(value: bigint | number | null | undefined) {
  return value == null ? "N/A" : (Number(value) / 10).toFixed(1);
}
