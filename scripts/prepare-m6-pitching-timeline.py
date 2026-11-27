"""Offline exact dated pitching appearances; no aggregate/team addition or DB."""
import collections,hashlib,json,subprocess
from pathlib import Path
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'data/simulation/position_enrichment';out.mkdir(parents=True,exist_ok=True)
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
base=json.loads((ROOT/'reports/m6-historical-readiness.json').read_text());source_paths=['data/player_data/mlb_2016_2026_final.parquet','data/schedule_data/game_schedules.parquet','data/schedule_data/game_id_crosswalk.parquet'];proofs=[r for r in base['inputs'] if r['path'] in source_paths]
if len(proofs)!=3:raise RuntimeError('Exact MLB+V5 source proofs missing.')
for source in proofs:
 if digest(ROOT/source['path'])!=source['sha256']:raise RuntimeError('Immutable pitching source changed.')
schedule={(r['sport'],str(r['game_id'])):r for r in pq.read_table(ROOT/'data/schedule_data/game_schedules.parquet').to_pylist()};cross={(r['sport'],str(r['archive_game_id'])):str(r['game_id']) for r in pq.read_table(ROOT/'data/schedule_data/game_id_crosswalk.parquet').to_pylist()};evidence=[]
for cohort in base['cohorts']:
 if cohort['sport']!='MLB':continue
 path=ROOT/cohort['partition']
 if digest(path)!=cohort['partitionSha256']:raise RuntimeError('Prepared MLB source partition changed.')
 for row in pq.ParquetFile(path).read(columns=['valid','role','sourcePlayerId','sourceGameId','seasonStartYear','gameDate','sourceRow','sourceRowFingerprint','roleEvidenceJson','participation','teamId']).to_pylist():
  if not row['valid'] or row['role']!='PITCHER':continue
  stats=json.loads(row['roleEvidenceJson']);game=cross.get(('MLB',row['sourceGameId']));v5=schedule.get(('MLB',game))
  def whole(value):return int(value) if value is not None and str(value).isdigit() else None
  evidence.append({key:row[key] for key in ['sourcePlayerId','sourceGameId','seasonStartYear','gameDate','sourceRow','sourceRowFingerprint','participation']}|{'sourceTeamId':row['teamId'],'gamesStarted':whole(stats['gamesStarted']),'gamesPitched':whole(stats['gamesPitched']),'acceptedPhase':'REGULAR' if v5 and v5['game_type']=='regular' else None})
input_path=out/'pitching_appearance_evidence.json';input_path.write_text(json.dumps({'rows':evidence,'sourceProofs':proofs},separators=(',',':')))
subprocess.run(['node','--import','tsx','src/workers/prepare-m6-pitching-timeline.ts',str(input_path),str(out/'pitching_day_thresholds.json')],cwd=ROOT,check=True)
manifest=json.loads((out/'pitching_day_thresholds.json').read_text());cohorts=[]
for year in range(2016,2027):
 rows=[row for row in manifest['thresholds'] if row['seasonStartYear']==year];cohorts.append({'seasonStartYear':year,'uniquePlayers':len({row['sourcePlayerId'] for row in rows}),'thresholds':len(rows),'SP':sum(row['position']=='SP' for row in rows),'RP':sum(row['position']=='RP' for row in rows),'P':sum(row['position']=='P' for row in rows),'firstThresholdDate':min([row['thresholdReachedOn'] for row in rows],default=None),'lastThresholdDate':max([row['thresholdReachedOn'] for row in rows],default=None),'strictEligiblePlayers':0})
report={key:value for key,value in manifest.items() if key not in ['thresholds','withheld']};report['cohorts']=cohorts;report['withheldReasons']=dict(collections.Counter(row['reason'] for row in manifest['withheld']));report['sourceAppearanceRows']=len(evidence);report['scope']='Historical DAY threshold evidence only, no prior-information eligibility or production grants. GenericP never impliesSP/RP; current+following-season candidates retain null known-at. Fielding/DH dates remain unknown.';(ROOT/'reports/m6-pitching-position-timeline.json').write_text(json.dumps(report,indent=2)+'\n')
