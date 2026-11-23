import type { Sport } from "@/generated/prisma/enums";
import { newSummary } from "@/imports/csv";
import { calculateScore } from "@/scoring/engine";
import { ubpV9Rules } from "@/scoring/ubp-v9";
import { chronologicalSplit } from "@/calibration/splits";
import { readHistoricalParquet } from "./read";

type Mutable = {
  rows: number; totalTenths: number; quarterbackTenths: number;
  players: Map<string, { playerId: string; playerName: string; totalTenths: number; games: Set<string> }>;
  positions: Map<string, number>; roles: Map<string, number>; missing: Record<string, number>;
};

export async function calculateParquetBaseline(path: string, sport: Sport, batchSize = 25_000) {
  const seasons = new Map<number, Mutable>();
  const summary = newSummary();
  for await (const row of readHistoricalParquet({ path, sport, summary, batchSize })) {
    let season = seasons.get(row.season.startYear);
    if (!season) {
      season = { rows: 0, totalTenths: 0, quarterbackTenths: 0, players: new Map(), positions: new Map(), roles: new Map(), missing: {} };
      seasons.set(row.season.startYear, season);
    }
    const score = calculateScore(ubpV9Rules, {
      role: row.role, stats: row.stats,
      teEligible: sport === "NFL" && row.observedPositions.length ? row.observedPositions.includes("TE") : null,
    });
    season.rows++;
    season.totalTenths += score.totalTenths;
    if (sport === "NFL" && row.observedPositions.includes("QB")) season.quarterbackTenths += score.totalTenths;
    const key = `${row.player.externalId}:${row.role}`;
    const player = season.players.get(key) ?? { playerId: row.player.externalId, playerName: row.player.displayName, totalTenths: 0, games: new Set() };
    player.totalTenths += score.totalTenths;
    player.games.add(row.game.externalId);
    season.players.set(key, player);
    const positions = row.observedPositions.length ? row.observedPositions : ["UNKNOWN"];
    for (const position of positions) season.positions.set(position, (season.positions.get(position) ?? 0) + score.totalTenths / positions.length);
    season.roles.set(row.role, (season.roles.get(row.role) ?? 0) + score.totalTenths);
    for (const stat of score.missingStats) season.missing[stat] = (season.missing[stat] ?? 0) + 1;
  }
  const splits = chronologicalSplit([...seasons.keys()]);
  return [...seasons.entries()].sort(([a], [b]) => a - b).map(([year, season]) => ({
    sport, season: year, split: splits[year], scoredRows: season.rows, rawPlayerGamePointsTenths: season.totalTenths,
    quarterbackSharePercent: sport === "NFL" && season.totalTenths
      ? Number((season.quarterbackTenths * 100 / season.totalTenths).toFixed(3)) : null,
    positionContributionsTenths: Object.fromEntries([...season.positions].sort()),
    roleContributionsTenths: Object.fromEntries([...season.roles].sort()),
    missingStatistics: Object.fromEntries(Object.entries(season.missing).sort()),
    topPlayers: [...season.players.values()].sort((a, b) => b.totalTenths - a.totalTenths || a.playerId.localeCompare(b.playerId)).slice(0, 25)
      .map(({ games, ...player }) => ({ ...player, games: games.size })),
    fantasyTeamMeanPoints: null,
    fantasyTeamMeanReason: "Final box scores alone cannot reproduce legal pregame drafts, lineups, and waivers for this season.",
  }));
}
