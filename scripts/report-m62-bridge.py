"""Compare exact original/corrected canonical assignments, never only net counts."""
import collections,hashlib,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def read(p):return json.loads((R/p).read_text())
a=read('data/simulation/evidence_closure_v1/baseline/seed31.json');b=read('data/simulation/evidence_closure_v1/corrected/seed-31.json')
key=lambda s:(s['team'],s['playerId'],s['gameId'],s['role'])
def status(s):return 'UNKNOWN' if s['pointsTenths'] is None else s.get('settlementStatus') or ('DID_NOT_PLAY' if s.get('participation')=='DID_NOT_PLAY' else 'PLAYED')
rows=[]
for old,new in zip(a['result']['runs'],b['result']['runs']):
 assert old['sport']==new['sport'];o={key(s):s for s in old['trace']['scores']};n={key(s):s for s in new['trace']['scores']};missing=set(o)-set(n);assert not missing,(old['sport'],len(missing));assert len(o)==len(old['trace']['scores']) and len(n)==len(new['trace']['scores'])
 resolved=collections.Counter(status(n[k]) for k in o if status(o[k])=='UNKNOWN' and status(n[k])!='UNKNOWN');newkeys=set(n)-set(o);added=collections.Counter(status(n[k]) for k in newkeys)
 remain=sum(status(o[k])==status(n[k])=='UNKNOWN' for k in o);total=sum(status(s)=='UNKNOWN' for s in n.values());assert remain+added['UNKNOWN']==total
 assignments=new['trace']['scoringAssignments'];origins=collections.Counter(p.get('origin','OPTIMIZED') for p in assignments if any((p['team'],p['playerId'],g,p['role']) in newkeys for g in p['games']))
 rows.append({'sport':old['sport'],'originalAssignments':len(o),'correctedAssignments':len(n),'originalUnresolved':sum(status(s)=='UNKNOWN' for s in o.values()),'originalKeysRemoved':0,'originalUnresolvedResolvedByStatus':dict(resolved),'originalUnresolvedRemaining':remain,'newAssignmentsByStatus':dict(added),'newAssignmentOrigins':dict(origins),'correctedUnresolved':total,'knownFranchiseTenthsBefore':[t['totalTenths'] for t in old['metrics']['teams']],'knownFranchiseTenthsAfter':[t['totalTenths'] for t in new['metrics']['teams']],'draftStarterSeatsBefore':old['metrics']['draftAchievableStarterSeats'],'draftStarterSeatsAfter':new['metrics']['draftAchievableStarterSeats'],'sourceTruthAddedAssignments':new['metrics']['sourceTruthAddedAssignments'],'missingStats':new['metrics']['missingStats']})
result={'version':'m62-denominator-bridge-1','originalTraceSha256':hashlib.sha256((R/'data/simulation/evidence_closure_v1/baseline/seed31.json').read_bytes()).hexdigest(),'correctedResultFingerprint':b['result']['fingerprint'],'sports':rows,'totals':{k:sum(r[k] for r in rows) for k in ['originalAssignments','correctedAssignments','originalUnresolved','originalKeysRemoved','originalUnresolvedRemaining','correctedUnresolved']},'officialBaseline':False,'sourceCalendarChronologyAccepted':False,'productionWrites':0}
(R/'reports/m62-denominator-bridge.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['totals']));print(json.dumps([{k:r[k] for k in ['sport','originalUnresolvedResolvedByStatus','newAssignmentsByStatus','correctedUnresolved']} for r in rows]))
