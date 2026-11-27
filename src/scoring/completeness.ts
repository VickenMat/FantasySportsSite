import type { GameStatRole } from "@/generated/prisma/enums";
import { calculateScore, type ScoringRuleInput, type StatValues } from "./engine";

export type HistoricalAppearance = {
  playerId: string; gameId: string; role: GameStatRole; normalized: StatValues; observedPositions: string[];
  /** Exact persisted score-entry context; never a prospective eligibility grant. */
  teEligible?: boolean;
};

/** Latest revisions only; counts are distinct player/game appearances, not source rows. */
export function scoringCompleteness(rows: HistoricalAppearance[], rules: ScoringRuleInput[], selectedRoles: ReadonlyMap<string, GameStatRole> = new Map()) {
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
    const fixedRole = selectedRoles.get(key);
    const selected = fixedRole ? appearances.filter(row => row.role === fixedRole) : appearances;
    if (fixedRole && !selected.length) reasons.add(`SELECTED_ROLE_MISSING:${fixedRole}`);
    if (selected.length > 1) reasons.add(`AMBIGUOUS_ROLE:${selected.map(({ role }) => role).sort().join("+")}`);
    for (const row of selected) {
      const score = calculateScore(rules, { role: row.role, stats: row.normalized,
        teEligible: row.role === "FOOTBALL" ? row.teEligible ?? (row.observedPositions.length ? row.observedPositions.includes("TE") : null) : null });
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
