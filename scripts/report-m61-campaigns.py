"""Compact real diagnostic campaign summaries; no complete-baseline inference."""
import argparse,collections,csv,hashlib,json,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--year',type=int,default=2023);a=p.parse_args()
if a.year==2025:raise ValueError('Held-out campaign analysis forbidden')
franchise_rows=[]
files=sorted((ROOT/f'data/simulation/approved_model_v1/campaigns/{a.year}').glob('*.json'));records=[];details=[]
for path in files:
 run=json.loads(path.read_text());result=run['result'];sport_rows=[]
 for sport in result['runs']:
  trace=sport['trace'];scores={(s['playerId'],s['gameId']):s for s in trace['scores']};slots=collections.defaultdict(lambda:{'players':set(),'points':[],'unknown':0,'qbPoints':0,'replacementExpected':[]});sf=collections.Counter();rounds=collections.Counter();draft={d['playerId']:d['round'] for d in trace['draft']};byplayer=collections.Counter();waiverplayers={d['add'] for d in trace['waivers'] if d['won']};waiver_points=0
  for pick in trace['lineups']:
   group=slots[pick['slot']];group['players'].add(pick['playerId']);is_waiver=any(w['won'] and w['add']==pick['playerId'] and w['team']==pick['team'] and w['at']<pick['lockAt'] for w in trace['waivers'])
   if pick['slot']=='SUPERFLEX':sf.update(['QB' if 'QB' in pick['positionsAtLock'] else next(iter(pick['positionsAtLock']),'UNKNOWN')])
   for game in pick['games']:
    score=scores.get((pick['playerId'],game),{}).get('pointsTenths')
    if score is None:group['unknown']+=1;continue
    group['points'].append(score);byplayer[pick['playerId']]+=score;rounds['WAIVER' if is_waiver else str(draft.get(pick['playerId'],'UNKNOWN'))]+=score
    if is_waiver:waiver_points+=score
    if 'QB' in pick['positionsAtLock']:group['qbPoints']+=score
    if pick.get('replacementProjection') is not None:group['replacementExpected'].append(pick['replacementProjection']/len(pick['games']))
  position={name:{'uniqueStartedPlayers':len(v['players']),'knownPointsTenths':sum(v['points']),'unknownAssignments':v['unknown'],'knownAppearanceMedianTenths':statistics.median(v['points']) if v['points'] else None,'pointsAbovePrelockExpectedReplacementTenths':sum(v['points'])-sum(v['replacementExpected']) if len(v['points'])==len(v['replacementExpected']) else None,'replacementComparableKnownAssignments':len(v['replacementExpected']),'replacementScope':'Eligible actually unowned predecision expected replacement, not hindsight actual points'} for name,v in slots.items()}
  franchise_rows.extend({'year':a.year,'seed':run['seed'],'variant':run['variant'],'sport':sport['sport'],'team':t['team'],'known_points_tenths':t['totalTenths'],'sport_unresolved_assignments':sport['metrics']['unscoredStarts'],'official_baseline':False} for t in sport['metrics']['teams'])
  totals=[t['totalTenths'] for t in sport['metrics']['teams']];qs=statistics.quantiles(totals,n=4,method='inclusive');row={'sport':sport['sport'],'knownPointMedianTenths':statistics.median(totals),'knownPointMeanTenths':statistics.mean(totals),'knownPointIqrTenths':qs[2]-qs[0],'unresolvedStarterAssignments':sport['metrics']['unscoredStarts'],'knownScoredAppearances':sport['metrics']['scoredStarts'],'draftedPlayers':len(draft),'draftUnfilledStarterSeats':sport['metrics']['draftUnfilledStarterSeats'],'emptyRequestedSlots':sport['metrics']['requestedSlots']-sport['metrics']['filledSlots'],'waiversWon':sport['metrics']['waiversWon'],'faabSpent':sum(100-t['remainingFaab'] for t in sport['metrics']['teams']),'position':position,'superflexPositionAssignments':dict(sf),'qbKnownPointShare':sport['metrics']['quarterbackTenths']/sum(totals) if sum(totals) else None,'roundKnownPointsTenths':dict(rounds),'waiverKnownPointsTenths':waiver_points,'eliteKnownPlayerTenths':max(byplayer.values(),default=None),'officialMedian':None,'officialSpread':None}
  if run['seed']!=31:
   for detail in ['position','roundKnownPointsTenths','superflexPositionAssignments']:row.pop(detail,None)
  sport_rows.append(row)
 records.append({'year':a.year,'seed':run['seed'],'variant':run['variant'],'resultFingerprint':result['fingerprint'],'elapsedMs':run['elapsedMs'],'sampledRssBytes':run['peakRssBytes'],'sports':sport_rows,'fixedAssignmentBounds':[{'sport':b['sport'],'scope':b['scope'],'teams':len(b['teams']),'unboundedTeams':sum(t['unboundedAssignments']>0 for t in b['teams']),'unboundedAssignments':sum(t['unboundedAssignments'] for t in b['teams']),'unknownAssignments':sum(t['unknownAssignments'] for t in b['teams']),'finiteMaxWidthTenths':max((t['upperTenths']-t['lowerTenths'] for t in b['teams'] if t['lowerTenths'] is not None and t['upperTenths'] is not None),default=None),'perTeamBoundsInPrivateTrace':True} for b in run['fixedAssignmentBounds']],'tracePath':str(path.relative_to(ROOT)),'traceSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
# Seed variability units are whole leagues; do not pretend franchises are independent.
variability=[]
for sport in ['NFL','MLB','NBA','NHL']:
 for variant in sorted({r['variant'] for r in records}):
  v=[next(x for x in r['sports'] if x['sport']==sport)['knownPointMedianTenths'] for r in records if r['variant']==variant]
  variability.append({'sport':sport,'variant':variant,'leagues':len(v),'knownPointMedianAcrossLeagueSeeds':statistics.median(v) if v else None,'seedStandardDeviation':statistics.stdev(v) if len(v)>1 else None,'resamplingUnit':'Whole league/seed sharing one historical season','confidenceInterval':None,'reason':'One source-calendar diagnostic cycle with unresolved inputs cannot support historical robustness intervals'})
with (ROOT/'reports/m61-franchise-diagnostics.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(franchise_rows[0]) if franchise_rows else [],lineterminator='\n');writer.writeheader();writer.writerows(franchise_rows)
summary={'version':'m61-campaign-analysis-1','classification':'REAL_SOURCE_CALENDAR_DIAGNOSTICS_NOT_ACCEPTED_BASELINE','records':records,'seedVariability':variability,'seasonVariability':None,'memoryScope':'RSS sampled after each engine run; private legacy metadata calls this peakRssBytes, not an independently observed peak','officialBaselineRuns':0,'officialCrossSportSpread':None,'adaptiveScenarioExtremaAreGlobalBounds':False,'limitations':['UTC completion day/schedule knowledge not verified','Unsettled absent player-game rows remain UNKNOWN','Positions and calendar/source inventories not an independently accepted full baseline','Only known-point descriptive distributions are shown','2025 and seeds51–70 not executed']}
summary['fingerprint']=hashlib.sha256(json.dumps(summary,sort_keys=True,separators=(',',':')).encode()).hexdigest();(ROOT/'reports/m61-campaign-analysis.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'leagues':len(records),'official':0,'fingerprint':summary['fingerprint']}))
