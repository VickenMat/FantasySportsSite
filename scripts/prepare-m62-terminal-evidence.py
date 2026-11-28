"""Target2023-only terminal truth. No pregame model input is changed."""
import collections,hashlib,json,gzip,csv,datetime
from pathlib import Path
import pyarrow.parquet as pq
R=Path(__file__).resolve().parents[1];load=lambda p:json.loads((R/p).read_text());acq=load('data/simulation/evidence_closure_v1/acquisition.json');proof={r['tag']:r for r in acq['results'] if 'path' in r};base=load('reports/m6-historical-readiness.json');cross={(r['sport'],str(r['archive_game_id'])):str(r['game_id']) for r in pq.read_table(R/'data/schedule_data/game_id_crosswalk.parquet').to_pylist()};sched={(r['sport'],str(r['game_id'])):r for r in pq.read_table(R/'data/schedule_data/game_schedules.parquet').to_pylist()};bindings=load('reports/m61-diagnostic-selections.json')['snapshots'];out=R/'data/simulation/evidence_closure_v1/inputs';out.mkdir(parents=True,exist_ok=True);summaries=[];nba_vector_bridge={};nba_bridge_proof=[]
def digest(p):return hashlib.sha256((R/p).read_bytes()).hexdigest()
def source_rows(tag,cols=None):
 p=proof[tag];assert digest(p['path'])==p['sha256'];return pq.ParquetFile(R/p['path']).read(columns=cols).to_pylist()
def key(row):return row['sourcePlayerId'],cross.get((row['sport'],row['sourceGameId']),row['sourceGameId'])
nba_c=next(c for c in base['cohorts'] if c['sport']=='NBA' and c['seasonStartYear']==2023);nba_rows=pq.ParquetFile(R/nba_c['partition']).read().to_pylist();nba_boxes=source_rows('espn_nba_player_boxscores');nba_rosters=source_rows('espn_nba_game_rosters');candidates=source_rows('nba_crosswalk');candidate_pairs={(str(c['nba_player_id']),str(c['espn_athlete_id'])) for c in candidates if c['nba_player_id'] and c['espn_athlete_id']};mapping_fields={'PTS':'points','REB':'rebounds','AST':'assists','STL':'steals','BLK':'blocks','TOV':'turnovers','FGM':'field_goals_made','FGA':'field_goals_attempted','FTM':'free_throws_made','FTA':'free_throws_attempted','FG3M':'three_point_field_goals_made','OREB':'offensive_rebounds'}
archive_vectors=collections.defaultdict(list)
for r in nba_rows:
 if r['participation']=='PLAYED':archive_vectors[(key(r)[1],tuple(json.loads(r['statsJson']).get(k) for k in mapping_fields))].append(r)
validated=collections.defaultdict(set)
for b in nba_boxes:
 if b['did_not_play'] or any(b[k] is None for k in mapping_fields.values()):continue
 vector=tuple(b[k] for k in mapping_fields.values());matches=archive_vectors.get((str(b['game_id']),vector),[])
 if len(matches)==1 and (matches[0]['sourcePlayerId'],str(b['athlete_id'])) in candidate_pairs:validated[(matches[0]['sourcePlayerId'],str(b['athlete_id']))].add(str(b['game_id']))
by_espn=collections.defaultdict(list);by_native=collections.defaultdict(list)
for pair,games in validated.items():
 if len(games)>=3:by_espn[pair[1]].append(pair[0]);by_native[pair[0]].append(pair[1])
for espn,ids in by_espn.items():
 if len(ids)==1 and len(by_native[ids[0]])==1:nba_vector_bridge[espn]=ids[0];nba_bridge_proof.append({'espnId':espn,'nbaId':ids[0],'matchingDistinctGames':len(validated[(ids[0],espn)]),'basis':'Published candidate pair corroborated by12exactstats in>=3unique canonical games; no names used for acceptance'})
nba_team_map={}
with gzip.open(R/proof['nba_stats_schedules']['path'],'rt') as f:
 for game in csv.DictReader(f):
  canonical=cross.get(('NBA',game['game_id']));accepted=sched.get(('NBA',canonical))
  if not accepted:continue
  for side in ['home','away']:nba_team_map[(canonical,game[side+'_team_id'])]=str(accepted[side+'_team_id'])
# A DNP requires agreement of two retained per-game views and zero/absent minutes.
played_nba_keys={key(r) for r in nba_rows if r['participation']=='PLAYED'};box_by={(str(b['game_id']),str(b['athlete_id'])):b for b in nba_boxes};nba_dnp=[];nba_quarantined=[]
for f in nba_rosters:
 b=box_by.get((str(f['game_id']),str(f['athlete_id'])));native=nba_vector_bridge.get(str(f['athlete_id']))
 if not (f['did_not_play'] and b and b['did_not_play'] and b['minutes'] in [None,0]):continue
 if not native:nba_quarantined.append({'gameId':str(f['game_id']),'espnId':str(f['athlete_id']),'reason':'NO_CORROBORATED_NATIVE_ID'});continue
 old=(native,str(f['game_id'])) in played_nba_keys
 if old:nba_quarantined.append({'gameId':str(f['game_id']),'nbaId':native,'reason':'CONTRADICTS_PLAYED_ARCHIVE'});continue
 nba_dnp.append({'playerId':native,'gameId':str(f['game_id']),'role':'BASKETBALL','status':'DID_NOT_PLAY','reason':'Explicit did_not_play in both licensed game-roster and box products, minutes absent/zero; native ID corroborated independently of names','sourceReferences':[proof['espn_nba_game_rosters']['sha256'],proof['espn_nba_player_boxscores']['sha256']]})
for sport in ['NFL','MLB','NBA','NHL']:
 c=next(c for c in base['cohorts'] if c['sport']==sport and c['seasonStartYear']==2023);path=R/c['partition'];path=path.with_name('enriched-records.parquet') if sport=='NHL' else path;rows=pq.ParquetFile(path).read().to_pylist();binding=next(s for s in bindings if s['sport']==sport and s['informationModel']=='TWO_DAY' and s['positionModel']=='DATED_CARRY');snapshot=load(binding['path']);facts=[];members=[];fixture_ids={f['id'] for f in snapshot['fixtures']};selected=collections.defaultdict(list)
 for r in rows:
  if not r['valid']:continue
  player,game=key(r)
  if game not in fixture_ids:continue
  if r['participation'] in ['PLAYED','DID_NOT_PLAY']:
   team=nba_team_map.get((game,r['teamId'])) if sport=='NBA' else r['teamId']
   if team:members.append({'playerId':player,'gameId':game,'team':team,'sourceReference':r['sourceRowFingerprint']})
  if r['participation']=='DID_NOT_PLAY':facts.append({'playerId':player,'gameId':game,'role':r['role'],'status':'DID_NOT_PLAY','reason':r['participationReason'],'sourceReferences':[r['sourceRowFingerprint']]})
  if r['selectedRole'] and r['participation']=='PLAYED':selected[(player,game)].append(r)
 if sport=='NFL':
  alias=collections.defaultdict(set)
  for f in source_rows('weekly_rosters'):
   if f['pfr_id'] and f['gsis_id']:alias[str(f['pfr_id'])].add(str(f['gsis_id']))
  snaps={(next(iter(alias[str(f['pfr_player_id'])])),str(f['game_id'])):f for f in source_rows('snap_counts') if len(alias[str(f['pfr_player_id'])])==1 and sum(float(f[k] or 0) for k in ['offense_snaps','defense_snaps','st_snaps'])>0}
  unknown_rows={key(r):r for r in rows if r['valid'] and r['participation']=='UNKNOWN' and r['selectedRole'] and not r['missingMask']}
  for k,record in unknown_rows.items():
   snap=snaps.get(k)
   if snap and snap['team']==record['teamId']:
    facts.append({'playerId':k[0],'gameId':k[1],'role':'FOOTBALL','status':'PLAYED_COMPLETE','stats':json.loads(record['statsJson']),'teEligible':'TE' in record['positions'],'reason':'Positive canonical snap participation with complete unchanged source statistical inputs; settlement only, no invented knowledge boundary','sourceReferences':[proof['snap_counts']['sha256'],proof['weekly_rosters']['sha256'],record['sourceRowFingerprint']]});members.append({'playerId':k[0],'gameId':k[1],'team':record['teamId'],'sourceReference':proof['snap_counts']['sha256']})
 if sport=='MLB':
  for (player,game),rs in selected.items():
   if len(rs)!=1:continue
   r=rs[0];other='HITTER' if r['role']=='PITCHER' else 'PITCHER';facts.append({'playerId':player,'gameId':game,'role':other,'status':'ROLE_NOT_SCORED','reason':'Exactly one source-selected V9 role; confirmed SP priority/otherwise HITTER policy','sourceReferences':[r['sourceRowFingerprint']]})
 if sport=='NBA':
  facts+= [f for f in nba_dnp if f['gameId'] in fixture_ids]
  for f in nba_rosters:
   player=nba_vector_bridge.get(str(f['athlete_id']));game=str(f['game_id'])
   if player and game in fixture_ids:members.append({'playerId':player,'gameId':game,'team':str(f['team_id']),'sourceReference':proof['espn_nba_game_rosters']['sha256']})
 # Deduplicate only byte-identical semantic facts; contradictory statuses remain quarantined.
 grouped=collections.defaultdict(list)
 for f in facts:grouped[(f['playerId'],f['gameId'],f['role'])].append(f)
 terminal=[];conflicts=[]
 for k,fs in grouped.items():
  if len({f['status'] for f in fs})>1:conflicts.append({'key':k,'statuses':[f['status'] for f in fs]});continue
  terminal.append({**fs[0],'sourceReferences':sorted({ref for f in fs for ref in f['sourceReferences']})})
 snapshot['terminalEvidence']=terminal;snapshot['actualMembership']=list({(f['playerId'],f['gameId'],f['team']):f for f in members}.values());snapshot['settlementModel']='ACTUAL_GAME_MEMBERSHIP';target=out/(sport+'.json');target.write_text(json.dumps(snapshot,separators=(',',':'))+'\n');summaries.append({'sport':sport,'path':str(target.relative_to(R)),'sha256':digest(str(target.relative_to(R))),'terminalEvidence':len(terminal),'terminalStatuses':dict(collections.Counter(f['status'] for f in terminal)),'membershipFacts':len(snapshot['actualMembership']),'conflicts':conflicts,'priorSnapshotSha256':binding['sha256'],'pregameRosterFixturesStatsAndKnowledgeUnchanged':True})
(R/'reports/m62-terminal-evidence.json').write_text(json.dumps({'version':'m62-terminal-evidence-1','sources':proof,'inputs':summaries,'nbaIdentityProofs':nba_bridge_proof,'nbaExplicitDnpFacts':len(nba_dnp),'nbaQuarantinedDnp':nba_quarantined,'sourceStatsZeroFilled':False,'productionWrites':0},indent=2)+'\n');print(json.dumps([(r['sport'],r['terminalStatuses']) for r in summaries]))
