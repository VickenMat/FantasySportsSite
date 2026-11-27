"""Bounded derived35-key role-quality overlay; base55 partitions stay immutable."""
import collections,json,subprocess
from pathlib import Path
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'data/simulation/role_enrichment';out.mkdir(parents=True,exist_ok=True);groups=collections.defaultdict(list)
for year in range(2016,2027):
 for row in pq.ParquetFile(ROOT/f'data/simulation/historical_v1/MLB/{year}/records.parquet').read().to_pylist():
  if row['roleSelection']=='MISSING_PARTICIPATION_EVIDENCE':groups[row['playerGameKey']].append(row)
path=out/'exact_source_groups.json';path.write_text(json.dumps(list(groups.values()),separators=(',',':')))
subprocess.run(['node','--import','tsx','src/workers/prepare-m6-role-quality.ts',str(path),str(out/'reviewed_manifest.json')],cwd=ROOT,check=True)
manifest=json.loads((out/'reviewed_manifest.json').read_text());report={key:value for key,value in manifest.items() if key!='rows'};report['actors']=[{key:row[key] for key in ['playerGameKey','seasonStartYear','sourcePlayerId','sourceGameId','classification','athleteParticipation','selectedRole']} for row in manifest['rows']];report['scope']='Recorded-role quality only. No claim of actual physical role absence, production role resolution, player DNP or scored zero. Freeland/Kerkering production targets remain withheld.';(ROOT/'reports/m6-mlb-role-quality.json').write_text(json.dumps(report,indent=2)+'\n')
