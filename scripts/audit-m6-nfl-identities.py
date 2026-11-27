"""Measure unresolved identities without guessing athletes from names/teams."""
import hashlib,json,collections
from pathlib import Path
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'data/player_data/nfl_2016_2026_final.parquet';rows=[];at=0
keys=['passing_yards','passing_tds','passing_interceptions','passing_2pt_conversions','rushing_yards','rushing_tds','rushing_2pt_conversions','receiving_yards','receiving_tds','receiving_2pt_conversions','receptions','rushing_first_downs','receiving_first_downs','rushing_fumbles_lost','receiving_fumbles_lost','sack_fumbles_lost']
for batch in pq.ParquetFile(path).iter_batches():
 for r in batch.to_pylist():
  at+=1
  if not r.get('player_id'):rows.append({'sourceRow':at,'gameId':r['game_id'],'season':r['season'],'team':r['team'],'sourceShortName':r.get('player_name'),'displayName':r.get('player_display_name'),'position':r.get('position'),'nonzeroSuppliedFantasyFields':{k:r.get(k) for k in keys if r.get(k) not in [None,0]},'unknownSuppliedFantasyFields':[k for k in keys if r.get(k) is None],'secondaryNativeIdentityFields':[]})
r={'version':'m6-missing-nfl-native-identity-review-1','sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'quarantinedRows':len(rows),'noDisplayNameRows':sum(r['displayName'] is None for r in rows),'noPositionRows':sum(r['position'] is None for r in rows),'shortNameClasses':dict(collections.Counter('MISSING' if r['sourceShortName'] is None else r['sourceShortName'] for r in rows)),'rowsWithAnyNonzeroSuppliedFantasyInput':sum(bool(r['nonzeroSuppliedFantasyFields']) for r in rows),'nativeIdResolutions':0,'noNameOnlyMerge':True,'classification':'Unidentified source rows; four explicitly named Team, one abbreviated name,181unnamed. No independent secondary athlete ID is present. All186remain quarantined, regardless of supplied fantasy inputs.','rows':rows,'productionWrites':0};r['fingerprint']=hashlib.sha256(json.dumps(r,sort_keys=True,separators=(',',':')).encode()).hexdigest();(ROOT/'reports/m6-nfl-identity-review.json').write_text(json.dumps(r,indent=2)+'\n')
