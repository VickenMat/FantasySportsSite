import type { GameStatRole } from "@/generated/prisma/enums";
import { calculateScore, type ScoringRuleInput, type StatValues } from "./engine";

export type HistoricalAppearance = {
  playerId: string; gameId: string; role: GameStatRole; normalized: StatValues; observedPositions: string[];
};

/** Latest revisions only; counts are distinct player/game appearances, not source rows. */
export function scoringCompleteness(rows: HistoricalAppearance[], rules: ScoringRuleInput[]) {
  const groups = new Map<string, HistoricalAppearance[]>();
  for (const row of rows) {
    const key = `${row.playerId}:${row.gameId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const issues = new Map<string, { appearances: Set<string>; players: Set<string> }>();
  const affectedPlayers = new Set<string>();
  let affectedAppearances = 0;
  for (const [key, appearances] of groups) {
    const reasons = new Set<string>();
    if (appearances.length > 1) reasons.add(`AMBIGUOUS_ROLE:${appearances.map(({ role }) => role).sort().join("+")}`);
    for (const row of appearances) {
      const score = calculateScore(rules, { role: row.role, stats: row.normalized,
        teEligible: row.role === "FOOTBALL" && row.observedPositions.length ? row.observedPositions.includes("TE") : null });
      for (const stat of score.missingStats) reasons.add(`${row.role}:${stat}`);
    }
    if (reasons.size) { affectedAppearances++; affectedPlayers.add(appearances[0].playerId); }
    for (const reason of reasons) {
      const issue = issues.get(reason) ?? { appearances: new Set<string>(), players: new Set<string>() };
      issue.appearances.add(key); issue.players.add(appearances[0].playerId); issues.set(reason, issue);
    }
  }
  return { appearances: groups.size, players: new Set(rows.map(({ playerId }) => playerId)).size,
    affectedAppearances, affectedPlayers: affectedPlayers.size,
    issues: [...issues].sort(([a], [b]) => a.localeCompare(b)).map(([reason, issue]) => ({
      reason, appearances: issue.appearances.size, players: issue.players.size,
    })) };
}
