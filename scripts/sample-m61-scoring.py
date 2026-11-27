"""Select fixed native-key historical parity samples, excluding held-out2025."""
import json,collections
from pathlib import Path
import pyarrow.parquet as pq
R=Path(__file__).resolve().parents[1];base=json.loads((R/'reports/m6-historical-readiness.json').read_text());samples=[]
for c in base['cohorts']:
 if c['seasonStartYear'] not in [2022,2023]:continue
 path=R/c['partition'];path=path.with_name('enriched-records.parquet') if c['sport']=='NHL' else path
 groups=collections.defaultdict(list)
 for row in pq.ParquetFile(path).read().to_pylist():
  missing=row.get('enrichedMissingMask',row['missingMask']);points=row.get('enrichedPointsTenths',row['baselinePointsTenths'])
  if row['valid'] and row['selectedRole'] and row['participation']=='PLAYED' and not missing and points is not None and not row.get('enrichmentConflictFields'):
   groups[row['role']].append(row)
 for role,rows in groups.items():
  ordered=sorted(rows,key=lambda r:(r['sourceGameId'],r['sourcePlayerId']));chosen=ordered[:8]+sorted(rows,key=lambda r:r.get('enrichedPointsTenths',r['baselinePointsTenths']))[:2]
  for row in chosen:samples.append({'sport':row['sport'],'year':row['seasonStartYear'],'nativePlayer':row['sourcePlayerId'],'nativeGame':row['sourceGameId'],'role':role,'stats':json.loads(row.get('enrichedStatsJson',row['statsJson'])),'teEligible':'TE' in row['positions'],'expectedTenths':row.get('enrichedPointsTenths',row['baselinePointsTenths'])})
p=R/'data/simulation/approved_model_v1/scoring-parity-samples.json';p.write_text(json.dumps(samples))
