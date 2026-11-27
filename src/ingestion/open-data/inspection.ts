import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { parquetMetadata } from 'hyparquet';
import { normalizeHistoricalRow } from '@/imports/normalize';
import type { ReleaseProduct } from './registry';

/** Local structural/normalization acceptance; no canonical or gameplay promotion. */
export function inspectRelease(product: ReleaseProduct, bytes: Uint8Array) {
  if (product.filename.endsWith('.parquet')) {
    const metadata = parquetMetadata(new Uint8Array(bytes).buffer), records = Number(metadata.num_rows);
    if (!Number.isSafeInteger(records) || records < 0 || records > 1_000_000) throw Error('Release row bound exceeded.');
    return { recordsReceived: records, recordsValidated: records, recordsQuarantined: 0, recordsPending: records, recordsAccepted: 0, scope: 'PARQUET_STRUCTURE_ONLY', columns: metadata.schema.map(column => column.name), officialPublicationKnown: false };
  }
  const raw = product.filename.endsWith('.gz') ? gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }) : bytes;
  const rows = parse(raw, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  if (!rows.length || rows.length > 1_000_000) throw Error('Release row bound exceeded.');
  const required = product.id === 'mlb-schedules-2026' ? ['game_pk','season','game_type','game_date','home_team_id','away_team_id','status_code','detailed_state','home_score','away_score'] : product.id === 'nfl-results-2026' ? ['game_id','season','home_team','away_team','home_score','away_score','result','total'] : product.id === 'nfl-statistics-2026' ? ['player_id', 'game_id', 'position'] : product.id === 'nfl-rosters-2026' ? ['gsis_id', 'position'] : product.id === 'mlb-plays-2026' ? ['game_pk', 'at_bat_index', 'batter_id', 'pitcher_id'] : product.id.includes('game-info') ? ['game_id', 'game_state'] : product.id.includes('scoring') ? ['game_id', 'playerId', 'strength'] : product.id === 'nba-schedule-results-2027' ? ['game_id','home_pts','away_pts','home_wl','away_wl'] : product.id === 'nba-boxscores-2027' ? ['game_id','person_id','team_id','points','rebounds_total'] : product.id === 'nba-listed-2027' ? ['athlete_id', 'position_abbreviation'] : ['player_id'];
  if (required.some(column => !(column in rows[0]))) throw Error('Release schema no longer matches the reviewed product.');
  let quarantined = 0;
  if (product.id === 'nfl-statistics-2026') for (const [index, row] of rows.entries()) try { normalizeHistoricalRow('NFL', row, index + 2); } catch { quarantined++; }
  return { recordsReceived: rows.length, recordsValidated: rows.length - quarantined, recordsQuarantined: quarantined, recordsPending: rows.length - quarantined, recordsAccepted: 0, scope: product.id === 'nfl-statistics-2026' ? 'HISTORICAL_NORMALIZATION_ONLY' : 'REVIEWED_COLUMNS_ONLY', columns: Object.keys(rows[0]), officialPublicationKnown: false };
}
