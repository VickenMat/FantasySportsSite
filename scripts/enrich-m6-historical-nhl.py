"""Attach exact frozen NHL overlays through the production V9 evaluator, offline."""
import argparse,collections,hashlib,json,subprocess
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1]
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
transform_paths=['scripts/enrich-m6-historical-nhl.py','src/simulation/preparation/enrichment.ts','src/workers/enrich-historical-simulation-records.ts','src/scoring/engine.ts','src/scoring/ubp-v9.ts']
startup_transformations={path:digest(ROOT/path) for path in transform_paths}
source_report=json.loads((ROOT/'reports/m6-nhl-historical-enrichment.json').read_text())
if source_report['fingerprint']!='2bc5a7082f09a8018706796771f61490b2f426874e5808fc5119072f2f8c11b6':raise RuntimeError('Frozen NHL overlay source report changed.')
source_semantics={k:v for k,v in source_report.items() if k!='fingerprint'}
verified_source_fingerprint=subprocess.check_output(['node','--import','tsx','-e',"const{readFileSync}=require('node:fs');const{fingerprint}=require('./src/ingestion/contracts.ts');const r=JSON.parse(readFileSync('reports/m6-nhl-historical-enrichment.json','utf8'));delete r.fingerprint;process.stdout.write(fingerprint(r));"],cwd=ROOT,text=True)
if verified_source_fingerprint!=source_report['fingerprint']:raise RuntimeError('NHL source report semantic fingerprint invalid.')
parser=argparse.ArgumentParser();parser.add_argument('--verify-reproducibility',action='store_true');args=parser.parse_args();cohorts=[]
for year in range(2016,2027):
 directory=ROOT/f'data/simulation/historical_v1/NHL/{year}';partition=directory/'records.parquet';overlay_path=ROOT/f'data/simulation/nhl_enrichment/{year}/overlay.jsonl';overlay_manifest=overlay_path.with_name('manifest.json')
 if not partition.exists() or not overlay_path.exists() or not overlay_manifest.exists():raise RuntimeError(f'Missing base or frozen overlay {year}')
 overlay_hash=digest(overlay_path);proof=json.loads(overlay_manifest.read_text());declared=proof.get('overlaySha256',proof.get('sha256',proof.get('output',{}).get('sha256')))
 frozen=next(row for row in source_report['seasons'] if row['seasonStartYear']==year)
 if declared!=overlay_hash or frozen['overlaySha256']!=overlay_hash:raise RuntimeError('Frozen overlay hash changed.')
 expected_sources={row['kind']:row['sha256'] for row in source_report['sourceFiles'] if row['seasonStartYear']==year}
 if {row['kind']:row['sha256'] for row in proof['sourceProofs']}!=expected_sources:raise RuntimeError('Local NHL source proof set differs from frozen compact report.')
 for source in proof['sourceFiles']:
  if digest(ROOT/'data/provider_previews/objects'/source['sourceSha256'])!=source['sourceSha256']:raise RuntimeError('Frozen NHL source object changed.')
 overlays={}
 for line in overlay_path.open():
  value=json.loads(line)
  if value['proof']['sourceProofs']!=proof['sourceProofs'] or value['proof']['transformVersion']!=proof['transformVersion']:raise RuntimeError('Overlay per-row source proof differs from manifest.')
  key=(value['sourceGameId'],value['sourcePlayerId'],value['role'])
  if key in overlays:raise RuntimeError('Duplicate overlay source tuple.')
  overlays[key]=value
 rows=pq.ParquetFile(partition).read().to_pylist();input_path=directory/'enrichment-input.jsonl';output_path=directory/'enrichment-output.jsonl';bound=set()
 with input_path.open('w') as f:
  for row in rows:
   key=(row['sourceGameId'],row['sourcePlayerId'],row['role']);overlay=overlays.get(key)
   if row['valid'] and overlay:
    f.write(json.dumps({'row':row,'overlay':overlay},separators=(',',':'),ensure_ascii=False)+'\n');bound.add(key)
 subprocess.run(['node','--import','tsx','src/workers/enrich-historical-simulation-records.ts',str(input_path),str(output_path)],cwd=ROOT,check=True)
 results={r['sourceRow']:r for r in (json.loads(line) for line in output_path.open())};input_path.unlink();output_path.unlink()
 for row in rows:
  result=results.get(row['sourceRow'])
  if result:row.update({key:result[key] for key in ['enrichedStatsJson','enrichedMissingMask','enrichedPointsTenths','enrichmentConflictFields','enrichmentAppliedFields','enrichmentStatus','enrichmentProofJson','enrichmentProvenanceOnlyFields']})
  else:row.update({'enrichedStatsJson':row['statsJson'],'enrichedMissingMask':row['missingMask'],'enrichedPointsTenths':row['baselinePointsTenths'],'enrichmentConflictFields':[],'enrichmentAppliedFields':[],'enrichmentStatus':'NO_EXACT_OVERLAY','enrichmentProvenanceOnlyFields':[]})
 schema=pq.ParquetFile(partition).schema_arrow
 for field in [pa.field('enrichedStatsJson',pa.string()),pa.field('enrichedMissingMask',pa.list_(pa.string())),pa.field('enrichedPointsTenths',pa.int64()),pa.field('enrichmentConflictFields',pa.list_(pa.string())),pa.field('enrichmentAppliedFields',pa.list_(pa.string())),pa.field('enrichmentStatus',pa.string()),pa.field('enrichmentProvenanceOnlyFields',pa.list_(pa.string()))]:schema=schema.append(field)
 target=directory/'enriched-records.parquet';before=digest(target) if target.exists() else None;pq.write_table(pa.Table.from_pylist(rows,schema=schema),target,compression='zstd',use_dictionary=True,row_group_size=8192,write_statistics=True);actual=digest(target)
 if args.verify_reproducibility and before!=actual:raise RuntimeError(f'Nonreproducible enriched partition {year}')
 valid=[r for r in rows if r['valid']];selected=[r for r in valid if r['selectedRole']];players=collections.defaultdict(list)
 for row in selected:players[row['sourcePlayerId']].append(row)
 game_groups=collections.defaultdict(list)
 for r in selected:game_groups[r['canonicalGameKey']].append(r)
 report={'sport':'NHL','seasonStartYear':year,'physicalRows':len(rows),'validRows':len(valid),'selectedRows':len(selected),'exactOverlayMatchedRows':len(results),'overlaySourceKeys':len(overlays),'overlayUnmatchedSourceKeys':len(set(overlays)-bound),'baselineCompleteRows':sum(not r['missingMask'] for r in valid),'enrichedCompleteRows':sum(not r['enrichedMissingMask'] for r in valid),'baselineCompleteSelectedRows':sum(not r['missingMask'] for r in selected),'enrichedCompleteSelectedRows':sum(not r['enrichedMissingMask'] for r in selected),'selectedPlayers':len(players),'baselineCompletePlayers':sum(all(not r['missingMask'] for r in values) for values in players.values()),'enrichedCompletePlayers':sum(all(not r['enrichedMissingMask'] for r in values) for values in players.values()),'missingFieldsBefore':dict(collections.Counter(key for r in valid for key in r['missingMask'])),'missingFieldsAfter':dict(collections.Counter(key for r in valid for key in r['enrichedMissingMask'])),'appliedFields':dict(collections.Counter(key for r in valid for key in r['enrichmentAppliedFields'])),'completePlayerSeasonsBefore':sum(all(not r['missingMask'] for r in values) for values in players.values()),'completePlayerSeasonsAfter':sum(all(not r['enrichedMissingMask'] for r in values) for values in players.values()),'completeGamesBefore':sum(all(not r['missingMask'] for r in values) for values in game_groups.values()),'completeGamesAfter':sum(all(not r['enrichedMissingMask'] for r in values) for values in game_groups.values()),'gameCompletenessDenominator':len({r['canonicalGameKey'] for r in selected}),'completeGameMetricScope':'All materialized selected rows, not complete professional box inventory','fieldCoverage':{field:{'denominator':sum(r['role']==role for r in valid),'before':sum(r['role']==role and json.loads(r['statsJson']).get(field) is not None for r in valid),'after':sum(r['role']==role and json.loads(r['enrichedStatsJson']).get(field) is not None for r in valid)} for field,role in [('faceoff_wins','SKATER'),('shorthanded_points_bonus','SKATER'),('goalie_win','GOALIE'),('shutout','GOALIE')]},'sourceConflictRows':sum(bool(r['enrichmentConflictFields']) for r in valid),'sourceConflictFields':dict(collections.Counter(key for r in valid for key in r['enrichmentConflictFields'])),'baselineSourcePartition':str(partition.relative_to(ROOT)),'baselinePartitionSha256':digest(partition),'overlaySha256':overlay_hash,'overlayManifestSha256':digest(overlay_manifest),'partition':str(target.relative_to(ROOT)),'partitionSha256':actual,'partitionBytes':target.stat().st_size,'historicalKnownAtRows':0,'reproducibilityVerified':args.verify_reproducibility,'currentEligibilityChanges':0,'developmentWrites':0,'readiness':'INCOMPLETE' if year==2026 else 'SUITABLE_ONLY_FOR_SENSITIVITY_ANALYSIS' if all(not r['enrichedMissingMask'] for r in selected) else 'BLOCKED_BY_UNAVAILABLE_SOURCE_EVIDENCE','readinessReason':'Retrospective statistics only. Missing historical pregame/publication chronology never becomes known-at; remaining stat conflicts stay withheld.'}
 (directory/'enrichment-manifest.json').write_text(json.dumps(report,indent=2)+'\n');cohorts.append(report);print(f'NHL/{year}: {report["baselineCompleteRows"]} -> {report["enrichedCompleteRows"]} complete rows; conflicts {report["sourceConflictRows"]}',flush=True)
if any(digest(ROOT/path)!=value for path,value in startup_transformations.items()):raise RuntimeError('Enrichment code changed during execution; rerun frozen pipeline.')
result={'version':'m6-nhl-overlay-reconciliation-1','cohorts':cohorts,'v10Active':False,'developmentWrites':0,'scorer':'src/scoring/engine.ts unchanged active56UBPV9weights','transformationFiles':[{ 'path':p,'sha256':digest(ROOT/p)} for p in ['scripts/enrich-m6-historical-nhl.py','src/simulation/preparation/enrichment.ts','src/workers/enrich-historical-simulation-records.ts','src/scoring/engine.ts','src/scoring/ubp-v9.ts']]};result['datasetFingerprint']=hashlib.sha256(json.dumps(result,sort_keys=True,separators=(',',':')).encode()).hexdigest();(ROOT/'reports/m6-nhl-enrichment-readiness.json').write_text(json.dumps(result,indent=2)+'\n');print('Enriched dataset fingerprint '+result['datasetFingerprint'],flush=True)
