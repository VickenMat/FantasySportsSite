"""Offline-only field resolutions supported by cached terminal event actors.
Original archives,55partitions and11frozen gates are never edited.
"""
import collections,hashlib,json,subprocess
from pathlib import Path
import pyarrow.parquet as pq
from m6_nhl_event_counts import event_facts
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canon(v):return json.dumps(v,sort_keys=True,separators=(',',':'))
report=json.loads((ROOT/'reports/m6-nhl-full-box-corroboration.json').read_text());parent=json.loads((ROOT/'reports/m6-dataset-package.json').read_text());all_rows=[];summaries=[]
for season in report['seasons']:
 conflicts=season['conflicts']
 if not conflicts:continue
 year=season['seasonStartYear'];profiles=json.loads((ROOT/f'data/simulation/nhl_enrichment/{year}/source_profiles.json').read_text())['profiles'];event_proof=next(p for p in profiles if p['kind']=='events');source=ROOT/'data/provider_previews/objects'/event_proof['sourceSha256']
 if sha(source)!=event_proof['sourceSha256']:raise RuntimeError('Raw native events changed')
 for proof in profiles:
  if sha(ROOT/proof['decodedPath'])!=proof['decodedSha256']:raise RuntimeError('Retained decoded evidence changed')
 games={c['sourceGameId'] for c in conflicts};counts=collections.Counter();events=collections.defaultdict(list);columns=['game_id','event_type','event_idx','event_team_abbr','event_player_1_id','event_player_1_type','event_player_2_id','event_player_2_type','event_player_3_id','event_player_3_type','event_goalie_id','period_type','home_score','away_score']
 for batch in pq.ParquetFile(source).iter_batches(columns=columns):
  for event in batch.to_pylist():
   game=str(event['game_id'])
   if game not in games:continue
   events[game].append(event)
   try:
    for player,field in event_facts(event):counts[(game,player,field)]+=1
   except ValueError as error:event.setdefault('derivationError',str(error))
 # Game closure and ordinary scoring inventory are validated independently of any
 # candidate field's preferred value. A failed stream cannot authorize a repair.
 skaters=[json.loads(l) for l in (ROOT/f'data/simulation/nhl_enrichment/{year}/skaters.decoded.jsonl').open()];goalies=[json.loads(l) for l in (ROOT/f'data/simulation/nhl_enrichment/{year}/goalies.decoded.jsonl').open()];infos={r['game_id']:r for r in map(json.loads,(ROOT/f'data/simulation/nhl_enrichment/{year}/info.decoded.jsonl').open())};teams={};ordinary_goals=collections.Counter()
 for r in skaters:
  if r['game_id'] in games:ordinary_goals[r['game_id']]+=int(r['goals']);teams[(r['game_id'],r['player_id'])]=r['team_abbrev']
 for r in goalies:
  if r['game_id'] in games:teams[(r['game_id'],r['player_id'])]=r['team_abbrev']
 valid={};failures={}
 for game,values in events.items():
  reasons=[e['derivationError'] for e in values if e.get('derivationError')];ends=[e for e in values if e['event_type']=='GAME_END'];ids=[e['event_idx'] for e in values]
  if len(ends)!=1 or len(ids)!=len(set(ids)):reasons.append('STREAM_TERMINAL_OR_DUPLICATE_FAILURE')
  expected_sog=sum(e['event_type'] in ['SHOT','GOAL'] and e['period_type']!='SHOOTOUT' for e in values)
  actual_sog=sum(value for (g,p,field),value in counts.items() if g==game and field=='sog')
  if expected_sog!=actual_sog:reasons.append('SOG_EVENT_CONSERVATION_FAILURE')
  goals=sum(e['event_type']=='GOAL' and e['period_type']!='SHOOTOUT' for e in values)
  if goals!=ordinary_goals[game]:reasons.append('SCORING_INVENTORY_CONFLICT')
  info=infos.get(game)
  if not info or info.get('game_state') not in ['OFF','FINAL']:reasons.append('FINAL_GAME_INFO_MISSING')
  if ends and info:
   final=(int(info['home_score']),int(info['away_score']));event=(ends[0]['home_score'],ends[0]['away_score'])
   if event!=final and not(ends[0]['period_type']=='SHOOTOUT' and sorted([final[0]-event[0],final[1]-event[1]])==[0,1]):reasons.append('FINAL_SCORE_CONFLICT')
  valid[game]=not reasons;failures[game]=reasons
 binding=next(c for c in parent['cohorts'] if c['seasonStartYear']==year);path=ROOT/binding['parentEnrichedPartition']
 if sha(path)!=binding['parentEnrichedPartitionSha256']:raise RuntimeError('Frozen enriched partition changed')
 prepared={(r['sourceGameId'],r['sourcePlayerId'],r['role']):r for r in pq.ParquetFile(path).read().to_pylist()};resolved=[];held=[]
 for conflict in conflicts:
  game,player=conflict['sourceGameId'],conflict['sourcePlayerId'];row=prepared[(game,player,conflict['role'])];stats=json.loads(row['enrichedStatsJson']);facts=[];reasons=list(failures.get(game,['EVENT_STREAM_MISSING']))
  if conflict['teamConflict'] or teams.get((game,player))!=row['teamId']:reasons.append('TEAM_IDENTITY_CONFLICT')
  for field in conflict['conflicts']:
   count=counts[(game,player,field['field'])];supported=count in [field['sourceValue'],field['archiveValue']]
   facts.append({**field,'eventCount':count,'selectedValue':count if supported else None,'support':'TERMINAL_EVENT_ACTOR_COUNT_PLUS_MATCHING_RECORDED_BOX' if supported else 'UNRESOLVED'})
   if not supported:reasons.append('EVENT_BOX_ARCHIVE_DISAGREEMENT:'+field['field'])
   else:stats[field['field']]=count
  item={'sport':'NHL','seasonStartYear':year,'sourceRow':row['sourceRow'],'sourceGameId':game,'sourcePlayerId':player,'role':row['role'],'selectedRole':row['selectedRole'],'participation':row['participation'],'fields':facts,'parentComparisonFingerprint':report['fingerprint'],'eventSourceSha256':event_proof['sourceSha256'],'boxSourceProofs':season['sourceProofs'],'historicalKnownAt':None,'currentEligibility':False,'productionWrites':0}
  if reasons:held.append({**item,'reasons':sorted(set(reasons))})
  else:resolved.append({**item,'resolvedStats':stats,'classification':'RETROSPECTIVE_EVENT_CORROBORATED_RESOLUTION'})
 directory=ROOT/'data/simulation/conflict_resolution';directory.mkdir(parents=True,exist_ok=True);raw=directory/f'{year}.input.jsonl';out=directory/f'{year}.resolved.jsonl';raw.write_text(''.join(canon(r)+'\n' for r in resolved));subprocess.run(['node','--import','tsx','src/workers/score-m6-resolutions.ts',str(raw),str(out)],cwd=ROOT,check=True);raw.unlink();scored=[json.loads(l) for l in out.open()];all_rows+=scored
 summaries.append({'seasonStartYear':year,'originalConflictingRows':len(conflicts),'supportedResolvedRows':len(resolved),'remainingRows':len(held),'remainingReasons':dict(collections.Counter(reason for h in held for reason in h['reasons'])),'completeSelectedPlayedResolvedRows':sum(not r['missingStats'] and r['selectedRole'] and r['participation']=='PLAYED' for r in scored),'fieldOutcomes':dict(collections.Counter('PUBLISHED_BOX' if f['selectedValue']==f['sourceValue'] else 'ARCHIVE' for r in scored for f in r['fields'])),'sourceEventSha256':event_proof['sourceSha256'],'overlay':str(out.relative_to(ROOT)),'overlaySha256':sha(out),'held':held})
 print(json.dumps({k:v for k,v in summaries[-1].items() if k!='held'}),flush=True)
result={'version':'m6-native-event-conflict-resolution-1','parentOriginal441Fingerprint':report['fingerprint'],'originalConflictingRows':441,'resolvedRows':len(all_rows),'remainingRows':441-len(all_rows),'newRetrospectiveCompleteSelectedPlayedRows':sum(not r['missingStats'] and r['selectedRole'] and r['participation']=='PLAYED' for r in all_rows),'seasons':summaries,'selectionPolicy':'Complete terminal nonduplicate native event stream, reconciled ordinary goal inventory and final score; each conflicting field must match its exact event-actor count in archive or published box. No majority vote or universal source preference.','originalSourcesAndFrozen55PartitionsChanged':False,'historicalKnownAtSupplied':False,'strictSimulationReadinessGranted':False,'productionWrites':0,'transformSha256':sha(Path(__file__)),'eventDerivationSha256':sha(ROOT/'scripts/m6_nhl_event_counts.py')};result['fingerprint']=hashlib.sha256(canon(result).encode()).hexdigest();(ROOT/'reports/m6-nhl-conflict-resolution.json').write_text(json.dumps(result,indent=2)+'\n')
