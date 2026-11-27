"""Mandatory source-vector quarantine gate; preserve frozen55 numerical artifacts."""
import argparse,collections,hashlib,json,subprocess
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1]
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def canon(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
parser=argparse.ArgumentParser();parser.add_argument('--verify-existing',action='store_true');args=parser.parse_args()
paths=['scripts/prepare-m6-scoring-package.py','src/simulation/preparation/scoring-readiness.ts','src/workers/prepare-m6-scoring-gates.ts'];startup={path:digest(ROOT/path) for path in paths}
source_path=ROOT/'reports/m6-nhl-full-box-corroboration.json';source=json.loads(source_path.read_text());source_fp=source.pop('fingerprint');expected='e24c395ea12cb73c627156a1fcc9fd4494c9ca5a294f7adbdbb238154a38b43b'
if source_fp!=expected or hashlib.sha256(canon(source).encode()).hexdigest()!=source_fp:raise RuntimeError('Frozen full-vector corroboration report differs.')
if digest(ROOT/'scripts/audit-m6-nhl-full-box.py')!=source['transformationSha256']:raise RuntimeError('Frozen full-vector audit transformation changed.')
enriched_path=ROOT/'reports/m6-nhl-enrichment-readiness.json';enriched=json.loads(enriched_path.read_text());replay_path=ROOT/'reports/m6-partition-reproducibility.json';replay=json.loads(replay_path.read_text());base_path=ROOT/'reports/m6-historical-readiness.json';base=json.loads(base_path.read_text())
if replay['datasetFingerprint']!='34dcac0fa467824b91879c115342e14338ff1b6676c337ebf1a63a6e40675749' or not replay['allByteIdentical'] or not replay['allSemanticIdentical']:raise RuntimeError('Frozen55-partition replay parent is missing.')
archive_proof=next(row for row in base['inputs'] if row['path']=='data/player_data/nhl_2016_2027_final.parquet')
if source['archiveSha256']!=archive_proof['sha256'] or digest(ROOT/archive_proof['path'])!=archive_proof['sha256']:raise RuntimeError('Full-vector audit archive binding differs.')
fields=[pa.field(key,pa.string()) for key in ['sport','sourcePlayerId','sourceGameId','role','playerGameKey','sourceComparisonStatus','participation']]+[pa.field(key,pa.int64()) for key in ['seasonStartYear','sourceRow','gatedV9PointsTenths']]+[pa.field(key,pa.bool_()) for key in ['inputComplete','fullKnownBaseVectorAgreement','retrospectiveScoringEligible','strictSimulationEligible','selectedRole']]+[pa.field(key,pa.list_(pa.string())) for key in ['withholdReasons','conflictFields']];schema=pa.schema(fields);cohorts=[]
for year in range(2016,2027):
 frozen=next(row for row in source['seasons'] if row['seasonStartYear']==year);comparison=ROOT/frozen['comparisonPath']
 if digest(comparison)!=frozen['comparisonSha256']:raise RuntimeError('Frozen full-vector comparison bytes changed.')
 for proof in frozen['sourceProofs']:
  if digest(ROOT/'data/provider_previews/objects'/proof['sha256'])!=proof['sha256']:raise RuntimeError('Full-vector native source box changed.')
 audit={}
 for line in comparison.open():
  row=json.loads(line)
  if row['archiveSourceRow'] in audit:raise RuntimeError('Duplicate full-vector physical source row.')
  audit[row['archiveSourceRow']]=row
 parent=next(row for row in enriched['cohorts'] if row['seasonStartYear']==year);partition=ROOT/parent['partition']
 if digest(partition)!=parent['partitionSha256']:raise RuntimeError('Frozen enriched partition changed.')
 rows=pq.ParquetFile(partition).read().to_pylist();directory=ROOT/f'data/simulation/scoring_gates/NHL/{year}';directory.mkdir(parents=True,exist_ok=True);input_path=directory/'gate-input.jsonl';output_path=directory/'gate-output.jsonl';paired={}
 with input_path.open('w') as target:
  for row in rows:
   proof=audit.get(row['sourceRow'])
   if proof is None or (proof['sport'],proof['seasonStartYear'],proof['sourceGameId'],proof['sourcePlayerId'],proof['role'])!=(row['sport'],row['seasonStartYear'],row['sourceGameId'],row['sourcePlayerId'],row['role']):raise RuntimeError('Full-vector/partition exact source tuple differs.')
   if proof['archiveSha256']!=source['archiveSha256'] or proof['sourceProofs']!=frozen['sourceProofs']:raise RuntimeError('Per-row corroboration proof differs.')
   stats=json.loads(row['statsJson']);required={'goals','assists','sog','hits','blockedShots'} if row['role']=='SKATER' else {'saves','goalsAgainst'}
   if {entry['field'] for entry in proof['comparedV9Fields']}!=required:raise RuntimeError('Full known weighted base-vector coverage differs.')
   for field in proof['comparedV9Fields']:
    if stats[field['field']]!=field['archiveValue']:raise RuntimeError('Source-vector audit no longer describes original archive input.')
   conflicts=[entry['field'] for entry in proof['conflicts']]+(['TEAM_IDENTITY_CONFLICT'] if proof['teamConflict'] else [])
   if bool(conflicts)!=(proof['comparisonStatus']=='CONFLICT'):raise RuntimeError('Full-vector quarantine classification differs from explicit conflicts.')
   key={field:row[field] for field in ['sport','seasonStartYear','sourceRow','sourcePlayerId','sourceGameId','role','playerGameKey']};payload={'key':key,'gateInput':{'valid':row['valid'],'missingRequiredInputs':row['enrichedMissingMask'],'selectedRole':row['selectedRole'],'participation':row['participation'],'sourceComparisonStatus':proof['comparisonStatus']},'conflictFields':conflicts,'enrichedV9PointsTenths':row['enrichedPointsTenths']};target.write(canon(payload)+'\n');paired[row['sourceRow']]=(row,proof)
 if len(audit)!=len(paired):raise RuntimeError('Full-vector source row denominator differs.')
 subprocess.run(['node','--import','tsx','src/workers/prepare-m6-scoring-gates.ts',str(input_path),str(output_path)],cwd=ROOT,check=True)
 gates=[json.loads(line) for line in output_path.open()];input_path.unlink();output_path.unlink();target=directory/'scoring-gate.parquet';temporary=directory/'scoring-gate.pending.parquet'
 pq.write_table(pa.Table.from_pylist(gates,schema=schema),temporary,compression='zstd',use_dictionary=True,row_group_size=8192,write_statistics=True);actual=digest(temporary)
 if args.verify_existing:
  if not target.exists() or digest(target)!=actual:raise RuntimeError('Existing source-vector scoring gate changed on exact replay.')
  temporary.unlink()
 else:temporary.replace(target)
 conflict=[gate for gate in gates if gate['sourceComparisonStatus']=='CONFLICT']
 if any(gate['retrospectiveScoringEligible'] or gate['gatedV9PointsTenths'] is not None for gate in conflict):raise RuntimeError('A known source-vector conflict escaped quarantine.')
 players=collections.defaultdict(list);games=collections.defaultdict(list);position_groups=collections.defaultdict(list)
 for gate in gates:
  row,_=paired[gate['sourceRow']]
  if row['selectedRole']:players[row['sourcePlayerId']].append(gate);games[row['canonicalGameKey']].append(gate)
  for code in row['positions'] or ['UNKNOWN']:position_groups[code].append(gate)
 report={'sport':'NHL','seasonStartYear':year,'physicalRows':len(gates),'inputCompleteRows':sum(row['inputComplete'] for row in gates),'knownBaseVectorAgreementRows':sum(row['fullKnownBaseVectorAgreement'] for row in gates),'knownSourceConflictRows':len(conflict),'completeInputRowsWithSourceConflict':sum(row['inputComplete'] for row in conflict),'completeInputAndNoKnownSourceConflictRows':sum(row['inputComplete'] and row['fullKnownBaseVectorAgreement'] for row in gates),'selectedParticipationQualifiedRetrospectiveRows':sum(row['retrospectiveScoringEligible'] for row in gates),'strictPriorInformationSimulationRows':0,'selectedPlayerSeasonDenominator':len(players),'selectedGameDenominator':len(games),'fullSourcedSelectedPlayerSeasonsReadyForRetrospectiveScoring':sum(all(row['retrospectiveScoringEligible'] for row in values) for values in players.values()),'fullSourcedSelectedGamesReadyForRetrospectiveScoring':sum(all(row['retrospectiveScoringEligible'] for row in values) for values in games.values()),'gameCompletenessScope':'All materialized selected player rows, not a complete professional game inventory.','positionMembershipImpact':{code:{'membershipRows':len(values),'knownSourceConflictRows':sum(row['sourceComparisonStatus']=='CONFLICT' for row in values),'eligibleRetrospectiveRows':sum(row['retrospectiveScoringEligible'] for row in values)} for code,values in sorted(position_groups.items())},'conflictFields':dict(collections.Counter(field for row in conflict for field in row['conflictFields'])),'parentEnrichedPartition':parent['partition'],'parentEnrichedPartitionSha256':parent['partitionSha256'],'comparisonSha256':frozen['comparisonSha256'],'partition':str(target.relative_to(ROOT)),'partitionSha256':actual,'partitionBytes':target.stat().st_size,'sourcePreferenceChosen':False,'existingValuesChanged':0,'replayVerified':args.verify_existing};cohorts.append(report);print(f'NHL/{year}: {report["inputCompleteRows"]} complete inputs; {len(conflict)} source conflicts; {report["selectedParticipationQualifiedRetrospectiveRows"]} retrospective-qualified rows',flush=True)
if any(digest(ROOT/path)!=value for path,value in startup.items()):raise RuntimeError('Scoring gate code changed during processing.')
if sum(row['knownSourceConflictRows'] for row in cohorts)!=441 or sum(row['completeInputRowsWithSourceConflict'] for row in cohorts)!=438:raise RuntimeError('Frozen441/438 source conflict denominators changed.')
required_reports=['reports/m6-historical-readiness.json','reports/m6-nhl-enrichment-readiness.json','reports/m6-nhl-full-box-corroboration.json','reports/m6-partition-reproducibility.json','reports/m6-mlb-role-quality.json','reports/m6-pitching-position-timeline.json','reports/m6-preparation-impact.json','reports/m6-operational-canonical-coverage.json','reports/m6-dependency-provenance.json'];bindings=[{'path':path,'sha256':digest(ROOT/path)} for path in required_reports]
package={'version':'m6-source-qualified-dataset-package-1','parentPreparedPartitionBundle':replay['datasetFingerprint'],'mandatoryCorroborationReportFingerprint':source_fp,'mandatoryCorroborationRows':506116,'cohorts':cohorts,'inputCompleteNhlRows':sum(row['inputCompleteRows'] for row in cohorts),'knownSourceConflictNhlRows':441,'completeInputAndNoKnownSourceConflictNhlRows':sum(row['completeInputAndNoKnownSourceConflictRows'] for row in cohorts),'selectedParticipationQualifiedRetrospectiveNhlRows':sum(row['selectedParticipationQualifiedRetrospectiveRows'] for row in cohorts),'strictSimulationEligibleRows':0,'existingValuesChanged':0,'developmentWrites':0,'v10Active':False,'requiredReportBindings':bindings,'transformationFiles':[{'path':path,'sha256':value} for path,value in startup.items()],'consumerContract':{'mandatoryScoringGate':'EveryNHL retrospective score consumer must join exact sourceRow/player/game/role against scoring-gate.parquet. Known conflicts have false eligibility and null gated score.','frozenEnrichmentConflictCountScope':'Zero only within supplemented-key domain, not full known scoring-vector agreement.','inputCompletenessIsNotScoringReadiness':True,'strictPriorInformationMethodologyApproved':False,'otherSportsFullIndependentSourceVectorAuditClaimed':False,'knownSourceValuesNeverOverwritten':True}}
# Exclude verification-state flags from the source-qualified package identity.
semantic={**package,'cohorts':[{key:value for key,value in row.items() if key!='replayVerified'} for row in cohorts]};package['packageFingerprint']=hashlib.sha256(canon(semantic).encode()).hexdigest();destination=ROOT/'reports/m6-dataset-package.json'
if args.verify_existing:
 old=json.loads(destination.read_text())
 if old['packageFingerprint']!=package['packageFingerprint']:raise RuntimeError('Final mandatory quality package changed on replay.')
else:destination.write_text(json.dumps(package,indent=2)+'\n')
print('Source-qualified package fingerprint '+package['packageFingerprint'],flush=True)
