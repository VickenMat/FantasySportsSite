import { beforeEach, expect, it, vi } from "vitest";
import { displayTenths, playerStatistics } from "@/server/player-statistics";
import { ubpV9Rules } from "@/scoring/ubp-v9";
import { applicableRules } from "@/scoring/engine";

const { ledgers, stats, rules } = vi.hoisted(() => ({ ledgers: vi.fn(), stats: vi.fn(), rules: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDatabase: () => ({
  scoreLedger: { findMany: ledgers }, playerGameStat: { findMany: stats }, scoringRule: { findMany: rules },
}) }));
beforeEach(() => {
  ledgers.mockResolvedValue([]);
  stats.mockResolvedValue([]);
  rules.mockResolvedValue(ubpV9Rules.map((rule) => ({ ...rule, coefficient: rule.coefficientTenths / 10 })));
});

it("formats authoritative ledger tenths consistently and never invents unavailable values", () => {
  expect(displayTenths(123n)).toBe("12.3");
  expect(displayTenths(45.5)).toBe("4.5");
  expect(displayTenths(null)).toBe("N/A");
  expect(displayTenths(undefined)).toBe("N/A");
});

it("derives complete historical points without writing competitive ledger events", async () => {
  const normalized = Object.fromEntries(applicableRules(ubpV9Rules, "BASKETBALL").map(({ statKey }) => [statKey, 0]));
  normalized.PTS = 10;
  stats.mockResolvedValue([{ playerId: "p", gameId: "g", role: "BASKETBALL", normalized, observedPositions: [] }]);
  const values = await playerStatistics({ playerIds: ["p"], presetId: "v9", seasonId: "s" });
  expect(values.get("p")).toMatchObject({ gamesPlayed: 1, scoredGames: 1, totalTenths: BigInt(10 * ubpV9Rules.find(({ sport, statKey }) => sport === "NBA" && statKey === "PTS")!.coefficientTenths) });
});

it("keeps missing statistics and ambiguous two-way roles unknown", async () => {
  stats.mockResolvedValue([
    { playerId: "p", gameId: "g", role: "BASKETBALL", normalized: {}, observedPositions: [] },
    { playerId: "two-way", gameId: "mlb", role: "HITTER", normalized: {}, observedPositions: [] },
    { playerId: "two-way", gameId: "mlb", role: "PITCHER", normalized: {}, observedPositions: [] },
  ]);
  const values = await playerStatistics({ playerIds: ["p", "two-way"], presetId: "v9", seasonId: "s" });
  expect(values.get("p")).toMatchObject({ gamesPlayed: null,knownPlayedGames:0,unknownParticipationGames:1, scoredGames: 0, totalTenths: null, averageTenths: null });
  expect(values.get("two-way")?.totalTenths).toBeNull();
});

it("does not count an appearance twice when its persisted ledger is present", async () => {
  ledgers.mockResolvedValue([{ playerId: "p", gameId: "g", entries: [{ totalTenths: 100n, missingStats: [] }] }]);
  stats.mockResolvedValue([{ playerId: "p", gameId: "g", role: "BASKETBALL", normalized: {}, raw:{MIN:'12'}, observedPositions: [] }]);
  const values = await playerStatistics({ playerIds: ["p"], presetId: "v9", seasonId: "s" });
  expect(values.get("p")).toMatchObject({ gamesPlayed: 1, totalTenths: 100n });
});

it("keeps unselected professional sources, conflicting legacy sources and incomplete selected totals unknown", async () => {
  const normalized = Object.fromEntries(applicableRules(ubpV9Rules, "BASKETBALL").map(({ statKey }) => [statKey, 0]));
  const row = { playerId: "p", gameId: "g", role: "BASKETBALL", provider: "source-a", normalized, observedPositions: [], raw: { professionalObservation: { observationId: "fixture" } } };
  stats.mockResolvedValue([row]);
  expect((await playerStatistics({ playerIds: ["p"], presetId: "v9", seasonId: "s" })).get("p")?.totalTenths).toBeNull();
  stats.mockResolvedValue([{ ...row, raw: {} }, { ...row, provider: "source-b", raw: {} }]);
  expect((await playerStatistics({ playerIds: ["p"], presetId: "v9", seasonId: "s" })).get("p")?.totalTenths).toBeNull();
  ledgers.mockResolvedValue([{ playerId: "p", gameId: "g", entries: [{ totalTenths: 100n, missingStats: ["REB"] }] }]);
  expect((await playerStatistics({ playerIds: ["p"], presetId: "v9", seasonId: "s" })).get("p")).toMatchObject({ gamesPlayed: null,unknownParticipationGames:1, scoredGames: 0, totalTenths: null });
});
