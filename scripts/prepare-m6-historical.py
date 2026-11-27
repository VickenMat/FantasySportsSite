"""Offline immutable Parquet -> existing TypeScript V9 normalizer -> derived Parquet.
No network, PostgreSQL import, optimizer or inferred historical knowledge times.
"""
import argparse,collections,csv,hashlib,json,math,subprocess,sys
from pathlib import Path
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1]
VERSION='m6-historical-preparation-1'
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
def text(value):
 if value is None:return ''
 if isinstance(value,float):return str(int(value)) if math.isfinite(value) and value.is_integer() else str(value) if math.isfinite(value) else ''
 if isinstance(value,(dict,list)):return canonical(value)
 return str(value)
def ident(value):return text(value).removesuffix('.0')
parser=argparse.ArgumentParser();parser.add_argument('--sports',nargs='+',default=['NFL','MLB','NBA','NHL']);parser.add_argument('--verify-reproducibility',action='store_true');args=parser.parse_args()
out=ROOT/'data/simulation/historical_v1';out.mkdir(parents=True,exist_ok=True)
subprocess.run(['git','check-ignore',str(out/'check.parquet')],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
audit=json.loads((ROOT/'reports/m2-5-analysis.json').read_text());preservation=json.loads((ROOT/'reports/m5-accelerated-preservation.json').read_text())
transformation_paths=['scripts/prepare-m6-historical.py','src/simulation/preparation/records.ts','src/workers/prepare-historical-simulation-records.ts','src/imports/normalize.ts','src/scoring/engine.ts','src/scoring/participation.ts','src/scoring/ubp-v9.ts','src/simulation/preparation/contracts.ts']
startup_transformations={path:digest(ROOT/path) for path in transformation_paths}
inputs=[]
for proof in preservation['artifacts'] if 'artifacts' in preservation else preservation['files']:
 path=ROOT/proof['path'];actual=digest(path)
 if actual!=proof['sha256']:raise RuntimeError('Immutable source changed: '+str(path))
 inputs.append({'path':proof['path'],'sha256':actual,'provider':'ACCEPTED_V5' if '/schedule_data/' in proof['path'] else 'RECOVERED_IMMUTABLE' if '/raw/recovered/' in proof['path'] else 'v9-historical','license':'UNKNOWN_OR_PREVIOUSLY_ACCEPTED_SOURCE; not inferred from possession'})
# Source-derived position evidence is separately pinned, never silently elevated to dated eligibility.
mlb_path=ROOT/'data/position_enrichment/mlb_recorded_threshold_candidates.json';nba_path=ROOT/'data/position_enrichment/nba_historical_estimates.json'
mlb_data=json.loads(mlb_path.read_text());nba_data=json.loads(nba_path.read_text())
recovery=json.loads((ROOT/'reports/m5-recovered-data-audit.json').read_text());recovered={row['file']:row['sha256'] for row in recovery['sources']}
if mlb_data['sourceFingerprint']!=recovered['mlb_positions_repaired.csv'] or nba_data['sourceFingerprint']!=recovered['nba_positions_repaired.csv']:raise RuntimeError('Position provenance differs from recovered immutable source.')
for path in [mlb_path,nba_path]:inputs.append({'path':str(path.relative_to(ROOT)),'sha256':digest(path),'provider':'DERIVED_RECORDED_POSITION_EVIDENCE','license':'INHERITED_SOURCE_PROVENANCE_NOT_NEW_PERMISSION'})
mlb_positions={(r['playerExternalId'],r['seasonStartYear']):r for r in mlb_data['rows']};nba_positions={(r['playerExternalId'],r['seasonStartYear']):r for r in nba_data['rows']}
nba_roster=collections.defaultdict(list)
with (ROOT/'data/raw/recovered/_nba_player_positions_2016_2026.csv').open() as source:
 for line,row in enumerate(csv.DictReader(source),2):nba_roster[(ident(row['player_id']),int(row['season'][:4]),ident(row['team_id']))].append({'sourceLine':line,**row})
nba_embedded={}
with (ROOT/'data/raw/recovered/nba_2016-2027_final.csv').open() as source:
 for line,row in enumerate(csv.DictReader(source),2):
  key=(row['GAME_ID'],ident(row['PLAYER_ID']),ident(row['TEAM_ID']))
  value={'sourceLine':line,'position':row.get('position',''),'sourceFingerprint':recovered['nba_2016-2027_final.csv'],'knownAt':None}
  if key in nba_embedded and nba_embedded[key]['position']!=value['position']:raise RuntimeError('Conflicting recovered embedded NBA positions.')
  nba_embedded[key]=value
cross=pq.read_table(ROOT/'data/schedule_data/game_id_crosswalk.parquet').to_pylist();schedule=pq.read_table(ROOT/'data/schedule_data/game_schedules.parquet').to_pylist();crosswalk={};schedule_by={}
for r in cross:
 key=(r['sport'],str(r['archive_game_id']));value=str(r['game_id'])
 if key in crosswalk and crosswalk[key]!=value:raise RuntimeError('Conflicting accepted V5 crosswalk.')
 crosswalk[key]=value
for r in schedule:schedule_by[(r['sport'],str(r['game_id']))]=r
nfl_identity_rows=[]
if 'NFL' in args.sports:
 nfl_source=next(r for r in audit['reports'] if r['sport']=='NFL');nfl_table=pq.read_table(ROOT/'data/player_data'/nfl_source['source']['path'],columns=['player_id','player_name','player_display_name','season','game_id','team','headshot_url'])
 for line,row in enumerate(nfl_table.to_pylist(),1):
  if not row['player_id']:nfl_identity_rows.append({'sourceRow':line,'sourceGameId':row['game_id'],'seasonStartYear':row['season'],'recordedName':row['player_display_name'] or row['player_name'],'recordedTeam':row['team'],'explicitGsisPlayerId':None,'headshotUrl':row['headshot_url'],'status':'QUARANTINED_NO_EXPLICIT_PLAYER_ID','reason':'Other retained fields provide names/team/media URL but no independently verified GSIS identity; names alone cannot resolve.'})
 (ROOT/'reports/m6-nfl-unresolved-identities.json').write_text(json.dumps({'sourceSha256':nfl_source['source']['sha256'],'sourceRows':len(nfl_table),'missingIdRows':len(nfl_identity_rows),'resolvedByExplicitAlternativeId':0,'quarantined':nfl_identity_rows,'nameOnlyMerges':0,'developmentWrites':0},indent=2)+'\n')
cohorts=[]
strings=['sport','sourceRowFingerprint','sourcePlayerId','sourceGameId','canonicalPlayerKey','canonicalGameKey','playerGameKey','role','teamId','gameDate','phase','quarantineReason','statsJson','participation','participationReason','positionClass','roleSelection','roleEvidenceJson','positionProvenanceJson','historicalKnownAt','scheduledStartsAt','scheduleStatus','scheduleMatch','duplicateStatus','enrichmentProofJson']
fields=[pa.field(k,pa.string()) for k in strings]+[pa.field(k,pa.int64()) for k in ['seasonStartYear','sourceRow','week','baselinePointsTenths']]+[pa.field(k,pa.bool_()) for k in ['valid','selectedRole']]+[pa.field(k,pa.list_(pa.string())) for k in ['missingMask','positions','leakageFlags']]
schema=pa.schema(fields)
def positions(sport,row,year):
 player=ident(row.get('PLAYER_ID',row.get('player_id')))
 if sport=='MLB':
  current=mlb_positions.get((player,year));prior=mlb_positions.get((player,year-1));codes=current['positions'] if current and current['status']=='RECORDED_THRESHOLD_SUPPORTED' else []
  return {'positions':codes,'classification':'RECORDED_THRESHOLD_RETROSPECTIVE' if codes else 'UNKNOWN','provenance':{'currentSeason':current,'priorSeasonCarry':prior,'knownAt':None,'thresholdReachedAt':None,'openingDayGrant':False,'currentEligibility':False}}
 if sport=='NBA':
  candidates=nba_positions.get((player,year),{}).get('records',[]);team=ident(row.get('TEAM_ID'));matched=[r for r in candidates if ident(r.get('teamId'))==team]
  alternatives={tuple(r['positions']) for r in matched if r['quality']=='ESTIMATED' and r['positions']}
  usable=len(alternatives)==1 and not any(r['quality']=='MANUAL_REVIEW' for r in matched)
  original=nba_roster.get((player,year,team),[]);original_codes={r['position'].strip() for r in original if r.get('position','').strip() and r.get('position_source')=='NBA CommonTeamRoster historical roster'}
  return {'positions':list(next(iter(alternatives))) if usable else [],'classification':'HISTORICAL_ESTIMATED' if usable else 'UNKNOWN','sourcePosition':next(iter(original_codes)) if len(original_codes)==1 else None,'provenance':{'originalRoster':original,'embeddedRecovered':nba_embedded.get((str(row['GAME_ID']),player,team)),'estimatedAlternatives':matched,'knownAt':None,'effectiveAt':None,'conflict':len(alternatives)>1 or len(original_codes)>1,'strictEligibility':False,'sourceFingerprint':nba_data['sourceFingerprint']}}
 return None
for sport in args.sports:
 report=next(r for r in audit['reports'] if r['sport']==sport);path=ROOT/'data/player_data'/report['source']['path'];source_sha=digest(path)
 if source_sha!=report['source']['sha256']:raise RuntimeError('Accepted archive changed.')
 season_col='SEASON_YEAR' if sport=='NBA' else 'season';file=pq.ParquetFile(path)
 # Season streaming keeps memory bounded to a single sport-season, and fixed sort
 # makes MLB paired roles contiguous without a 1.7m-row operational DB import.
 for year in range(2016,2027):
  parts=[];offset=0
  for batch in file.iter_batches(batch_size=8192):
   table=pa.Table.from_batches([batch]);values=[text(x)[:4]==str(year) for x in table[season_col].to_pylist()]
   if any(values):
    table=table.append_column('__sourceRow',pa.array(range(offset+1,offset+len(table)+1),type=pa.int64()));parts.append(table.filter(pa.array(values)))
   offset+=len(table)
  if not parts:raise RuntimeError(f'Missing expected cohort {sport}/{year}')
  table=pa.concat_tables(parts);keys=['GAME_ID','PLAYER_ID'] if sport=='NBA' else ['game_id','player_id'];sort=[(key,'ascending') for key in keys]+[('__sourceRow','ascending')];table=table.sort_by(sort)
  directory=out/sport/str(year);directory.mkdir(parents=True,exist_ok=True);raw_path=directory/'normalizer-input.jsonl';normalized=directory/'normalized.jsonl'
  with raw_path.open('w') as f:
   for row in table.to_pylist():
    source_row=row.pop('__sourceRow');raw={key:text(value) for key,value in row.items()};context=positions(sport,row,year)
    f.write(canonical({'raw':raw,'sourceRow':source_row,'position':context})+'\n')
  del table,parts
  subprocess.run(['node','--import','tsx','src/workers/prepare-historical-simulation-records.ts',sport,str(raw_path),str(normalized)],cwd=ROOT,check=True)
  records=[json.loads(line) for line in normalized.open()];raw_path.unlink();normalized.unlink()
  overlays={};overlay_path=ROOT/f'data/simulation/nhl_enrichment/{year}/overlay.jsonl';overlay_fingerprint=None
  if sport=='NHL' and overlay_path.exists():
   overlay_fingerprint=digest(overlay_path)
   for line in overlay_path.open():
    r=json.loads(line);key=(str(r['sourceGameId']),str(r['sourcePlayerId']),r['role'])
    if key in overlays:raise RuntimeError('Duplicate NHL overlay key.')
    overlays[key]=r
  # Preserve every physical row, but never silently count duplicate/conflicting
  # canonical role records twice. Exact duplicate representative is deterministic.
  grouped=collections.defaultdict(list)
  for r in records:
   if r['valid']:grouped[(r['playerGameKey'],r['role'])].append(r)
  for group in grouped.values():
   if len(group)>1:
    signatures={canonical([r['statsJson'],r['teamId'],r['participation'],r['roleEvidenceJson']]) for r in group}
    for index,r in enumerate(group):
     r['duplicateStatus']='EXACT_CANONICAL_DUPLICATE' if len(signatures)==1 else 'CONFLICTING_CANONICAL_ROLE'
     if len(signatures)>1:r['valid']=False;r['quarantineReason']='CONFLICTING_CANONICAL_ROLE';r['selectedRole']=False
     elif index:r['selectedRole']=False
  for r in records:
   r.setdefault('duplicateStatus','UNIQUE');r['enrichmentProofJson']=None
   game=crosswalk.get((sport,r['sourceGameId']));scheduled=schedule_by.get((sport,game)) if game else None
   r['scheduleMatch']='EXACT_ACCEPTED_V5_CROSSWALK' if scheduled else 'NO_ACCEPTED_V5_CROSSWALK';r['scheduledStartsAt']=scheduled['start_time_utc'].isoformat() if scheduled and scheduled['start_time_utc'] else None;r['scheduleStatus']=str(scheduled['status']) if scheduled else None
   if scheduled:r['canonicalGameKey']=str(scheduled['game_key'])
   # Exact overlay is preserved separately; TS evaluator performs any enrichment
   # re-scoring. No second Python scoring engine or silent baseline replacement.
   overlay=overlays.get((r['sourceGameId'],r['sourcePlayerId'],r['role']))
   if overlay:r['enrichmentProofJson']=canonical(overlay)
  partition=directory/'records.parquet';old=digest(partition) if partition.exists() else None
  pq.write_table(pa.Table.from_pylist(records,schema=schema),partition,compression='zstd',use_dictionary=True,row_group_size=8192,write_statistics=True)
  actual=digest(partition)
  if args.verify_reproducibility and old!=actual:raise RuntimeError(f'Partition fingerprint changed on deterministic replay {sport}/{year}: {old} -> {actual}')
  valid=[r for r in records if r['valid']];selected=[r for r in valid if r['selectedRole']];players={r['sourcePlayerId'] for r in valid};games={r['canonicalGameKey'] for r in valid};matched={r['canonicalGameKey'] for r in valid if r['scheduleMatch']=='EXACT_ACCEPTED_V5_CROSSWALK'}
  missing=collections.Counter(key for r in valid for key in r['missingMask']);player_rows=collections.defaultdict(list);game_rows=collections.defaultdict(list)
  for r in selected:player_rows[r['sourcePlayerId']].append(r);game_rows[r['canonicalGameKey']].append(r)
  role_pairs=collections.defaultdict(list)
  for r in valid:role_pairs[r['playerGameKey']].append(r)
  pairs=[values for values in role_pairs.values() if {r['role'] for r in values}>={'HITTER','PITCHER'}]
  prior=next(s for s in report['seasons'] if s['season']==year)
  result={'sport':sport,'seasonStartYear':year,'physicalRows':len(records),'validRows':len(valid),'quarantinedRows':len(records)-len(valid),'uniquePlayers':len(players),'uniqueCanonicalGames':len(matched),'uniquePreparedGameKeys':len(games),'uniqueSourceGames':len({r['sourceGameId'] for r in valid}),'matchedGames':len(matched),'expectedGames':None,'expectedGamesReason':'Accepted V5 independentlyVerified=false; observed calendar is not an independently verified total.','observedV5Games':sum(1 for r in schedule if r['sport']==sport and int(r['season'])==year),'completeStatRows':sum(not r['missingMask'] for r in valid),'selectedScoringRows':len(selected),'selectedCompleteScoringRows':sum(not r['missingMask'] for r in selected),'completePlayers':sum(all(not r['missingMask'] for r in values) for values in player_rows.values()),'completePlayerSeasons':sum(all(not r['missingMask'] for r in values) for values in player_rows.values()),'completeGames':sum(all(not r['missingMask'] for r in values) for values in game_rows.values()),'completeGameMetricScope':'All materialized selected rows complete, not a complete-final-box or complete-professional-player-inventory claim','playerCompletenessDenominator':len(player_rows),'gameCompletenessDenominator':len(game_rows),'positionRows':sum(bool(r['positions']) for r in valid),'strictDatedPositionRows':0,'positionClasses':dict(collections.Counter(r['positionClass'] for r in valid)),'participation':dict(collections.Counter(r['participation'] for r in valid)),'roleSelectionRows':dict(collections.Counter(r['roleSelection'] for r in valid)),'pairedRoleKeys':len(pairs),'pairedRoleClassification':dict(collections.Counter(values[0]['roleSelection'] for values in pairs)),'explicitZeroBattingPlaceholderRows':sum('rolePlaceholder' in json.loads(row['roleEvidenceJson']) for row in valid),'missingRequiredV9Inputs':dict(sorted(missing.items())),'duplicates':sum(r['duplicateStatus']!='UNIQUE' for r in records),'sourceConflicts':sum(r['duplicateStatus']=='CONFLICTING_CANONICAL_ROLE' for r in records),'quarantineReasons':dict(collections.Counter(r['quarantineReason'] for r in records if r['quarantineReason'])),'priorCoverageClassification':prior['coverage'],'priorCoverageReason':prior['coverageReason'],'seasonCompletenessIndependentlyVerified':False,'partialCurrentSeason':year==2026 and sport!='MLB','seasonExtentClassification':'ONGOING_PARTIAL' if year==2026 and sport!='MLB' else 'UNVERIFIED_PROFESSIONAL_SEASON_COMPLETENESS','unusualScheduleStructure':('COVID_SUSPENSION_OR_SHORTENED_SEASON' if (sport in ['NBA','NHL'] and year in [2019,2020]) or sport=='MLB' and year==2020 else 'NFL_16_TO_17_GAME_STRUCTURE' if sport=='NFL' else None),'historicalKnownAtRows':0,'leakageFlags':dict(collections.Counter(flag for r in valid for flag in r['leakageFlags'])),'readiness':'INCOMPLETE' if year==2026 and sport!='MLB' else 'BLOCKED_BY_UNAVAILABLE_SOURCE_EVIDENCE' if sport=='NHL' and missing else 'SUITABLE_ONLY_FOR_SENSITIVITY_ANALYSIS','readinessReason':'No historical publication/availability/discovery chronology; no automatic V10 dataset selection. Missing required statistics and position quality remain separate gates.','overlayRowsLinked':sum(r['enrichmentProofJson'] is not None for r in records),'overlayFingerprint':overlay_fingerprint,'partition':str(partition.relative_to(ROOT)),'partitionSha256':actual,'partitionBytes':partition.stat().st_size,'reproducibilityVerified':args.verify_reproducibility,'transformationFingerprints':startup_transformations}
  (directory/'manifest.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n');cohorts.append(result)
  print(f"{sport}/{year}: {len(records)} rows, {len(valid)} valid, {len(players)} players, {result['readiness']}",flush=True)
# Merge independently processed sports without inventing absent cohort results.
if any(digest(ROOT/path)!=value for path,value in startup_transformations.items()):raise RuntimeError('Preparation code changed during execution; report publication refused. Rerun frozen pipeline.')
report_path=ROOT/'reports/m6-historical-readiness.json';previous=json.loads(report_path.read_text()) if report_path.exists() else {'cohorts':[]};combined=[r for r in previous['cohorts'] if r['sport'] not in args.sports]+cohorts;combined.sort(key=lambda r:(['NFL','MLB','NBA','NHL'].index(r['sport']),r['seasonStartYear']))
code=['scripts/prepare-m6-historical.py','src/simulation/preparation/records.ts','src/workers/prepare-historical-simulation-records.ts','src/imports/normalize.ts','src/scoring/engine.ts','src/scoring/participation.ts','src/scoring/ubp-v9.ts','src/simulation/preparation/contracts.ts'];manifest={'version':VERSION,'v10Active':False,'optimizationRun':False,'developmentWrites':0,'derivedRoot':str(out.relative_to(ROOT)),'pyarrowVersion':pa.__version__,'transformationFiles':[{ 'path':p,'sha256':digest(ROOT/p)} for p in code],'inputs':inputs,'cohorts':combined,'cohortCount':len(combined),'physicalRows':sum(r['physicalRows'] for r in combined),'methodologySelection':'PENDING_REVIEW; no training/validation allocation selected','limitations':['Namespaced source identities are not operational UUIDs; all canonical game mappings are exact accepted V5 crosswalks.','No archived source publication, pregame availability or discovery chronology has been fabricated.','NBA historical estimates are sensitivity-only; MLB season totals are retrospective with unknown threshold date.','Missing athlete/game records are never inserted as zero scores.','Canonical output completeness does not establish professional-season completeness.']};manifest['datasetFingerprint']=hashlib.sha256(canonical({k:v for k,v in manifest.items() if k!='datasetFingerprint'}).encode()).hexdigest();assert all(digest(ROOT/path)==value for path,value in startup_transformations.items()),'Transformation changed before report publication'
report_path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');print('Dataset fingerprint '+manifest['datasetFingerprint'],flush=True)
