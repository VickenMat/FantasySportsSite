"""Traceable missingness by native identities/team/prior-only performance tier.
No new held-out scores; per-row derived details stay outside Git.
"""
import collections,hashlib,json
from pathlib import Path
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1]
base=json.loads((ROOT/'reports/m6-historical-readiness.json').read_text());package=json.loads((ROOT/'reports/m6-dataset-package.json').read_text());summary=[]
out=ROOT/'data/simulation/approved_model_v1/missingness.jsonl';out.parent.mkdir(parents=True,exist_ok=True)
with out.open('w') as f:
 for sport in ['NFL','MLB','NBA','NHL']:
  prior={}
  for c in [x for x in base['cohorts'] if x['sport']==sport]:
   year=c['seasonStartYear'];path=c['partition']
   if sport=='NHL':path=next(x['parentEnrichedPartition'] for x in package['cohorts'] if x['seasonStartYear']==year)
   rows=pq.ParquetFile(ROOT/path).read().to_pylist();cohort=collections.Counter();by_team=collections.defaultdict(collections.Counter);by_position=collections.defaultdict(collections.Counter);tiers=collections.defaultdict(collections.Counter);players=set();games=set();next_prior=collections.defaultdict(list)
   ordered=sorted(prior.items(),key=lambda x:x[1]);rank={p:i/max(1,len(ordered)-1) for i,(p,v) in enumerate(ordered)}
   for r in rows:
    mask=r.get('enrichedMissingMask',r['missingMask']);p=r['sourcePlayerId'];tier='UNKNOWN_PRIOR' if p not in rank else 'LOW_PRIOR_QUARTILE' if rank[p]<.25 else 'HIGH_PRIOR_QUARTILE' if rank[p]>=.75 else 'MIDDLE_PRIOR'
    if mask:
     cohort.update(mask);by_team[str(r['teamId'])].update(mask);tiers[tier].update(mask);players.add(p);games.add(r['sourceGameId'])
     for pos in r['positions'] or ['UNKNOWN']:by_position[pos].update(mask)
     f.write(json.dumps({'sport':sport,'year':year,'nativePlayer':p,'nativeGame':r['sourceGameId'],'team':r['teamId'],'positions':r['positions'],'participation':r['participation'],'priorTier':tier,'missing':mask,'sourceRowFingerprint':r['sourceRowFingerprint']},separators=(',',':'))+'\n')
    # 2025 is not evaluated or used for fresh score aggregation in this audit.
    if year!=2025 and r['selectedRole'] and r['participation']=='PLAYED' and not mask:
     points=r.get('enrichedPointsTenths',r['baselinePointsTenths'])
     if points is not None:next_prior[p].append(points)
   summary.append({'sport':sport,'year':year,'missingFields':dict(cohort),'affectedPlayers':len(players),'affectedGames':len(games),'byTeam':{k:dict(v) for k,v in by_team.items()},'byPosition':{k:dict(v) for k,v in by_position.items()},'byPriorTier':{k:dict(v) for k,v in tiers.items()},'tierDefinition':'Prior season mean among complete provided played rows; incomplete prior histories remain selection-biased','draftabilityAndStarts':'Join actual campaign trace only, never assume every missing row was a starter'})
   prior={p:sum(v)/len(v) for p,v in next_prior.items()}
report={'version':'m61-missingness-bias-1','cohorts':summary,'derivedRows':str(out.relative_to(ROOT)),'derivedRowsSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'missingnessRandom':False,'unmeasured':'Historical injuries/rookies without explicit evidence; actual drafted/started cohorts supplied separately by campaign traces','newHoldoutScoringResults':False,'productionWrites':0}
(ROOT/'reports/m61-missingness-bias.json').write_text(json.dumps(report,indent=2)+'\n')
