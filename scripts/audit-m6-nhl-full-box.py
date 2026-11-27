"""Corroborate every available known weighted base field, not just supplements.

This separate offline layer never rewrites archive values or frozen enrichment.
An unresolved known-value disagreement withholds scoring readiness, even when
independently proved FO/SH fields and original numerical scores remain available.
"""
import collections
import hashlib
import json
import math
from pathlib import Path
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'm6-nhl-full-base-vector-corroboration-1'
FIELDS = {'SKATER': {'goals': 'goals', 'assists': 'assists', 'sog': 'shots_on_goal', 'blockedShots': 'blocked_shots', 'hits': 'hits'}, 'GOALIE': {'saves': 'saves', 'goalsAgainst': 'goals_against'}}
def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()
def number(value):
    try:
        numeric = float(value)
        return int(numeric) if math.isfinite(numeric) and numeric.is_integer() else None
    except (TypeError, ValueError):
        return None
def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

baseline = next(row for row in json.loads((ROOT / 'reports/m2-5-analysis.json').read_text())['reports'] if row['sport'] == 'NHL')['source']
archive = ROOT / 'data/player_data' / baseline['path']
archive_sha = digest(archive)
if archive_sha != baseline['sha256']:
    raise RuntimeError('Accepted NHL archive changed')
grouped = collections.defaultdict(dict)
offset = 0
for batch in pq.ParquetFile(archive).iter_batches(columns=['season', 'game_id', 'player_id', 'category', 'team', 'goals', 'assists', 'sog', 'blockedShots', 'hits', 'saves', 'goalsAgainst']):
    for row in batch.to_pylist():
        offset += 1
        year = int(str(row['season'])[:4])
        role = 'GOALIE' if row['category'] == 'goalies' else 'SKATER'
        key = (str(row['game_id']), str(row['player_id']), role)
        if key in grouped[year]:
            raise RuntimeError('Duplicate archive tuple requires explicit corroboration policy')
        grouped[year][key] = {'sourceRow': offset, **row}

seasons = []
for year, rows in sorted(grouped.items()):
    source_root = ROOT / f'data/simulation/nhl_enrichment/{year}'
    profiles = json.loads((source_root / 'source_profiles.json').read_text())['profiles']
    sources = {}
    proofs = []
    for profile in profiles:
        if profile['kind'] not in ('skaters', 'goalies'):
            continue
        if digest(ROOT / 'data/provider_previews/objects' / profile['sourceSha256']) != profile['sourceSha256'] or digest(ROOT / profile['decodedPath']) != profile['decodedSha256']:
            raise RuntimeError('Retained source or derived decode changed')
        proofs.append({'kind': profile['kind'], 'sha256': profile['sourceSha256'], 'sourceUrl': profile['sourceUrl'], 'schemaProfile': profile['schemaProfile'], 'license': profile['license'], 'receivedAt': profile['receivedAt']})
        role = 'SKATER' if profile['kind'] == 'skaters' else 'GOALIE'
        for line in (ROOT / profile['decodedPath']).open():
            row = json.loads(line)
            key = (row['game_id'], row['player_id'], role)
            if key in sources:
                raise RuntimeError('Duplicate published source tuple requires quarantine')
            sources[key] = row
    target = ROOT / f'data/simulation/nhl_corroboration/{year}'
    target.mkdir(parents=True, exist_ok=True)
    path = target / 'comparison.jsonl'
    statuses = collections.Counter()
    conflict_fields = collections.Counter()
    conflicts = []
    with path.open('w') as handle:
        for key, archive_row in sorted(rows.items()):
            source = sources.get(key)
            compared = []
            if source:
                compared = [{'field': field, 'archiveValue': number(archive_row[field]), 'sourceValue': number(source[source_field])} for field, source_field in FIELDS[key[2]].items()]
            differences = [field for field in compared if field['archiveValue'] is not None and field['sourceValue'] is not None and field['archiveValue'] != field['sourceValue']]
            team_conflict = source is not None and archive_row['team'] != source['team_abbrev']
            incomplete = any(field['archiveValue'] is None or field['sourceValue'] is None for field in compared)
            status = 'SOURCE_UNMATCHED' if source is None else 'CONFLICT' if differences or team_conflict else 'INCOMPLETE_COMPARISON' if incomplete else 'AGREEMENT'
            record = {'sport': 'NHL', 'seasonStartYear': year, 'sourceGameId': key[0], 'sourcePlayerId': key[1], 'role': key[2], 'archiveSourceRow': archive_row['sourceRow'], 'comparisonStatus': status, 'comparedV9Fields': compared, 'conflicts': differences, 'teamConflict': team_conflict, 'archiveTeam': archive_row['team'], 'sourceTeam': source['team_abbrev'] if source else None, 'sourceProofs': proofs, 'archiveSha256': archive_sha, 'sourceKnownAt': None, 'historicalOnly': True, 'transformVersion': VERSION, 'scoringReadinessQualified': status == 'AGREEMENT', 'scope': 'Every available direct published weighted base-box field; exact FO/SH and decision/shutout proofs remain a separate immutable overlay.'}
            handle.write(canonical(record) + '\n')
            statuses[status] += 1
            if status == 'CONFLICT':
                conflict_fields.update(field['field'] for field in differences)
                conflicts.append({key: record[key] for key in ['seasonStartYear', 'sourceGameId', 'sourcePlayerId', 'role', 'conflicts', 'teamConflict']})
    manifest = {'version': VERSION, 'seasonStartYear': year, 'archiveRows': len(rows), 'archiveSha256': archive_sha, 'sourceRows': len(sources), 'sourceRowsOutsideArchive': len(set(sources) - set(rows)), 'comparisonStatuses': dict(statuses), 'conflictFields': dict(conflict_fields), 'conflictGames': len({row['sourceGameId'] for row in conflicts}), 'conflicts': conflicts, 'sourceProofs': proofs, 'comparisonPath': str(path.relative_to(ROOT)), 'comparisonSha256': digest(path), 'comparisonBytes': path.stat().st_size, 'developmentWrites': 0, 'existingValuesChanged': 0, 'independentSupplementFactsRetained': True}
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    seasons.append(manifest)
if digest(archive) != archive_sha:
    raise RuntimeError('Archive changed during comparison')
report = {'version': VERSION, 'archiveSha256': archive_sha, 'archiveRows': offset, 'seasons': seasons, 'conflictRows': sum(row['comparisonStatuses'].get('CONFLICT', 0) for row in seasons), 'missingFieldsOnlyOverlayContradictionsAreNotFullVectorAgreement': True, 'developmentWrites': 0, 'existingValuesChanged': 0, 'sourcePreference': 'UNRESOLVED; no source revision is silently chosen', 'transformationSha256': digest(Path(__file__))}
report['fingerprint'] = hashlib.sha256(canonical(report).encode()).hexdigest()
(ROOT / 'reports/m6-nhl-full-box-corroboration.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'fingerprint': report['fingerprint'], 'archiveRows': offset, 'conflictRows': report['conflictRows'], 'seasons': [{key: row[key] for key in ['seasonStartYear', 'comparisonStatuses', 'conflictFields', 'comparisonSha256']} for row in seasons]}, indent=2))
