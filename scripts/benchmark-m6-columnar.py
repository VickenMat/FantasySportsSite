"""Measure existing columnar reads and native-key iteration; no transformations."""
import hashlib,json,resource,sys,time
from pathlib import Path
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];base=json.loads((ROOT/'reports/m6-historical-readiness.json').read_text());reports=[]
for source in base['cohorts']:
 path=ROOT/source['partition'];start=time.perf_counter();table=pq.ParquetFile(path).read(columns=['sourcePlayerId','sourceGameId','role']);loaded=time.perf_counter();keys=set()
 for row in table.to_pylist():
  if row['sourcePlayerId'] and row['sourceGameId']:keys.add((row['sourcePlayerId'],row['sourceGameId'],row['role']))
 reports.append({'sport':source['sport'],'year':source['seasonStartYear'],'rows':table.num_rows,'uniqueNativePlayerGameRoles':len(keys),'columnarLoadMs':(loaded-start)*1000,'nativeKeyIterationMs':(time.perf_counter()-loaded)*1000})
result={'version':'m6-columnar-loading-benchmark-1','classification':'DATA_LOADING_BENCHMARK_NOT_SIMULATION','cohorts':reports,'physicalRows':sum(r['rows'] for r in reports),'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024),'productionWrites':0,'transformationSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};(ROOT/'reports/m6-columnar-performance.json').write_text(json.dumps(result,indent=2)+'\n')
