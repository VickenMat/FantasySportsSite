import { integer, type SourceRow } from './read';
import { nhlFinalScoreMatches } from './nhl-final-score';

/** Null is not zero. A non-winner needs an explicit other winner plus complete decision inventory. */
export function proveNhlGoalieDecisions(rows: SourceRow[], info: SourceRow, end: SourceRow) {
  const reasons: string[] = [], ids = new Set(rows.map(row => row.player_id));
  if (info.game_state !== 'OFF' || !nhlFinalScoreMatches(end, info)) reasons.push('FINAL_GAME_RESULT_UNRESOLVED');
  if (rows.length !== 4 || ids.size !== 4 || rows.some(row => row.game_id !== info.game_id || !/^\d+$/.test(row.player_id))) reasons.push('GOALIE_INVENTORY_INCOMPLETE');
  const home = rows.filter(row => row.team_abbrev === info.home_team_abbr), away = rows.filter(row => row.team_abbrev === info.away_team_abbr);
  if (home.length !== 2 || away.length !== 2 || new Set(home.map(row=>row.team_id)).size!==1 || new Set(away.map(row=>row.team_id)).size!==1 || new Set(rows.map(row => row.team_id)).size !== 2) reasons.push('GOALIE_TEAM_INVENTORY_UNRESOLVED');
  const wins = rows.filter(row => row.decision === 'W'), losses = rows.filter(row => ['L', 'O'].includes(row.decision));
  if (wins.length !== 1 || losses.length !== 1 || rows.some(row => !['', 'W', 'L', 'O'].includes(row.decision))) reasons.push('NON_UNIQUE_OR_INCOMPLETE_GOALIE_DECISIONS');
  const h = integer(info.home_score), a = integer(info.away_score);
  const winner = h !== null && a !== null && h !== a ? h > a ? info.home_team_abbr : info.away_team_abbr : null;
  if (!winner || wins[0]?.team_abbrev !== winner || losses[0]?.team_abbrev === winner) reasons.push('GOALIE_DECISION_RESULT_CONFLICT');
  if (reasons.length) return { accepted: false as const, reasons: [...new Set(reasons)] };
  return { accepted: true as const, winnerId: wins[0].player_id, loserId: losses[0].player_id,
    evidence: { gameId: info.game_id, winningGoalieId: wins[0].player_id, winningTeamId: wins[0].team_id, losingGoalieId: losses[0].player_id, finalHomeScore: h!, finalAwayScore: a!, inventory: rows.map(row => ({ playerId: row.player_id, teamId: row.team_id, decision: row.decision || null })) },
    decisions: new Map(rows.map(row => [row.player_id, row.player_id === wins[0].player_id ? 1 : 0])) };
}
