import { describe, expect, it } from "vitest";
import type { Sport } from "@/generated/prisma/client";
import { buildPickOrder, chooseAutomaticPlayer, teamForPick } from "@/server/draft";
import { createLeagueSchema, historicalReplayAuthorized, seasonMetadata } from "@/server/league";
import { roundRobinPairings } from "@/server/matchups";
import { configSchema, defaultSlots } from "@/simulation/config";

const sports = ["NFL", "NBA", "MLB", "NHL"] as const;

describe("M3.6 league configuration", () => {
  it("restricts Historical Replay to tests and allowlisted non-production administrators", () => {
    expect(historicalReplayAuthorized("demo@example.test", { NODE_ENV: "production", DEMO_EMAIL: "demo@example.test", HISTORICAL_REPLAY_ADMIN_EMAILS: "" })).toBe(false);
    expect(historicalReplayAuthorized("manager@example.test", { NODE_ENV: "development", DEMO_EMAIL: "demo@example.test", HISTORICAL_REPLAY_ADMIN_EMAILS: "admin@example.test" })).toBe(false);
    expect(historicalReplayAuthorized("admin@example.test", { NODE_ENV: "development", DEMO_EMAIL: "demo@example.test", HISTORICAL_REPLAY_ADMIN_EMAILS: "admin@example.test" })).toBe(true);
    expect(historicalReplayAuthorized("fixture@example.test", { NODE_ENV: "test", DEMO_EMAIL: undefined, HISTORICAL_REPLAY_ADMIN_EMAILS: undefined })).toBe(true);
  });
  it("accepts every league size from 2 through 16 and defaults to 12", () => {
    for (let teams = 2; teams <= 16; teams++) {
      expect(createLeagueSchema.parse({ name: "Size Test", sports: ["NFL"], maxTeams: teams }).maxTeams).toBe(teams);
      expect(configSchema.parse({ sport: "NFL", teams }).teams).toBe(teams);
    }
    expect(createLeagueSchema.parse({ name: "Default Size" }).maxTeams).toBe(12);
  });

  it("accepts all 15 nonempty sport combinations and defaults to all four", () => {
    const combinations: Sport[][] = [];
    for (let mask = 1; mask < 16; mask++) combinations.push(sports.filter((_, index) => mask & (1 << index)) as Sport[]);
    expect(combinations).toHaveLength(15);
    for (const selection of combinations) expect(createLeagueSchema.parse({ name: "Combination", sports: selection }).sports).toEqual(selection);
    expect(createLeagueSchema.parse({ name: "Default Sports" }).sports).toEqual(sports);
  });

  it("models Dynasty, Redraft, keepers, privacy, and spanning seasons", () => {
    expect(createLeagueSchema.parse({ name: "Dynasty League" })).toMatchObject({ format: "DYNASTY", visibility: "PRIVATE" });
    expect(createLeagueSchema.parse({ name: "Keeper League", format: "REDRAFT", keeperLimits: { NFL: 2 } })).toMatchObject({ format: "REDRAFT", keeperLimits: { NFL: 2 } });
    expect(seasonMetadata("NBA", new Date("2026-11-01T00:00:00Z"))).toEqual({ startYear: 2026, label: "2026-27" });
    expect(seasonMetadata("NHL", new Date("2026-02-01T00:00:00Z"))).toEqual({ startYear: 2025, label: "2025-26" });
    expect(seasonMetadata("NFL", new Date("2026-02-01T00:00:00Z"))).toEqual({ startYear: 2026, label: "2026" });
  });
});

describe("M3.6 draft and schedule invariants", () => {
  it("snakes correctly for every supported league size", () => {
    for (let size = 2; size <= 16; size++) {
      const order = Array.from({ length: size }, (_, index) => `T${index + 1}`);
      for (let pick = 1; pick <= size; pick++) expect(teamForPick(order, pick)).toBe(order[pick - 1]);
      for (let pick = 1; pick <= size; pick++) expect(teamForPick(order, size + pick)).toBe(order[size - pick]);
      expect(buildPickOrder(order, 2)).toHaveLength(size * 2);
    }
  });

  it("supports retained players by removing only that franchise's later picks", () => {
    expect(buildPickOrder(["A", "B"], 3, new Map([["A", 1]]))).toEqual(["A", "B", "B", "A", "B"]);
  });

  it("creates two-team and odd-team rounds with byes and no phantom teams", () => {
    expect(roundRobinPairings(["A", "B"], 3)).toEqual([
      { round: 1, homeTeamId: "A", awayTeamId: "B" }, { round: 2, homeTeamId: "A", awayTeamId: "B" }, { round: 3, homeTeamId: "A", awayTeamId: "B" },
    ]);
    const odd = roundRobinPairings(["A", "B", "C"], 3);
    expect(odd).toHaveLength(3);
    expect(new Set(odd.flatMap(({ homeTeamId, awayTeamId }) => [homeTeamId, awayTeamId]))).toEqual(new Set(["A", "B", "C"]));
  });

  it("selects deterministic position-fitting computer picks", () => {
    const candidates = [{ id: "qb", positions: ["QB"] }, { id: "rb", positions: ["RB"] }];
    expect(chooseAutomaticPlayer("NFL", defaultSlots.NFL, [], candidates)?.id).toBe("qb");
    const oneQuarterback = [{ id: "owned-qb", positions: ["QB"] }];
    expect(chooseAutomaticPlayer("NFL", defaultSlots.NFL, oneQuarterback, candidates)?.id).toBe("qb");
    expect(chooseAutomaticPlayer("NFL", defaultSlots.NFL, [...oneQuarterback, { id: "owned-second", positions: ["QB"] }], candidates)?.id).toBe("rb");
    const twoFlexOverride = defaultSlots.NFL.map((slot) => slot === "SUPERFLEX" ? "FLEX" : slot);
    expect(chooseAutomaticPlayer("NFL", twoFlexOverride, oneQuarterback, candidates)?.id).toBe("rb");
  });
});
