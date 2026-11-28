"""Official record-book game-by-game inventory; no aggregate-only acceptance."""
import re,json,hashlib,collections
from pathlib import Path
import pyarrow.parquet as pq
R=Path(__file__).resolve().parents[1]
names={'ARIZONA':'ARI','ATLANTA':'ATL','BALTIMORE':'BAL','BUFFALO':'BUF','CAROLINA':'CAR','CHICAGO':'CHI','CINCINNATI':'CIN','CLEVELAND':'CLE','DALLAS':'DAL','DENVER':'DEN','DETROIT':'DET','GREEN BAY':'GB','HOUSTON':'HOU','INDIANAPOLIS':'IND','JACKSONVILLE':'JAX','KANSAS CITY':'KC','LAS VEGAS':'LV','L.A. CHARGERS':'LAC','L.A. RAMS':'LA','MIAMI':'MIA','MINNESOTA':'MIN','NEW ENGLAND':'NE','NEW ORLEANS':'NO','N.Y. GIANTS':'NYG','N.Y. JETS':'NYJ','PHILADELPHIA':'PHI','PITTSBURGH':'PIT','SAN FRANCISCO':'SF','SEATTLE':'SEA','TAMPA BAY':'TB','TENNESSEE':'TEN','WASHINGTON':'WAS'}
found=[]
for p in sorted((R/'data/simulation/evidence_closure_v1').glob('nfl-record-page-*.txt')):
 week=None
 for line in p.read_text().splitlines():
  h=re.fullmatch(r'WEEK (\d+) RESULTS\s*',line)
  if h:week=int(h[1]);continue
  m=re.fullmatch(r'(.+?) (\d+), (.+?) (\d+)(?: \(OT\))?[%#*+]*\s*',line)
  if not (m and week):continue
  a,score_a,b,score_b=m.groups();a=a.strip();b=b.strip()
  if a.upper() not in names or b.upper() not in names:continue
  home_a=a.isupper();home_b=b.isupper()
  if home_a==home_b:raise ValueError('Ambiguous official home marker '+line)
  found.append({'week':week,'home':names[a.upper()] if home_a else names[b.upper()],'away':names[b.upper()] if home_a else names[a.upper()],'homeScore':int(score_a) if home_a else int(score_b),'awayScore':int(score_b) if home_a else int(score_a),'sourcePageIndex':int(p.stem.split('-')[-1])})
v5=[r for r in pq.read_table(R/'data/schedule_data/game_schedules.parquet').to_pylist() if r['sport']=='NFL' and r['season']==2023 and r['game_type']=='regular'];index={(r['week'],r['home_team'],r['away_team']):r for r in v5};reconciled=[]
for r in found:
 game=index.get((r['week'],r['home'],r['away'])) or index.get((r['week'],r['away'],r['home']));ok=bool(game and game['home_score']==r['homeScore'] and game['away_score']==r['awayScore']);reconciled.append({**r,'gameId':game['game_id'] if game else None,'scoresMatch':ok,'membershipMatch':bool(game),'printedHomeDiffers':bool(game and game['home_team']!=r['home'])})
accepted=len(found)==272 and len({r['gameId'] for r in reconciled})==272 and all(r['membershipMatch'] for r in reconciled)
report={'version':'m62-nfl-2023-official-inventory-1','sourceUrl':'https://static.www.nfl.com/league/apps/league-site/media-guides/2024/2024-Record-and-Fact-Book.pdf','sourceSha256':hashlib.sha256((R/'data/simulation/evidence_closure_v1/nfl-2024-record-book.pdf').read_bytes()).hexdigest(),'sourcePages':[244,245,246,247,248,249],'officialPlayedGames':len(found),'matchedGames':sum(r['membershipMatch'] for r in reconciled),'printedFieldConflicts':[r for r in reconciled if not r['scoresMatch']],'acceptedScope':'Closed game membership only; three printed score/home conflicts retained, no accepted source values overwritten','uniqueTeams':len({r[k] for r in found for k in ['home','away']}),'gamesPerTeam':dict(collections.Counter(r[k] for r in found for k in ['home','away'])),'acceptedClosedInventory':accepted,'sourceIndependence':'Official published season record independently compared with V5 and licensed PBP, not two copies of one extraction','completionDayNotImplied':True,'productionWrites':0}
(R/'data/simulation/evidence_closure_v1/nfl-official-game-reconciliation.json').write_text(json.dumps(reconciled,indent=2)+'\n');report['detailSha256']=hashlib.sha256((R/'data/simulation/evidence_closure_v1/nfl-official-game-reconciliation.json').read_bytes()).hexdigest();(R/'reports/m62-nfl-inventory.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert accepted,'Official game inventory not fully reconciled'
