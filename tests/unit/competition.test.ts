import { describe, expect, it } from "vitest";
import { championshipPointAwards, championshipPointTotals, defaultFixedBracket, rankH2HStandings } from "@/server/competition";

describe("M4.2 competition rules", () => {
  it("ranks independent H2H standings using the approved hierarchy", () => {
    const rows = [
      { teamId: "a", wins: 8, losses: 6, ties: 0, pointsFor: 1000n, pointsAgainst: 900n },
      { teamId: "b", wins: 8, losses: 6, ties: 0, pointsFor: 1000n, pointsAgainst: 850n },
      { teamId: "c", wins: 7, losses: 7, ties: 0, pointsFor: 1200n, pointsAgainst: 800n },
    ];
    const games = [{ homeTeamId: "a", awayTeamId: "b", homeTenths: 99n, awayTenths: 100n }];
    expect(rankH2HStandings(rows, games, new Map()).map(({ teamId }) => teamId)).toEqual(["b", "a", "c"]);
  });

  it("requires an auditable draw instead of hidden database ordering", () => {
    const rows = ["a", "b"].map((teamId) => ({ teamId, wins: 1, losses: 1, ties: 0, pointsFor: 100n, pointsAgainst: 100n }));
    expect(() => rankH2HStandings(rows, [], new Map())).toThrow(/recorded random draw/i);
    expect(rankH2HStandings(rows, [], new Map([["a", 2], ["b", 1]])).map(({ teamId }) => teamId)).toEqual(["b", "a"]);
  });

  it("builds the fixed six-team bracket, byes, third-place and meaningful placement games", () => {
    const bracket = defaultFixedBracket(12, 6);
    expect(bracket).toContainEqual(expect.objectContaining({ key: "CHAMP-QF-A", home: "SEED_3", away: "SEED_6" }));
    expect(bracket).toContainEqual(expect.objectContaining({ key: "CHAMP-SF-A", home: "SEED_1", away: "WINNER_CHAMP-QF-B" }));
    expect(bracket.map(({ key }) => key)).toEqual(expect.arrayContaining(["CHAMP-FINAL", "CHAMP-THIRD", "CHAMP-FIFTH", "CONSOLATION-FINAL", "CONSOLATION-THIRD", "CONSOLATION-FIFTH"]));
  });

  it("awards the default 12-team champion with highest PF exactly 21 points", () => {
    const placements = Array.from({ length: 12 }, (_, index) => ({ teamId: `t${index + 1}`, placement: index + 1, qualified: index < 6, regularPfTenths: BigInt(1200 - index * 10) }));
    const totals = championshipPointTotals(championshipPointAwards(placements, { qualification: 1, champion: 5, runnerUp: 2, third: 1, highestPf: 3, lowestPf: -3 }));
    expect(totals.get("t1")).toEqual({ numerator: 21, denominator: 1 });
    expect(totals.get("t12")).toEqual({ numerator: -2, denominator: 1 });
  });

  it("splits identical PF awards with exact rational precision", () => {
    const awards = championshipPointAwards([
      { teamId: "a", placement: 1, qualified: true, regularPfTenths: 100n },
      { teamId: "b", placement: 2, qualified: true, regularPfTenths: 100n },
      { teamId: "c", placement: 3, qualified: false, regularPfTenths: 50n },
    ], { qualification: 1, champion: 5, runnerUp: 2, third: 1, highestPf: 3, lowestPf: -3 });
    expect(awards.filter(({ type }) => type === "HIGHEST_REGULAR_PF").map(({ points }) => points)).toEqual([{ numerator: 3, denominator: 2 }, { numerator: 3, denominator: 2 }]);
  });
});
