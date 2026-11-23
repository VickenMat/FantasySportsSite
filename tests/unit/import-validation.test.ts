import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { validateHistoricalCsv } from "@/imports/csv";
import { baseballOuts, normalizeHistoricalRow } from "@/imports/normalize";
import { mlbRow, nbaRow, nflRow, nhlRow, writeHistoricalCsv } from "../helpers/historical-csv";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "fantasy-import-unit-")); });
afterEach(() => rm(dir, { recursive: true, force: true }));

it("preserves MLB raw roles and converts baseball notation exactly from outs or innings", () => {
  expect(baseballOuts("5.2")).toBe(17);
  expect(baseballOuts("0.1")).toBe(1);
  expect(() => baseballOuts("5.3")).toThrow(/innings notation/);
  const raw = { ...mlbRow, category: "pitching", hits: "3", inningsPitched: "5.2", outs: "17", strikeOuts: "4" };
  const pitcher = normalizeHistoricalRow("MLB", raw, 2);
  expect(pitcher.raw).toBe(raw);
  expect(pitcher).toMatchObject({ role: "PITCHER", stats: { pitching_outs: 17, pitching_hits: 3, pitching_strikeOuts: 4 } });
  expect(pitcher.stats).not.toHaveProperty("hits");
  expect(normalizeHistoricalRow("MLB", mlbRow, 2).stats).toHaveProperty("hits", 2);
  expect(() => normalizeHistoricalRow("MLB", { ...raw, outs: "16" }, 3)).toThrow(/disagree/);
});

it("keeps NFL team aliases stable, allows negative yardage and leaves unknown game date unset", () => {
  const row = { ...nflRow, game_id: "2025_01_OAK_BAL", opponent_team: "LV", rushing_yards: "-3" };
  const normalized = normalizeHistoricalRow("NFL", row, 2);
  expect(normalized).toMatchObject({
    team: { code: "BAL", side: "HOME" }, opponent: { code: "LV", side: "AWAY" },
    game: { gameDate: null, week: 1 }, stats: { rushing_yards: -3 },
  });
  expect(normalized.stats).not.toHaveProperty("passing_first_downs");
  expect(() => normalizeHistoricalRow("NFL", { ...row, receptions: "-1" }, 3)).toThrow(/range/);
  expect(() => normalizeHistoricalRow("NFL", { ...row, opponent_team: "BUF" }, 3)).toThrow(/teams disagree/);
});

it("preserves leading zeros and distinguishes partial, quarantined and unverified seasons", () => {
  const nba = normalizeHistoricalRow("NBA", nbaRow, 2);
  expect(nba).toMatchObject({ game: { externalId: "0022500001", phase: "REGULAR" }, season: { coverage: "UNVERIFIED" } });
  expect(nba.observedPositions).toEqual([]);
  expect(normalizeHistoricalRow("NBA", { ...nbaRow, SEASON_YEAR: "2026-27", GAME_DATE: "2026-10-25" }, 2).season.coverage).toBe("PARTIAL");
  expect(normalizeHistoricalRow("MLB", { ...mlbRow, season: "2020", game_date: "2020-08-25" }, 2).season.coverage).toBe("QUARANTINED");
  expect(normalizeHistoricalRow("NHL", { ...nhlRow, season: "2019-20", game_date: "2019-10-25", game_id: "2019020001" }, 2).season.coverage).toBe("QUARANTINED");
  expect(() => normalizeHistoricalRow("NBA", { ...nbaRow, GAME_DATE: "2025-02-30" }, 2)).toThrow(/Invalid calendar/);
});

it("reports missing NHL counts and requires a decision or evidence for goalie bonuses", () => {
  expect(normalizeHistoricalRow("NHL", nhlRow, 2)).toMatchObject({
    observedPositions: ["LW"], stats: { goals: 0, faceoff_wins: null, shorthanded_points_bonus: null },
  });
  const goalie = { ...nhlRow, category: "goalies", position: "G", saves: "32", goalsAgainst: "0", toi: "59:40", starter: "True" };
  expect(normalizeHistoricalRow("NHL", goalie, 3).stats).toMatchObject({ goalie_win: null, shutout: null });
  expect(normalizeHistoricalRow("NHL", { ...goalie, decision: "W", shutout: "1" }, 3).stats).toMatchObject({ goalie_win: 1, shutout: 1 });
  expect(normalizeHistoricalRow("NHL", { ...goalie, decision: "O", goalsAgainst: "4" }, 3).stats).toMatchObject({ goalie_win: 0, shutout: 0 });
  expect(() => normalizeHistoricalRow("NHL", { ...goalie, shutout: "1", goalsAgainst: "2" }, 3)).toThrow(/conflicts/);
});

it("validates quoted CSV and reports rejected rows, omissions and season coverage", async () => {
  const file = await writeHistoricalCsv(join(dir, "valid.csv"), [mlbRow, { ...mlbRow, hits: "-1" }]);
  const summary = await validateHistoricalCsv(file, "MLB");
  expect(summary).toMatchObject({
    sourceRows: 2, validRows: 1, rejectedRows: 1, missingStats: { "HITTER:triples": 1 },
    seasons: { "2025": { coverage: "UNVERIFIED", validRows: 1 } },
    sampleIssues: [{ line: 3, message: expect.stringContaining("hits") }],
  });
});

it("rejects duplicate headers, wrong sport headers and structurally malformed records", async () => {
  const file = join(dir, "invalid.csv");
  await writeFile(file, "season,season\n2025,2025\n");
  await expect(validateHistoricalCsv(file, "MLB")).rejects.toThrow(/unique column/);
  await writeHistoricalCsv(file, [mlbRow]);
  await expect(validateHistoricalCsv(file, "NBA")).rejects.toThrow(/missing NBA identity/i);
  await writeFile(file, "season,game_id,game_date,player_id,player_name,team_id,team_name,category,hits\n2025,123\n");
  await expect(validateHistoricalCsv(file, "MLB")).rejects.toThrow(/Invalid Record Length/i);
});
