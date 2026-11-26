import type { SourceRow } from './read';

const plateAppearanceTypes = new Set(['field_out','strikeout','single','walk','home_run','double','force_out','hit_by_pitch','double_play','sac_bunt','sac_fly','grounded_into_double_play','field_error','triple','fielders_choice_out','intent_walk','fielders_choice','strikeout_double_play','catcher_interf','sac_fly_double_play','triple_play']);
const baserunningOutTypes = new Set(['caught_stealing_2b','caught_stealing_3b','caught_stealing_home','pickoff_1b','pickoff_2b','pickoff_3b','pickoff_caught_stealing_2b','pickoff_caught_stealing_3b','pickoff_caught_stealing_home']);

/** Non-play advisories and inning-ending baserunning outs do not charge a PA.
 * MLB glossary: https://www.mlb.com/glossary/standard-stats/plate-appearance
 */
export function mlbPlayCompleteness(rows: SourceRow[], expectedPlateAppearances: ReadonlyMap<string, number>) {
  const batters = new Set<string>(), pitchers = new Set<string>(), indices = new Set<number>();
  const counts = new Map<string, number>(), excluded: { index: string; type: string; reason: string }[] = [], reasons: string[] = [];
  for (const row of rows) {
    const index = Number(row.at_bat_index);
    if (!/^\d+$/.test(row.at_bat_index) || !Number.isSafeInteger(index) || indices.has(index)) reasons.push('INVALID_OR_DUPLICATE_PLAY_INDEX');
    indices.add(index);
    const advisory = row.event_type === 'game_advisory';
    const nonPa = advisory || (baserunningOutTypes.has(row.event_type) && row.outs === '3');
    if (nonPa) excluded.push({ index: row.at_bat_index, type: row.event_type, reason: advisory ? 'NON_PLAY_ADVISORY' : 'INNING_ENDING_BASERUNNING_OUT' });
    else if (plateAppearanceTypes.has(row.event_type)) {
      if (!/^\d+$/.test(row.batter_id)) reasons.push('MISSING_BATTER_ID');
      else { batters.add(row.batter_id); counts.set(row.batter_id, (counts.get(row.batter_id) ?? 0) + 1); }
    } else reasons.push(`UNREVIEWED_EVENT_TYPE:${row.event_type}`);
    if (!advisory) {
      if (!/^\d+$/.test(row.pitcher_id)) reasons.push('MISSING_PITCHER_ID');
      else pitchers.add(row.pitcher_id);
    }
  }
  if (!rows.length || indices.size !== rows.length || Math.min(...indices) !== 0 || Math.max(...indices) !== rows.length - 1) reasons.push('PLAY_INDEX_STREAM_INCOMPLETE');
  const sourcePA = [...counts.values()].reduce((sum, value) => sum + value, 0), boxPA = [...expectedPlateAppearances.values()].reduce((sum, value) => sum + value, 0);
  if (sourcePA !== boxPA) reasons.push('BOX_PLATE_APPEARANCE_TOTAL_MISMATCH');
  for (const [id, value] of expectedPlateAppearances) if ((counts.get(id) ?? 0) !== value) reasons.push('PLAYER_PLATE_APPEARANCE_MISMATCH');
  if ([...counts.keys()].some(id => !expectedPlateAppearances.has(id))) reasons.push('BOX_PLAYER_IDENTITY_UNRESOLVED');
  return { complete: reasons.length === 0, reasons: [...new Set(reasons)], rows: rows.length, sourcePlateAppearances: sourcePA, boxPlateAppearances: boxPA, excluded, batters, pitchers, counts };
}
