import type { SourceRow } from './read';
import { nhlFinalScoreMatches } from './nhl-final-score';

/** Faceoff counts do not depend on assist/scoring-credit reconciliation. */
export function reconcileNhlFaceoffs(skaters: SourceRow[], events: SourceRow[], info: SourceRow[]) {
  const games = new Map<string, { skaters: SourceRow[]; events: SourceRow[]; info: SourceRow | null; duplicateInfo: boolean }>();
  const game = (id: string) => { if (!games.has(id)) games.set(id, { skaters: [], events: [], info: null, duplicateInfo: false }); return games.get(id)!; };
  for (const row of skaters) game(row.game_id).skaters.push(row);
  for (const row of events) game(row.game_id).events.push(row);
  for (const row of info) { const g = game(row.game_id); if (g.info) g.duplicateInfo = true; g.info = row; }
  const accepted = new Map<string, { faceoff_wins: number; faceoffEvents: string[] }>();
  const rejected: { gameId: string; reasons: string[] }[] = [];
  for (const [gameId, g] of games) {
    const reasons: string[] = [], ends = g.events.filter(event => event.event_type === 'GAME_END');
    if (g.duplicateInfo || g.info?.game_state !== 'OFF' || ends.length !== 1) reasons.push('FINAL_STREAM_NOT_PROVEN');
    if (ends.length === 1 && !nhlFinalScoreMatches(ends[0], g.info)) reasons.push('FINAL_SCORE_MISMATCH');
    const players = new Map(g.skaters.map(row => [row.player_id, row]));
    if (players.size !== g.skaters.length || players.size < 30 || new Set(g.skaters.map(row => row.team_id)).size !== 2) reasons.push('INCOMPLETE_OR_DUPLICATE_SKATER_BOX');
    const counts = new Map([...players.keys()].map(id => [id, { wins: 0, losses: 0, events: [] as string[] }]));
    const seen = new Set<string>(); let faceoffs = 0;
    for (const event of g.events) {
      const key = event.event_idx || event.event_id;
      if (!key || seen.has(key)) { reasons.push('DUPLICATE_OR_MISSING_EVENT_ID'); continue; } seen.add(key);
      if (event.event_type !== 'FACEOFF') continue;
      faceoffs++;
      const winner = counts.get(event.event_player_1_id), loser = counts.get(event.event_player_2_id);
      if (event.event_player_1_type !== 'Winner' || event.event_player_2_type !== 'Loser' || !winner || !loser || event.event_player_1_id === event.event_player_2_id || players.get(event.event_player_1_id)?.team_id === players.get(event.event_player_2_id)?.team_id) { reasons.push('UNRESOLVED_FACEOFF_ACTORS'); continue; }
      winner.wins++; loser.losses++; winner.events.push(key);
    }
    if (faceoffs < 3) reasons.push('FACEOFF_STREAM_INCOMPLETE');
    for (const [id, count] of counts) if (count.wins + count.losses === 0 && Number(players.get(id)!.faceoff_winning_pctg) > 0) reasons.push('FACEOFF_EVENT_STREAM_INCOMPLETE');
    for (const [id, count] of counts) if (count.wins + count.losses) {
      const value = players.get(id)!.faceoff_winning_pctg, pct = Number(value);
      if (!value?.trim() || !Number.isFinite(pct) || Math.abs(count.wins / (count.wins + count.losses) - pct) > .0051) reasons.push('FACEOFF_PERCENT_VALIDATION_MISMATCH');
    }
    if (reasons.length) { rejected.push({ gameId, reasons: [...new Set(reasons)] }); continue; }
    for (const [id, count] of counts) accepted.set(`${gameId}:${id}`, { faceoff_wins: count.wins, faceoffEvents: count.events });
  }
  return { accepted, rejected, games: games.size };
}
