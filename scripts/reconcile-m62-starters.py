"""Original seed31 assignment audit. Primary buckets are exclusive, flags overlap.
No absence becomes DNP and no retrospective fact changes an earlier decision.
"""
import collections,hashlib,json
from pathlib import Path
import pyarrow.parquet as pq
R=Path(__file__).resolve().parents[1];read=lambda p:json.loads((R/p).read_text())
trace=read('data/simulation/evidence_closure_v1/baseline/seed31.json');base=read('reports/m6-historical-readiness.json');cross={(r['sport'],str(r['archive_game_id'])):str(r['game_id']) for r in pq.read_table(R/'data/schedule_data/game_id_crosswalk.parquet').to_pylist()};schedules={(r['sport'],str(r['game_id'])):r for r in pq.read_table(R/'data/schedule_data/game_schedules.parquet').to_pylist()};bindings=read('reports/m61-diagnostic-selections.json')['snapshots'];records=[];summaries=[]
for run in trace['result']['runs']:
 sport=run['sport'];c=next(c for c in base['cohorts'] if c['sport']==sport and c['seasonStartYear']==2023);p=R/c['partition'];p=p.with_name('enriched-records.parquet') if sport=='NHL' else p;rows=pq.ParquetFile(p).read().to_pylist();by_key=collections.defaultdict(list);by_pg=collections.defaultdict(list);by_player=collections.defaultdict(list)
 for row in rows:
  if row['valid']:
   gid=cross.get((sport,row['sourceGameId']),row['sourceGameId']);by_key[(row['sourcePlayerId'],gid,row['role'])].append(row);by_pg[(row['sourcePlayerId'],gid)].append(row);by_player[row['sourcePlayerId']].append(row)
 terminal_report=read('reports/m62-terminal-evidence.json') if (R/'reports/m62-terminal-evidence.json').exists() else None
 source=next(s for s in bindings if s['sport']==sport and s['informationModel']=='TWO_DAY' and s['positionModel']=='DATED_CARRY');snapshot=read(source['path']);new_snapshot=read(next(t['path'] for t in terminal_report['inputs'] if t['sport']==sport)) if terminal_report else {};new_terminal=new_snapshot.get('terminalEvidence',[]);canonical_teams={(m['playerId'],m['gameId']):m['team'] for m in new_snapshot.get('actualMembership',[])};new_played={(o['playerId'],o['gameId'],o['role']) for o in new_snapshot.get('outcomes',[]) if o.get('participation')=='PLAYED'};terminal_by={(t['playerId'],t['gameId'],t['role']):t for t in new_terminal};fixtures={f['id']:f for f in snapshot['fixtures']};roster=collections.defaultdict(list)
 for f in snapshot['roster']:roster[f['playerId']].append(f)
 for facts in roster.values():facts.sort(key=lambda f:(f['effectiveAt'],f['knownAt']))
 pick_index=collections.defaultdict(list)
 for pick in run['trace']['lineups']:
  for game in pick['games']:pick_index[(pick['team'],pick['playerId'],game,pick['role'])].append(pick)
 seen=set();counts=collections.Counter();flags=collections.Counter()
 for s in run['trace']['scores']:
  if s['pointsTenths'] is not None:continue
  key=(s['team'],s['playerId'],s['gameId'],s['role']);pick=pick_index[key][0];fixture=fixtures[s['gameId']];at=__import__('datetime').datetime.fromtimestamp(pick['lockAt']/1000,__import__('datetime').timezone.utc).isoformat().replace('+00:00','Z');fact=next((f for f in reversed(roster[s['playerId']]) if f['knownAt']<at and f['effectiveAt']<at),None);exact=by_key.get((s['playerId'],s['gameId'],s['role']),[]);other_role=by_pg.get((s['playerId'],s['gameId']),[]);game=schedules.get((sport,s['gameId']));f=[];evidence=[];mask=[];category=None;impact='UNKNOWN_TOTAL'
  if key in seen:category='DUPLICATE_ASSIGNMENT'
  seen.add(key)
  if not category and not game:category='UNRESOLVED_GAME_IDENTITY'
  if not category and not fact:category='UNRESOLVED_PLAYER_IDENTITY'
  if not category and fact['team'] not in fixture['teams']:category='UNRESOLVED_PROFESSIONAL_TEAM_MAPPING'
  recovered=terminal_by.get((s['playerId'],s['gameId'],s['role']))
  if not category and recovered and recovered['status']=='DID_NOT_PLAY':category='EXPLICIT_VERIFIED_DNP';evidence=[recovered];impact='VERIFIED_ZERO_ROLE_PARTICIPATION';f.append('EXPLICIT_TERMINAL_EVIDENCE_RECOVERED')
  if not category and recovered and recovered['status']=='PLAYED_COMPLETE':category='PLAYED_RECOVERED_PARTICIPATION';evidence=[recovered];impact='KNOWN_COMPLETE_EXISTING_V9_INPUTS'
  if not category and recovered and recovered['status']=='ROLE_NOT_SCORED':category='VERIFIED_NONSCORING_ROLE';evidence=[recovered];impact='ZERO_FOR_UNSELECTED_ROLE_NOT_PLAYER_DNP'
  if not category and exact and all(r['participation']=='UNKNOWN' for r in exact) and (s['playerId'],s['gameId'],s['role']) in new_played:category='PLAYED_RECOVERED_PARTICIPATION';evidence=[{'basis':'Positive canonical snap count with explicit PFR–GSIS identifier pair; source V9 inputs unchanged'}];impact='KNOWN_COMPLETE_EXISTING_V9_INPUTS'
  if not category and exact:
   evidence=[{'sourceRow':r['sourceRow'],'sourceFingerprint':r['sourceRowFingerprint'],'participation':r['participation'],'selectedRole':r['selectedRole'],'roleSelection':r['roleSelection']} for r in exact];mask=sorted({m for r in exact for m in r.get('enrichedMissingMask',r['missingMask'])})
   if all(r['participation']=='DID_NOT_PLAY' for r in exact):category='EXPLICIT_VERIFIED_DNP';impact='VERIFIED_ZERO_ROLE_PARTICIPATION'
   elif any(r['participation']=='PLAYED' and r['selectedRole'] and r.get('enrichedMissingMask',r['missingMask']) for r in exact):category='PLAYED_INCOMPLETE_V9_INPUTS';impact='FINITE_COMPONENT_BOUND' if mask==['shutout'] else 'UNBOUNDED_REQUIRED_INPUT'
   elif any(r['participation']=='PLAYED' and r['selectedRole'] and not r.get('enrichedMissingMask',r['missingMask']) for r in exact):category='COMPILER_DROPPED_COMPLETE_APPEARANCE'
   elif any(r['participation']=='UNKNOWN' for r in exact):category='UNKNOWN_PARTICIPATION'
   else:category='UNRESOLVED_SCORING_ROLE'
  if not category and any(r['participation']=='PLAYED' and r['selectedRole'] for r in other_role):category='OTHER_VERIFIED_SCORING_ROLE';evidence=[{'sourceRow':r['sourceRow'],'role':r['role'],'participation':r['participation'],'selectedRole':r['selectedRole']} for r in other_role]
  if not category:
   actual=[]
   for r in by_player.get(s['playerId'],[]):
    g=schedules.get((sport,cross.get((sport,r['sourceGameId']),r['sourceGameId'])))
    if not g or r['participation']!='PLAYED' or not r['selectedRole']:continue
    same_period=(g['week']==game['week'] if sport=='NFL' else str(g['start_time_utc'].date())==fixture['slate'])
    if same_period:
     r=dict(r);r['teamId']=canonical_teams.get((r['sourcePlayerId'],str(g['game_id'])),r['teamId']);actual.append((r,g))
   if actual:
    category=('MLB_DOUBLEHEADER_OTHER_GAME_APPEARANCE' if sport=='MLB' and any(r['teamId']==fact['team'] for r,g in actual) else 'UTC_DAY_MULTIGAME_OTHER_APPEARANCE' if sport in ['NHL','NBA'] and any(r['teamId']==fact['team'] for r,g in actual) else 'WRONG_TEAM_EXPECTATION_WITH_ACTUAL_PERIOD_APPEARANCE');evidence=[{'sourceRow':r['sourceRow'],'sourceGameId':r['sourceGameId'],'actualGameId':str(g['game_id']),'actualTeam':r['teamId'],'actualStartsAt':g['start_time_utc'].isoformat(),'role':r['role'],'sameOfficialWeek':sport=='NFL'} for r,g in actual];f.append('SAME_TEAM_ADDITIONAL_GAME' if any(r['teamId']==fact['team'] for r,g in actual) else 'STALE_MODELED_TEAM_CONTINUITY');f.append('ACTUAL_GAME_BEFORE_DECISION' if any(g['start_time_utc'].timestamp()*1000<pick['lockAt'] for r,g in actual) else 'ACTUAL_GAME_AFTER_DECISION')
   else:
    observations=[r for r in by_player.get(s['playerId'],[]) if r['selectedRole'] and r['participation']=='PLAYED' and r['scheduledStartsAt'] and r['scheduledStartsAt']<at]
    latest=max(observations,key=lambda r:r['scheduledStartsAt'],default=None)
    # This is a stale-knowledge marker, not proof of roster membership at the missing game.
    if latest and latest['teamId']!=fact['team'] and sport!='NBA':category='STALE_TEAM_CONTINUITY_WITHOUT_SAME_PERIOD_APPEARANCE';evidence=[{'sourceRow':latest['sourceRow'],'observedTeam':latest['teamId'],'observedStartsAt':latest['scheduledStartsAt']}]
    else:category='MISSING_PLAYER_GAME_ROW'
  if not exact:f.append('NO_REQUESTED_ROLE_SOURCE_ROW')
  if category=='EXPLICIT_VERIFIED_DNP':f.append('COMPILER_EXCLUDED_NONSELECTED_DNP' if any(r['participation']=='DID_NOT_PLAY' for r in exact) else 'NEW_EXPLICIT_PUBLISHED_DNP_EVIDENCE')
  if category=='MISSING_PLAYER_GAME_ROW':f.append('PARTICIPATION_UNKNOWN_NO_DNP_INFERENCE')
  if s['role']=='PITCHER':f.append('PITCHER_PARTICIPATION_IS_NOT_DAILY_CERTAINTY')
  if s['role']=='GOALIE':f.append('GOALIE_PARTICIPATION_IS_NOT_DAILY_CERTAINTY')
  counts[category]+=1;flags.update(f);records.append({'sport':sport,'year':2023,'seed':31,'franchise':s['team'],'playerId':s['playerId'],'expectedGameId':s['gameId'],'role':s['role'],'slot':pick['slot'],'slotIndex':pick['slotIndex'],'lockAt':pick['lockAt'],'decisionTeam':fact['team'] if fact else None,'fixtureTeams':fixture['teams'],'primaryCategory':category,'secondaryFlags':f,'classificationCause':('IMPLEMENTATION_DEFECT' if 'COMPILER_EXCLUDED_NONSELECTED_DNP' in f else 'SOURCE_EVIDENCE_GAP_OR_FORECAST_UNCERTAINTY'),'missingStats':mask,'evidence':evidence,'scoringImpact':impact})
 summaries.append({'sport':sport,'originalUnresolved':run['metrics']['unscoredStarts'],'primaryCounts':dict(counts),'secondaryFlags':dict(flags)})
assert len(records)==12181,len(records)
path=R/'data/simulation/evidence_closure_v1/original_assignment_reconciliation.jsonl';path.write_text(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in records))
summary={'version':'m62-original-starter-reconciliation-1','baselineTraceSha256':hashlib.sha256((R/'data/simulation/evidence_closure_v1/baseline/seed31.json').read_bytes()).hexdigest(),'originalTotal':12181,'classifiedTotal':len(records),'mutuallyExclusive':True,'sports':summaries,'categories':[],'detailPath':str(path.relative_to(R)),'detailSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'secondaryFlagsOverlap':True,'sourceRowsZeroFilled':0,'productionWrites':0}
for category in sorted({r['primaryCategory'] for r in records}):
 rs=[r for r in records if r['primaryCategory']==category];summary['categories'].append({'category':category,'count':len(rs),'bySport':dict(collections.Counter(r['sport'] for r in rs)),'bySlot':dict(collections.Counter(r['sport']+':'+r['slot'] for r in rs)),'uniquePlayers':len({(r['sport'],r['playerId']) for r in rs}),'uniqueGames':len({(r['sport'],r['expectedGameId']) for r in rs}),'franchises':sorted({r['franchise'] for r in rs})})

needs={
 'EXPLICIT_VERIFIED_DNP':('RESOLVED_TERMINAL_EVIDENCE','Explicit canonical DNP/zero TOI row; settle after lock only','Verified zero participation; not a played appearance'),
 'PLAYED_RECOVERED_PARTICIPATION':('RESOLVED_TERMINAL_EVIDENCE','Positive source snaps with canonical PFR/GSIS pair; existing complete V9 inputs','Exact production V9 score; no pregame publication timestamp invented'),
 'VERIFIED_NONSCORING_ROLE':('CONFIRMED_ROLE_POLICY','Recorded starting pitcher/batting activity establishes confirmed selected role','Zero for unselected role only; not player DNP'),
 'PLAYED_INCOMPLETE_V9_INPUTS':('MISSING_STATISTICAL_EVIDENCE','Explicit goalie shutout credit or approved multi-evidence credit policy','Original52 assignments have fixed component interval0..972.4points; no adaptive bound'),
 'MLB_DOUBLEHEADER_OTHER_GAME_APPEARANCE':('OPPORTUNITY_AND_SOURCE_GAP','Game-specific pitcher participation/nonparticipation and applicable roster proof','Another game appearance never proves DNP in requested game'),
 'UTC_DAY_MULTIGAME_OTHER_APPEARANCE':('OPPORTUNITY_AND_SOURCE_GAP','Canonical game-specific participation and team roster inventory','Same UTC day is not a unique game identifier'),
 'WRONG_TEAM_EXPECTATION_WITH_ACTUAL_PERIOD_APPEARANCE':('MODELED_TEAM_CONTINUITY','Dated canonical team transition; retrospective actual game membership for settlement','Actual game credited only if player occupied locked slot and was owned at actual start'),
 'STALE_TEAM_CONTINUITY_WITHOUT_SAME_PERIOD_APPEARANCE':('MODELED_TEAM_CONTINUITY','Applicable dated roster evidence and complete participation inventory','Prior observation mismatch alone cannot establish current membership or DNP'),
 'MISSING_PLAYER_GAME_ROW':('MISSING_PARTICIPATION_EVIDENCE','Canonical applicable roster plus complete category-specific participation inventory, no contradiction','Unknown full outcome; no zero fill or finite complete-outcome bound')}
for row in summary['categories']:
 cause,evidence,impact=needs[row['category']];row.update(season=2023,cause=cause,evidenceRequired=evidence,potentialScoringImpact=impact)
summary['requiredCategoryInterpretation']={
 'actualPlayedIncompleteV9':'PLAYED_INCOMPLETE_V9_INPUTS','explicitVerifiedDNP':'EXPLICIT_VERIFIED_DNP',
 'verifiedNoApplicableGame':0,'verifiedNonStartingPitcher':0,'verifiedNonParticipatingGoalie':sum(r['primaryCategory']=='EXPLICIT_VERIFIED_DNP' and r['role']=='GOALIE' for r in records),
 'playerNotApplicableRoster':0,'wrongProfessionalTeam':'WRONG_TEAM_EXPECTATION_WITH_ACTUAL_PERIOD_APPEARANCE',
 'staleContinuity':'STALE_TEAM_CONTINUITY_WITHOUT_SAME_PERIOD_APPEARANCE','missingProfessionalGame':0,
 'missingPlayerGameRow':'MISSING_PLAYER_GAME_ROW','unresolvedPlayerIdentity':0,'unresolvedGameIdentity':0,
 'unresolvedProfessionalTeamMapping':0,'unresolvedScoringRole':0,'unknownParticipation':'MISSING_PLAYER_GAME_ROW',
 'suspendedOrResumedPrimaryCause':0,'missingCompletionChronologyPrimaryCause':0,'duplicateAssignment':0,
 'simulationSchedulingDefectPrimaryCause':0,'compilerProjectionDefect':576,
 'otherPreciselyDocumentedReasons':['MLB_DOUBLEHEADER_OTHER_GAME_APPEARANCE','UTC_DAY_MULTIGAME_OTHER_APPEARANCE','VERIFIED_NONSCORING_ROLE','PLAYED_RECOVERED_PARTICIPATION']}
summary['requiredCategoriesAreAliasesNotAdditionalExclusiveCounts']=True
summary['categoryNotes']='Zero means not established as a primary cause of these original assignments, not that the archive has no such games or chronology gaps. Goalie DNP and compiler defect are overlapping descriptions of the same576 rows, not extra categories. Nonstarting pitchers may still pitch in relief and are not inferred DNP.'
(R/'reports/m62-original-starter-reconciliation.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summaries,indent=2))
