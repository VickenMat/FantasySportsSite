import { expect, it } from "vitest";
import { scoringCompleteness, type HistoricalAppearance } from "@/scoring/completeness";
import { ubpV9Rules } from "@/scoring/ubp-v9";

it("counts distinct affected appearances and players without replacing missing inputs with zero", () => {
  const row = (gameId: string): HistoricalAppearance => ({ playerId: "p", gameId, role: "BASKETBALL", normalized: {}, observedPositions: [] });
  const report = scoringCompleteness([row("one"), row("two")], ubpV9Rules);
  expect(report).toMatchObject({ appearances: 2, players: 1, affectedAppearances: 2, affectedPlayers: 1 });
  expect(report.issues.find(({ reason }) => reason === "BASKETBALL:PTS")).toEqual({ reason: "BASKETBALL:PTS", appearances: 2, players: 1 });
});

it("reports ambiguous roles independently from each role's missing statistic inputs", () => {
  const rows: HistoricalAppearance[] = ["HITTER", "PITCHER"].map((role) => ({ playerId: "two-way", gameId: "g", role: role as "HITTER" | "PITCHER", normalized: {}, observedPositions: [] }));
  const report = scoringCompleteness(rows, ubpV9Rules);
  expect(report.affectedAppearances).toBe(1);
  expect(report.issues).toContainEqual({ reason: "AMBIGUOUS_ROLE:HITTER+PITCHER", appearances: 1, players: 1 });
});

it("uses a fixed ledger role once while retaining missing inputs and missing selected-role evidence", () => {
  const rules = [{sport:'MLB' as const,statKey:'hits',applicability:'hitter',coefficientTenths:10},{sport:'MLB' as const,statKey:'strikeouts',applicability:'pitcher',coefficientTenths:10}];
  const rows:HistoricalAppearance[]=[{playerId:'p',gameId:'g',role:'HITTER',normalized:{},observedPositions:[]},{playerId:'p',gameId:'g',role:'PITCHER',normalized:{strikeouts:0},observedPositions:[]}];
  expect(scoringCompleteness(rows,rules,new Map([['p:g','PITCHER']]))).toMatchObject({appearances:1,affectedAppearances:0});
  expect(scoringCompleteness(rows,rules,new Map([['p:g','HITTER']]))).toMatchObject({affectedAppearances:1});
  expect(scoringCompleteness(rows,rules,new Map([['p:g','BASKETBALL']])).issues).toContainEqual({reason:'SELECTED_ROLE_MISSING:BASKETBALL',appearances:1,players:1});
});
