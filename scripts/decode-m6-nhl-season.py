"""Decode bounded licensed seasonal Parquets; source data remain immutable.

PyArrow is already installed. Only source event types used by the existing exact
reconciler are materialized. Schema names/types are retained in each profile.
"""
import hashlib
import json
import pathlib
import sys
import pyarrow.parquet as pq

year = int(sys.argv[1])
if year < 2017 or year > 2027:
    raise ValueError('Explicit historical seasonal end year required')
root = pathlib.Path('data/provider_previews/m6-nhl') / str(year)
out = pathlib.Path('data/simulation/nhl_enrichment') / str(year - 1)
out.mkdir(parents=True, exist_ok=True)
prefixes = {'skaters': 'skater_box', 'goalies': 'goalie_box', 'info': 'game_info', 'scoring': 'scoring', 'events': 'play_by_play_lite'}
event_columns = ['game_id', 'event_type', 'event_idx', 'event_id', 'event_player_1_type', 'event_player_1_id', 'event_player_2_type', 'event_player_2_id', 'event_player_3_type', 'event_player_3_id', 'period', 'period_type', 'period_time', 'home_score', 'away_score']
required = {
 'skaters': ['game_id', 'player_id', 'season', 'team_id', 'team_abbrev', 'goals', 'assists', 'faceoff_winning_pctg', 'toi'],
 'goalies': ['game_id', 'player_id', 'season', 'team_id', 'team_abbrev', 'decision', 'goals_against', 'toi'],
 'info': ['game_id', 'season', 'game_type', 'game_state', 'home_team_abbr', 'away_team_abbr', 'home_score', 'away_score'],
 'scoring': ['game_id', 'playerId', 'eventId', 'period_number', 'timeInPeriod', 'assists', 'strength'],
 'events': event_columns,
}
profiles = []
def scalar(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)

for kind, prefix in prefixes.items():
    receipt = json.loads((root / f'{prefix}_{year}.parquet.source.json').read_text())
    path = pathlib.Path('data/provider_previews/objects') / receipt['sha256']
    if hashlib.sha256(path.read_bytes()).hexdigest() != receipt['sha256']:
        raise ValueError('Immutable historical source fingerprint changed')
    parquet = pq.ParquetFile(path)
    missing = sorted(set(required[kind]) - set(parquet.schema.names))
    profile = {'kind': kind, 'sourceSha256': receipt['sha256'], 'sourceUrl': receipt['sourceUrl'], 'license': receipt['license'], 'licenseReference': receipt['licenseReference'], 'receivedAt': receipt['receivedAt'], 'sourceKnownAt': None, 'physicalRows': parquet.metadata.num_rows, 'schema': str(parquet.schema_arrow), 'missingColumns': missing, 'schemaProfile': 'NHL_OFFICIAL_DERIVED_NAMED_FIELDS_V1' if not missing else 'UNSUPPORTED_SOURCE_SCHEMA'}
    profiles.append(profile)
    target = out / f'{kind}.decoded.jsonl'
    materialized = 0
    with target.open('w') as handle:
        if not missing:
            for batch in parquet.iter_batches(columns=event_columns if kind == 'events' else None, batch_size=8192):
                for row in batch.to_pylist():
                    if kind == 'events' and row['event_type'] not in ('FACEOFF', 'GOAL', 'GAME_END'):
                        continue
                    handle.write(json.dumps({key: scalar(value) for key, value in row.items()}, separators=(',', ':'), ensure_ascii=False) + '\n')
                    materialized += 1
    profile['materializedRows'] = materialized
    profile['decodedSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    profile['decodedPath'] = str(target)
(out / 'source_profiles.json').write_text(json.dumps({'version': 'm6-nhl-pyarrow-decoder-1', 'seasonStartYear': year - 1, 'profiles': profiles}, indent=2) + '\n')
print(json.dumps({'seasonStartYear': year - 1, 'profiles': [{key: value[key] for key in ('kind', 'physicalRows', 'materializedRows', 'missingColumns')} for value in profiles]}))
