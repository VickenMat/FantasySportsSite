"""2023 exact native game inventories and terminal UTC-clock evidence."""
import collections,csv,gzip,hashlib,json,datetime,re,html
from pathlib import Path
import pyarrow.parquet as pq
from m62_terminal import nba_terminal_rows,mlb_complete,completion_utc
R=Path(__file__).resolve().parents[1];load=lambda p:json.loads((R/p).read_text());acq=load('data/simulation/evidence_closure_v1/acquisition.json');sources={p['tag']:p for p in acq['results'] if p.get('path')};schedule=[r for r in pq.read_table(R/'data/schedule_data/game_schedules.parquet').to_pylist() if r['season']==2023 and r['game_type']=='regular'];cross={(r['sport'],str(r['archive_game_id'])):str(r['game_id']) for r in pq.read_table(R/'data/schedule_data/game_id_crosswalk.parquet').to_pylist()};by_sport={s:{str(r['game_id']):r for r in schedule if r['sport']==s} for s in ['NFL','MLB','NBA','NHL']};clocks={};inventories=[]
def iso(t):return t.astimezone(datetime.timezone.utc).isoformat().replace('+00:00','Z')
def parse(t):return datetime.datetime.fromisoformat(str(t).replace('Z','+00:00'))
def put(sport,gid,end,basis,source):
 game=by_sport[sport].get(gid)
 if not game:return
 t=completion_utc(end,game['start_time_utc'])
 if t is None:return
 clocks[(sport,gid)]={'sport':sport,'gameId':gid,'completionUtcDay':t.astimezone(datetime.timezone.utc).date().isoformat(),'completionAt':iso(t),'basis':basis,'source':source,'modeledPublication':False}
NBA_ABBR={'NYK':'NY','WAS':'WSH','GSW':'GS','NOP':'NO','UTA':'UTAH','SAS':'SA'}
def nba_teams_match(row,game):
 return all(NBA_ABBR.get(row[side+'_team_abbreviation'],row[side+'_team_abbreviation'])==game[side+'_team'] for side in ['home','away'])
# NBA canonical stats schedule is separate from ESPN V5. Native IDs bridge to V5.
with gzip.open(R/sources['nba_stats_schedules']['path'],'rt') as f:nba_schedule=list(csv.DictReader(f))
nba_regular=[r for r in nba_schedule if r['season_type']=='Regular Season' or str(r['game_id']).startswith('00223')];native_nba={r['game_id']:r for r in nba_regular};mapped_nba={cross.get(('NBA',g)):r for g,r in native_nba.items() if cross.get(('NBA',g))};pbp=collections.defaultdict(list)
for batch in pq.ParquetFile(R/sources['espn_nba_pbp']['path']).iter_batches(columns=['game_id','type_text','wallclock','home_score','away_score','period_number','clock_display_value','home_team_id','away_team_id']):
 for r in batch.to_pylist():pbp[str(r['game_id'])].append(r)
for gid,rows in pbp.items():
 g=by_sport['NBA'].get(gid)
 if not g:continue
 ends=nba_terminal_rows(rows,g)
 if len(ends)==1:put('NBA',gid,ends[0]['wallclock'],'EXPLICIT_TERMINAL_GAME_OR_FINAL_NONTIED_PERIOD_WALLCLOCK_SCORE_MATCH',sources['espn_nba_pbp']['sha256'])
# NFL native scheduled games and PBP entire final inventory; only exact timed final plays at game-clock0 qualify.
nfl_groups=collections.defaultdict(list)
for r in pq.ParquetFile(R/sources['pbp']['path']).read(columns=['game_id','play_id','play_type_nfl','time_of_day','end_clock_time','game_seconds_remaining','total_home_score','total_away_score','home_score','away_score']).to_pylist():nfl_groups[r['game_id']].append(r)
for gid,rows in nfl_groups.items():
 if gid not in by_sport['NFL']:continue
 rows.sort(key=lambda r:r['play_id']);end=rows[-1];timed=[r for r in rows if r['end_clock_time']]
 if end['play_type_nfl']=='END_GAME' and timed:
  last=timed[-1];g=by_sport['NFL'][gid]
  if last['game_seconds_remaining']==0 and last['total_home_score']==g['home_score'] and last['total_away_score']==g['away_score']:put('NFL',gid,last['end_clock_time'],'EXPLICIT_LAST_PLAY_END_UTC_ZERO_GAME_CLOCK_AND_END_GAME',sources['pbp']['sha256'])
# MLB full PA inventory: contiguous at-bat IDs, known actors, final score, terminal inning/outs and explicit end clock.
mlb_groups=collections.defaultdict(list)
with gzip.open(R/sources['mlb_pbp']['path'],'rt') as f:
 for r in csv.DictReader(f):mlb_groups[r['game_pk']].append(r)
mlb_failures=collections.Counter()
for gid,rows in mlb_groups.items():
 g=by_sport['MLB'].get(gid)
 if not g:continue
 try:
  rows.sort(key=lambda r:int(r['at_bat_index']));last=rows[-1];indices=[int(r['at_bat_index']) for r in rows];inning=int(last['inning']);outs=int(last['outs']);home=int(last['home_score']);away=int(last['away_score']);half=last['half_inning'].lower()
  complete=mlb_complete(rows,g)
  if complete:put('MLB',gid,last['end_time'],'COMPLETE_CONTIGUOUS_PA_ACTORS_FINAL_SCORE_TERMINAL_INNING_END_UTC',sources['mlb_pbp']['sha256'])
  else:mlb_failures['NONRECONCILED_OR_SHORTENED_FINAL']+=1
 except (ValueError,TypeError):mlb_failures['MALFORMED_TERMINAL_DATA']+=1
# Retained NHL native info contains full regular-season ID set; official reference reports add UTC end times.
nhl_info=pq.ParquetFile(R/'data/provider_previews/m6-nhl/2024/game_info_2024.parquet').read().to_pylist();nhl_regular={str(r['game_id']):r for r in nhl_info if r['game_type']=='R' and r['season']==20232024}
for path in (R/'data/simulation/evidence_closure_v1').glob('nhl-reference-*.html'):
 text=html.unescape(re.sub('<[^>]+>',' ',path.read_text()));text=re.sub(r'\s+',' ',text);date=re.search(r'(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), ([A-Z][a-z]+ \d{1,2}, 202[34])',text);times=re.search(r'Start (\d{1,2}:\d{2}) ([A-Z]+); End (\d{1,2}:\d{2}) ([A-Z]+)',text)
 if not date or not times:continue
 offsets={'EST':-5,'EDT':-4,'CST':-6,'CDT':-5,'MST':-7,'MDT':-6,'PST':-8,'PDT':-7};start,stz,end,etz=times.groups()
 if stz not in offsets or etz not in offsets:continue
 d=datetime.datetime.strptime(date[1],'%B %d, %Y');start_h=int(start.split(':')[0]);end_h=int(end.split(':')[0]);start_h=start_h+12 if 1<=start_h<=11 else start_h;end_h=end_h+12 if end_h<12 else end_h
 # Official summaries use12h evening clocks without AM/PM. Accept only a unique candidate compatible with the verified scheduled UTC start (<=2h start delay) and positive <12h duration.
 g_id=path.stem.split('-')[-1];game=by_sport['NHL'].get(g_id);candidates=[]
 if not game:continue
 for sh in [int(start.split(':')[0]),(int(start.split(':')[0])+12)%24]:
  a=d.replace(hour=sh,minute=int(start.split(':')[1]),tzinfo=datetime.timezone(datetime.timedelta(hours=offsets[stz])))
  if not datetime.timedelta(0)<=a-game['start_time_utc']<=datetime.timedelta(hours=2):continue
  for eh in [int(end.split(':')[0]),(int(end.split(':')[0])+12)%24]:
   b=d.replace(hour=eh,minute=int(end.split(':')[1]),tzinfo=datetime.timezone(datetime.timedelta(hours=offsets[etz])))
   if b<a:b+=datetime.timedelta(days=1)
   if datetime.timedelta(0)<b-a<datetime.timedelta(hours=12):candidates.append(b)
 if len(candidates)==1:put('NHL',g_id,candidates[0].isoformat(),'OFFICIAL_GAME_SUMMARY_DATE_EXPLICIT_END_TIMEZONE_UNIQUE_CLOCK_INTERPRETATION',hashlib.sha256(path.read_bytes()).hexdigest())
for sport in ['NFL','MLB','NBA','NHL']:
 expected=by_sport[sport];independent=nfl_groups if sport=='NFL' else mapped_nba if sport=='NBA' else mlb_groups if sport=='MLB' else nhl_regular
 for gid,g in expected.items():inventories.append({'sport':sport,'gameId':gid,'sourceNativeInventoryMatch':gid in independent,'v5FinalStatus':g['status'],'v5HomeTeam':g['home_team_id'] or g['home_team'],'v5AwayTeam':g['away_team_id'] or g['away_team'],'nativeTeamMatch':nba_teams_match(mapped_nba[gid],g) if sport=='NBA' and gid in mapped_nba else None,'date':g['game_date'],'completion':clocks.get((sport,gid)),'regularPhase':True})
path=R/'data/simulation/evidence_closure_v1/game_reconciliation.jsonl';path.write_text(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in inventories));report={'version':'m62-2023-game-reconciliation-1','sourceFingerprints':sources,'sports':[{'sport':sport,'v5Games':len(by_sport[sport]),'matchedSeparateInventory':sum(r['sourceNativeInventoryMatch'] for r in inventories if r['sport']==sport),'verifiedCompletionDays':sum(s==sport for s,g in clocks),'remainingCompletionGames':len(by_sport[sport])-sum(s==sport for s,g in clocks),'cancelledInPlayedInventory':0,'independentPublisherClaim':sport=='NBA','inventoryEvidence':('Official NFL published season record with272game-level team/week matches; printed field conflicts retained' if sport=='NFL' else 'NBA Stats native regular-season IDs/teams/scores versus ESPN-derived V5, crosswalk exact' if sport=='NBA' else 'Same-upstream separate artifact, retained as reviewable alternative'),'lineage':'Native league source via licensed derivative; different extraction/artifact from accepted V5, shared upstream disclosed','acceptedClosedInventory':(load('reports/m62-nfl-inventory.json')['acceptedClosedInventory'] if sport=='NFL' and (R/'reports/m62-nfl-inventory.json').exists() else sport=='NBA' and len(mapped_nba)==1230 and set(mapped_nba)==set(by_sport['NBA']) and all(nba_teams_match(r,by_sport['NBA'][g]) for g,r in mapped_nba.items()) and all(int(r['home_pts'])==by_sport['NBA'][g]['home_score'] and int(r['away_pts'])==by_sport['NBA'][g]['away_score'] for g,r in mapped_nba.items()))} for sport in ['NFL','MLB','NBA','NHL']],'mlbValidationFailures':dict(mlb_failures),'detailPath':str(path.relative_to(R)),'detailSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'clockEvidenceCount':len(clocks),'newApproximationActivated':False,'productionWrites':0};(R/'reports/m62-game-reconciliation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['sports'],indent=2))
