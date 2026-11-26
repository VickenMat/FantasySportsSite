import { integer, type SourceRow } from './read';

/** NHL Rule 84.4: shootout team score adds one, individual scoring does not. */
export function nhlFinalScoreMatches(end: SourceRow, info: SourceRow | null) {
  if (!info || (end.game_id && end.game_id !== info.game_id)) return false;
  const home = integer(end.home_score), away = integer(end.away_score);
  const finalHome = integer(info.home_score), finalAway = integer(info.away_score);
  if ([home, away, finalHome, finalAway].some(value => value === null)) return false;
  if (end.period_type === 'SHOOTOUT') {
    return info.game_type === 'R' && home === away &&
      ((finalHome === home! + 1 && finalAway === away) || (finalAway === away! + 1 && finalHome === home));
  }
  return finalHome === home && finalAway === away;
}
