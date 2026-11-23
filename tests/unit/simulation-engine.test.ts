import { expect, it } from "vitest";
import { configSchema } from "@/simulation/config";
import { simulateSeason } from "@/simulation/engine";
import { parseSnapshot } from "@/simulation/snapshot";
import type { Availability, Fixture, Outcome, RosterSnapshot, SimulationInput } from "@/simulation/types";

const date = (value: string) => Date.parse(`2025-10-${value}Z`);
const draftAt = date("01T00:00:00");
const preDraft = draftAt - 86_400_000;

function fixture(id: string, time: string, slate = id): Fixture {
  return { id, slate, startsAt: date(time), knownAt: preDraft, teams: ["home", "away"] };
}

function member(playerId: string, positions: string[], overrides?: Partial<RosterSnapshot>): RosterSnapshot {
  return { playerId, positions, team: "home", active: true, effectiveAt: preDraft, knownAt: preDraft, ...overrides };
}

function outcome(playerId: string, game: Fixture, pointsTenths: number, role: Outcome["role"] = "BASKETBALL", lag = 3_600_000): Outcome {
  return {
    playerId, gameId: game.id, seasonYear: 2025, role, pointsTenths, missingStats: [],
    playedAt: game.startsAt + 3_600_000, knownAt: game.startsAt + lag,
  };
}

function data(overrides?: Partial<SimulationInput>): SimulationInput {
  return {
    sport: "NBA", year: 2025, label: "2025-26", mode: "as-of", coverage: "UNVERIFIED", coverageReason: "Test data",
    draftAt, fixtures: [fixture("first", "02T18:00:00")], outcomes: [], availability: [], positions: [],
    roster: ["a", "b", "c", "d", "e"].map((id) => member(id, ["PG"])),
    source: { hashes: {}, acceptedRows: 0, rejectedRows: 0, unscheduledRows: 0, assumptions: [] },
    ...overrides,
  };
}
const nba = configSchema.parse({ sport: "NBA", teams: 4, slots: ["PG"], bench: 1, includeTrace: true });

it("uses only preseason-known rosters and scores, and replay is deterministic", () => {
  const game = fixture("first", "02T18:00:00");
  const delayed = member("future", ["PG"], { knownAt: date("01T06:00:00") });
  const input = data({
    fixtures: [game], roster: [...data().roster, delayed],
    outcomes: [outcome("future", game, 99999), outcome("a", game, 100)],
  });
  const result = simulateSeason(input, nba);
  expect(result.trace?.draft.some(({ playerId }) => playerId === "future")).toBe(false);
  const mutated = { ...input, outcomes: [outcome("future", game, 1), outcome("a", game, -99)] };
  expect(simulateSeason(mutated, nba).trace?.draft).toEqual(result.trace?.draft);
  expect(simulateSeason(mutated, nba).trace?.lineups).toEqual(result.trace?.lineups);
  expect(simulateSeason(input, nba)).toEqual(result);
});

it("excludes same-day outcomes even when another slate has already finished", () => {
  const morning = fixture("first", "02T08:00:00");
  const evening = fixture("second", "02T20:00:00");
  const prior = Array.from({ length: 20 }, (_, i): Outcome => ({
    ...outcome("a", morning, 200), gameId: `prior-${i}`, seasonYear: 2024,
    playedAt: preDraft - (20 - i) * 86_400_000, knownAt: preDraft - (20 - i) * 86_400_000,
  }));
  const input = data({ fixtures: [morning, evening], outcomes: prior });
  const baseline = simulateSeason(input, nba);
  const sameDay = simulateSeason({
    ...input,
    outcomes: [...prior, outcome("a", morning, 10000), outcome("b", morning, 12000)],
  }, nba);
  expect(sameDay.trace?.lineups).toEqual(baseline.trace?.lineups);
});

it("uses announced trades and injuries only after their pregame timestamps", () => {
  const first = fixture("first", "02T18:00:00");
  const next = { ...fixture("second", "06T18:00:00"), teams: ["new-team", "other"] };
  const switched = member("a", ["PG"], {
    team: "new-team", effectiveAt: date("02T10:00:00"), knownAt: date("03T12:00:00"),
  });
  const injured = member("a", ["PG"], {
    team: "new-team", active: false, effectiveAt: date("06T15:00:00"), knownAt: date("06T16:00:00"),
  });
  const established = outcome("a", first, 400);
  established.seasonYear = 2024;
  established.playedAt = preDraft - 2 * 86_400_000;
  established.knownAt = preDraft;
  const input = data({ roster: [...data().roster, switched], fixtures: [first, next], outcomes: [established] });
  const healthy = simulateSeason(input, nba);
  expect(healthy.trace?.lineups.filter(({ playerId }) => playerId === "a").flatMap(({ games }) => games)).toEqual(["first", "second"]);
  const injuredResult = simulateSeason({ ...input, roster: [...input.roster, injured] }, nba);
  expect(injuredResult.trace?.lineups.filter(({ playerId }) => playerId === "a").flatMap(({ games }) => games)).toEqual(["first"]);
});

it("resolves weekly FAAB only from known information, de-duplicates ownership, and never overspends", () => {
  const first = fixture("first", "02T18:00:00");
  const late = fixture("late", "16T18:00:00");
  const deadline = date("08T12:00:00");
  const active = member("waiver-target", ["PG"], { effectiveAt: deadline, knownAt: deadline });
  const newScore = { ...outcome("waiver-target", first, 2000), knownAt: deadline };
  const input = data({ fixtures: [first, late], roster: [...data().roster, active], outcomes: [newScore] });
  const result = simulateSeason(input, { ...nba, bench: 0, faab: 2 });
  const claims = result.trace?.waivers.filter(({ add }) => add === "waiver-target") ?? [];
  expect(claims).toHaveLength(4);
  expect(claims.every(({ at, bid }) => at === date("15T12:00:00") && bid === 2)).toBe(true);
  expect(claims.filter(({ won }) => won)).toHaveLength(1);
  expect(result.metrics.teams.every(({ remainingFaab }) => remainingFaab >= 0)).toBe(true);
  expect(result.trace?.lineups.filter(({ playerId, games }) => playerId === "waiver-target" && games.includes("late"))).toHaveLength(1);
});

it("requires a pregame pitcher status and scores a two-way MLB athlete once", () => {
  const game = fixture("first", "02T18:00:00");
  const input = data({
    sport: "MLB", label: "2025", fixtures: [game],
    roster: [member("dual", ["SP", "DH"]), ...["a", "b", "c", "d"].map((id) => member(id, ["DH"]))],
    outcomes: [outcome("dual", game, 1000, "HITTER"), outcome("dual", game, 220, "PITCHER")],
  });
  const config = configSchema.parse({ sport: "MLB", slots: ["SP", "UTIL"], teams: 4, bench: 0, includeTrace: true });
  const unknown = simulateSeason(input, config);
  expect(unknown.trace?.scores.filter(({ role }) => role === "PITCHER")).toEqual([]);
  expect(unknown.metrics.vacancies.availability).toBeGreaterThan(0);
  const status: Availability = { playerId: "dual", gameId: game.id, role: "PITCHER", probability: 1, usage: "starter", knownAt: game.startsAt - 1 };
  const confirmed = simulateSeason({ ...input, availability: [status] }, config);
  expect(confirmed.trace?.scores.filter(({ playerId }) => playerId === "dual")).toEqual([
    expect.objectContaining({ role: "PITCHER", pointsTenths: 220 }),
  ]);
  const late = simulateSeason({ ...input, availability: [{ ...status, knownAt: game.startsAt }] }, config);
  expect(late.trace?.lineups).toEqual(unknown.trace?.lineups);
  const differentFinalScores = simulateSeason({
    ...input, availability: [status], outcomes: [outcome("dual", game, 1, "HITTER"), outcome("dual", game, 5000, "PITCHER")],
  }, config);
  expect(differentFinalScores.trace?.lineups).toEqual(confirmed.trace?.lineups);
});

it("requires status for NHL goalies and excludes any schedule published after a slate lock", () => {
  const early = fixture("early", "02T15:00:00", "same-slate");
  const late = {
    ...fixture("late", "02T21:00:00", "same-slate"), knownAt: date("02T17:00:00"), teams: ["later", "other"],
  };
  const goalie = member("a", ["G"]);
  const laterGoalie = member("b", ["G"], { team: "later" });
  const input = data({
    sport: "NHL", fixtures: [early, late], roster: [goalie, laterGoalie],
    availability: [{ playerId: "b", gameId: late.id, role: "GOALIE", probability: 1, knownAt: preDraft }],
  });
  const config = configSchema.parse({ sport: "NHL", slots: ["G"], teams: 4, bench: 0, includeTrace: true });
  const result = simulateSeason(input, config);
  expect(result.metrics.filledSlots).toBe(0);
  expect(result.metrics.vacancies).toMatchObject({ schedule: 1, availability: 1 });
});

it("validates strict snapshots, including duplicate data and future publication", () => {
  const test = {
    sport: "NBA", year: 2025, label: "2025-26", coverage: "UNVERIFIED", coverageReason: "Test",
    draftAt: "2025-10-01T00:00:00Z", roster: [],
    fixtures: [{ id: "game", slate: "day", teams: ["a", "b"], knownAt: "2025-09-30T00:00:00Z", startsAt: "2025-10-02T10:00:00Z" }],
    outcomes: [{
      playerId: "a", gameId: "game", seasonYear: 2025, role: "BASKETBALL",
      playedAt: "2025-10-02T12:00:00Z", knownAt: "2025-10-02T13:00:00Z", stats: { PTS: 4 },
    }],
  };
  expect(parseSnapshot(JSON.stringify(test)).outcomes[0]).toMatchObject({ pointsTenths: 20 });
  expect(() => parseSnapshot(JSON.stringify({ ...test, fixtures: [test.fixtures[0], test.fixtures[0]] }))).toThrow(/Duplicate fixture/);
  expect(() => parseSnapshot(JSON.stringify({
    ...test, outcomes: [{ ...test.outcomes[0], knownAt: "2025-10-02T09:00:00Z" }],
  }))).toThrow(/publication/);
});
