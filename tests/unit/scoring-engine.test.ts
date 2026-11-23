import { describe, expect, it } from "vitest";
import type { GameStatRole } from "@/generated/prisma/enums";
import { calculateScore, chooseRole, formatScore } from "@/scoring/engine";
import { ubpV9Rules } from "@/scoring/ubp-v9";

function roleFor(sport: string, applicability: string): GameStatRole {
  switch (applicability) {
    case "hitter": return "HITTER";
    case "pitcher": return "PITCHER";
    case "goalie": return "GOALIE";
    case "skater": return "SKATER";
    default: return sport === "NFL" ? "FOOTBALL" : "BASKETBALL";
  }
}

describe("per-action scoring", () => {
  it.each(ubpV9Rules)("$sport $statKey applies its V9 weight", (rule) => {
    const { sport, applicability, statKey, coefficientTenths } = rule;
    const role = roleFor(sport, applicability);
    const isInnings = statKey === "pitching_innings";
    const source = isInnings ? "pitching_outs" : applicability === "tightEnd" ? "receptions" : statKey;
    const count = isInnings ? 3 : 1;
    const result = calculateScore([rule], { role, stats: { [source]: count }, teEligible: true });
    expect(result).toEqual({
      totalTenths: coefficientTenths, missingStats: [],
      lineItems: [{ statKey, coefficientTenths, count, per: count, pointsTenths: coefficientTenths }],
    });
  });
});

it("stacks NFL TE receptions exactly once, excludes passing first downs and ignores fumble subtypes", () => {
  const stats = {
    passing_yards: 2, rushing_yards: -3, receptions: 2, passing_first_downs: 9,
    rushing_first_downs: 1, receiving_first_downs: 1, fumbles_lost_total: 1,
    rushing_fumbles_lost: 1, sack_fumbles_lost: 1,
  };
  const eligible = calculateScore(ubpV9Rules, { role: "FOOTBALL", stats, teEligible: true });
  const ineligible = calculateScore(ubpV9Rules, { role: "FOOTBALL", stats, teEligible: false });
  const unknown = calculateScore(ubpV9Rules, { role: "FOOTBALL", stats: { ...stats, fumbles_lost_total: null } });

  expect(eligible.totalTenths).toBe(-35);
  expect(ineligible.totalTenths).toBe(-49);
  expect(eligible.lineItems.map(({ statKey }) => statKey)).not.toContain("passing_first_downs");
  expect(unknown.missingStats).toEqual(expect.arrayContaining(["tight_end_reception_bonus", "fumbles_lost_total"]));
});

it("adds MLB hit bonuses, uses outs, and scores one preselected two-way role", () => {
  const stats = {
    atBats: 3, hits: 2, doubles: 1, homeRuns: 1, caughtStealing: 1,
    pitching_outs: 17, pitching_hits: 2, pitching_homeRuns: 1,
  };
  expect(() => chooseRole(["HITTER", "PITCHER"])).toThrow(/explicitly/);
  expect(() => chooseRole(["HITTER"], "PITCHER")).toThrow(/no box score/);
  expect(calculateScore(ubpV9Rules, { stats, role: chooseRole(["HITTER", "PITCHER"], "HITTER") }).totalTenths).toBe(223);
  expect(calculateScore(ubpV9Rules, { stats, role: chooseRole(["HITTER", "PITCHER"], "PITCHER") }).totalTenths).toBe(309);
});

it("adds offensive rebounds and scores steals higher than blocks", () => {
  const result = calculateScore(ubpV9Rules, { role: "BASKETBALL", stats: { REB: 4, OREB: 2, STL: 1, BLK: 1 } });
  expect(result.totalTenths).toBe(56);
  expect(result.lineItems.map(({ statKey, pointsTenths }) => [statKey, pointsTenths])).toEqual([
    ["BLK", 13], ["OREB", 4], ["REB", 24], ["STL", 15],
  ]);
});

it("reports unavailable NHL categories, distinguishes observed zero, and separates roles", () => {
  const skater = calculateScore(ubpV9Rules, { role: "SKATER", stats: { goals: 0, assists: 1, saves: 30 } });
  expect(skater.missingStats).toEqual(expect.arrayContaining(["faceoff_wins", "shorthanded_points_bonus"]));
  expect(skater.missingStats).not.toContain("goals");
  expect(skater.totalTenths).toBe(62);
  expect(calculateScore(ubpV9Rules, {
    role: "GOALIE", stats: { goals: 5, saves: 30, goalsAgainst: 3, goalie_win: 1, shutout: 0 },
  }).totalTenths).toBe(424);
});

it("is order-independent with exact integer tenths and rejects invalid counts", () => {
  const input = { role: "FOOTBALL" as const, stats: { receptions: 3, fumbles_lost_total: 2, receiving_yards: -7 }, teEligible: true };
  expect(calculateScore([...ubpV9Rules].reverse(), input)).toEqual(calculateScore(ubpV9Rules, input));
  expect(formatScore(-35)).toBe("-3.5");
  expect(formatScore(0)).toBe("0.0");
  expect(() => calculateScore(ubpV9Rules, { role: "SKATER", stats: { goals: -1 } })).toThrow(/Invalid stat/);
  expect(() => calculateScore(ubpV9Rules, { role: "PITCHER", stats: { pitching_outs: 5.2 } })).toThrow(/Invalid stat/);
  expect(calculateScore([{ sport: "MLB", statKey: "pitching_innings", coefficientTenths: 2, applicability: "pitcher" }], {
    role: "PITCHER", stats: { pitching_outs: 1 },
  }).totalTenths).toBe(1);
});
