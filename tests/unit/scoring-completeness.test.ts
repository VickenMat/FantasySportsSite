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
