"""Compile existing columnar inputs plus separately supplied decision knowledge.
No chronology is synthesized. Empty knowledge creates a blocked report, not a run.
"""
import argparse,hashlib,json
from pathlib import Path
import pyarrow.parquet as pq
from m6_asof_compile import compile_explicit_outcome
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
args=argparse.ArgumentParser();args.add_argument('--knowledge',type=Path,required=True);args.add_argument('--output',type=Path,required=True);options=args.parse_args();knowledge=json.loads(options.knowledge.read_text())
if knowledge.get('version')!='m6-explicit-decision-knowledge-1' or knowledge.get('classification') not in ['FIXTURE','DIAGNOSTIC']:raise ValueError('Explicit version and nonofficial classification required.')
base=json.loads((ROOT/'reports/m6-historical-readiness.json').read_text());nhl=json.loads((ROOT/'reports/m6-dataset-package.json').read_text());resolution=json.loads((ROOT/'reports/m6-nhl-conflict-resolution.json').read_text());resolved={}
for source in resolution['seasons']:
 path=ROOT/source['overlay']
 if sha(path)!=source['overlaySha256']:raise ValueError('Resolution bytes changed')
 for row in map(json.loads,path.open()):resolved[(row['seasonStartYear'],row['sourceRow'])]=row
options.output.mkdir(parents=True,exist_ok=False);sources=[];coverage=[]
for selected in knowledge['sports']:
 sport,year=selected['sport'],selected['year'];facts={(str(r['playerId']),str(r['gameId']),r['role']):r for r in selected['statisticalInformation']}
 if len(facts)!=len(selected['statisticalInformation']):raise ValueError('Duplicate statistical information fact')
 outcomes=[];considered=0;unknown=0;incomplete=0;parents=[]
 for season in [year-1,year]:
  cohort=next(c for c in base['cohorts'] if c['sport']==sport and c['seasonStartYear']==season);path=ROOT/cohort['partition'];expected=cohort['partitionSha256'];frozen_gates={}
  if sport=='NHL':
   bind=next(c for c in nhl['cohorts'] if c['seasonStartYear']==season);path=ROOT/bind['parentEnrichedPartition'];expected=bind['parentEnrichedPartitionSha256'];gate=ROOT/bind['partition']
   if sha(gate)!=bind['partitionSha256']:raise ValueError('Frozen gate changed')
   frozen_gates={r['sourceRow']:r for r in pq.ParquetFile(gate).read().to_pylist()}
  if sha(path)!=expected:raise ValueError('Frozen partition changed')
  parents.append({'path':str(path.relative_to(ROOT)),'sha256':expected})
  for row in pq.ParquetFile(path).read().to_pylist():
   if not row['valid']:continue
   fact=facts.get((row['sourcePlayerId'],row['sourceGameId'],row['role']))
   if not fact:unknown+=1;continue
   considered+=1
   overlay=resolved.get((season,row['sourceRow'])) if sport=='NHL' else None
   outcome,reason=compile_explicit_outcome(row,fact,frozen_gates.get(row['sourceRow']),overlay)
   if outcome:outcomes.append(outcome)
   else:incomplete+=1
 if not outcomes or not selected['roster'] or not selected['fixtures']:raise ValueError('No executable source/decision cohort; no official or empty baseline is produced.')
 snapshot={'sport':sport,'year':year,'label':str(year)+' explicit knowledge selection','coverage':'UNVERIFIED','coverageReason':'Nonofficial source subset; method/cohort acceptance pending','draftAt':selected['draftAt'],'fixtures':selected['fixtures'],'roster':selected['roster'],'availability':selected.get('availability',[]),'positions':selected.get('positions',[]),'outcomes':outcomes};path=options.output/f'{sport}.json';path.write_text(json.dumps(snapshot,separators=(',',':'))+'\n');sources.append({'sport':sport,'snapshot':path.name,'sha256':sha(path)});coverage.append({'sport':sport,'year':year,'parentPartitions':parents,'informationFactsMatched':considered,'unknownInformationRowsExcluded':unknown,'incompleteOrNonselectedRowsExcluded':incomplete,'exportedOutcomes':len(outcomes)})
if len(sources)!=4 or len({s['sport'] for s in sources})!=4:raise ValueError('Four distinct sport selections required; no official baseline is produced.')
manifest={'version':'m6-four-sport-snapshot-selection-1','classification':knowledge['classification'],'teams':knowledge.get('teams',12),'seed':knowledge['seed'],'rankingModel':knowledge.get('rankingModel','TRAILING20_SHRINK4'),'sharedBenchAllocation':knowledge['sharedBenchAllocation'],'sources':sources,'assumptions':knowledge['assumptions']};(options.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(options.output/'coverage.json').write_text(json.dumps({'knowledgeSha256':sha(options.knowledge),'cohorts':coverage,'productionWrites':0,'officialBaseline':False},indent=2)+'\n')
print(json.dumps({'manifest':str(options.output/'manifest.json'),'classification':manifest['classification'],'sources':4,'productionWrites':0}))
