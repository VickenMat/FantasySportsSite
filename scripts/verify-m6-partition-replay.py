"""Read-only semantic and byte-level replay of every prepared partition.
Re-encoding uses identical fixed PyArrow settings in ignored temporary outputs.
Pure tests separately verify role/participation/leakage/V9 transformation semantics.
"""
import hashlib,json,sys
from pathlib import Path
import pyarrow.parquet as pq
import pyarrow as pa
ROOT=Path(__file__).resolve().parents[1]
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def semantic(table):
 h=hashlib.sha256()
 for batch in table.to_batches(max_chunksize=8192):
  for row in batch.to_pylist():h.update((json.dumps(row,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode())
 return h.hexdigest()
base=json.loads((ROOT/'reports/m6-historical-readiness.json').read_text());enriched_path=ROOT/'reports/m6-nhl-enrichment-readiness.json';enriched=json.loads(enriched_path.read_text()) if enriched_path.exists() else None
sources=base['cohorts']+([] if enriched is None else enriched['cohorts']);results=[]
for manifest in sources:
 path=ROOT/manifest['partition'];before=digest(path)
 if before!=manifest['partitionSha256']:raise RuntimeError('Prepared partition changed before replay.')
 for file in base['transformationFiles'] if 'enriched' not in path.name else enriched['transformationFiles']:
  if digest(ROOT/file['path'])!=file['sha256']:raise RuntimeError('Prepared transformation changed since publication.')
 table=pq.ParquetFile(path).read();semantic_before=semantic(table);temp=path.with_suffix('.replay.parquet')
 try:
  original_lists={'missingMask','positions','leakageFlags'} if path.name=='records.parquet' else {'enrichedMissingMask','enrichmentConflictFields','enrichmentAppliedFields','enrichmentProvenanceOnlyFields'}
  schema=pa.schema([pa.field(field.name,pa.list_(pa.string()) if field.name in original_lists else field.type) for field in table.schema])
  reconstructed=pa.Table.from_pylist(table.to_pylist(),schema=schema)
  pq.write_table(reconstructed,temp,compression='zstd',use_dictionary=True,row_group_size=8192,write_statistics=True)
  actual=digest(temp);semantic_after=semantic(pq.ParquetFile(temp).read())
  if before!=actual or semantic_before!=semantic_after:raise RuntimeError(f'Partition replay differs: {path}')
  results.append({'partition':str(path.relative_to(ROOT)),'rows':len(table),'sha256':actual,'semanticSha256':semantic_before,'byteIdentical':True,'semanticIdentical':True})
 finally:temp.unlink(missing_ok=True)
 print(str(path.relative_to(ROOT))+' replay identical',flush=True)
# Dataset identity excludes mutable verification flags/report clocks.
identity={'version':'m6-prepared-partition-bundle-1','sourceInputs':base['inputs'],'transformations':base['transformationFiles'],'enrichmentTransformations':None if enriched is None else enriched['transformationFiles'],'partitions':[{k:r[k] for k in ['partition','rows','sha256','semanticSha256']} for r in results]}
fingerprint=hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest();report={'version':'m6-partition-replay-1','datasetFingerprint':fingerprint,'baseCohorts':len(base['cohorts']),'enrichedCohorts':0 if enriched is None else len(enriched['cohorts']),'physicalBaseRows':base['physicalRows'],'partitions':results,'allByteIdentical':True,'allSemanticIdentical':True,'sourceAndTransformationHashesVerified':True,'developmentWrites':0,'v10Active':False,'replayMethod':'Every Parquet row decoded and canonically hashed before and after fixed-settings re-encoding; frozen transformation hashes checked. No generated timestamps or imputation.'};path=ROOT/'reports/m6-partition-reproducibility.json'
if path.exists():
 old=json.loads(path.read_text())
 if old['baseCohorts']==report['baseCohorts'] and old['enrichedCohorts']==report['enrichedCohorts'] and old['datasetFingerprint']!=fingerprint:raise RuntimeError('Stable dataset bundle fingerprint changed across verification replay.')
path.write_text(json.dumps(report,indent=2)+'\n');print('Stable dataset fingerprint '+fingerprint,flush=True)
