"""Versioned offline D1–D6 compilation, inventory and uncertainty audit.

Strict publication and the frozen 55 partitions are never rewritten. The
optional diagnostic snapshots use a deliberately labeled source-date/calendar
control; unknown completion UTC days prevent PRIMARY acceptance.
"""
import argparse, collections, gc, hashlib, json, time
from pathlib import Path
from datetime import datetime, timedelta, timezone
import pyarrow.parquet as pq
from m6_policy import knowledge_boundary, parse_time, iso, position_facts, SPORTS, retime_fact
ROOT = Path(__file__).resolve().parents[1]
def load(path): return json.loads((ROOT/path).read_text())
def sha(path): return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
def fp(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def write(path,value):
    p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,indent=2)+'\n')
def latest_facts(rows, year, model):
    result={}
    season_close=max((parse_time(r['scheduledStartsAt']).date().isoformat() for r in rows if r['scheduledStartsAt']),default=None)
    for r in sorted(rows,key=lambda r:(r['scheduledStartsAt'] or '',r['sourceGameId'] or '',r['sourceRow'])):
        if not r['valid'] or not r['teamId'] or not r['scheduledStartsAt']:continue
        date=parse_time(r['scheduledStartsAt']).date().isoformat()
        known=knowledge_boundary(season_close if r['sport'] in ['MLB','NBA'] else date)
        codes=position_facts(r,model,prior=True)
        # Aggregate prior-season evidence may carry, but only after season close below.
        result[r['sourcePlayerId']]={'playerId':r['sourcePlayerId'],'team':r['teamId'],'positions':codes,'active':True,'effectiveAt':known,'knownAt':known}
    return result
args=argparse.ArgumentParser();args.add_argument('--snapshot-year',type=int,default=2023);a=args.parse_args()
if a.snapshot_year not in [2016,2017,2018,2021,2022,2023,2024]:raise ValueError('Only preregistered non-holdout target cycles')
started_at=time.perf_counter();transforms={p:sha(p) for p in ['scripts/prepare-m61-history.py','scripts/m6_policy.py']};
method=load('reports/m61-approved-methodology.json');base=load('reports/m6-historical-readiness.json');strict=load('reports/m6-simulation-gate-audit.json');pack=load('reports/m6-dataset-package.json');resolved_report=load('reports/m6-nhl-conflict-resolution.json');thresholds=load('data/simulation/position_enrichment/pitching_day_thresholds.json')['thresholds']
schedule_rows=pq.read_table(ROOT/'data/schedule_data/game_schedules.parquet').to_pylist();schedule={(r['sport'],str(r['game_id'])):r for r in schedule_rows};cross={(r['sport'],str(r['archive_game_id'])):str(r['game_id']) for r in pq.read_table(ROOT/'data/schedule_data/game_id_crosswalk.parquet').to_pylist()}
resolved={}
for proof in resolved_report['seasons']:
    if sha(proof['overlay'])!=proof['overlaySha256']:raise ValueError('Resolution changed')
    for r in map(json.loads,(ROOT/proof['overlay']).open()):resolved[(r['seasonStartYear'],r['sourceRow'])]=r
inventory=[];coverage=[];gates=[];uncertainty=[];snapshot_bindings=[];raw_nhl={};nba_team_alias={};nba_alias_conflicts=[];nba_alias_blocked=set()
nba_path=next(r['path'] for r in base['inputs'] if r['path'].startswith('data/player_data/nba'))
for batch in pq.ParquetFile(ROOT/nba_path).iter_batches(columns=['GAME_ID','TEAM_ID','MATCHUP']):
    for raw in batch.to_pylist():
        game=schedule.get(('NBA',cross.get(('NBA',str(raw['GAME_ID'])))))
        if not game:continue
        side='home_team_id' if 'vs.' in str(raw['MATCHUP']) else 'away_team_id' if '@' in str(raw['MATCHUP']) else None
        if side:
            key=(game['season'],str(raw['TEAM_ID']));alias=str(game[side]);old=nba_team_alias.get(key)
            if old is not None and old!=alias:
                nba_alias_conflicts.append({'season':game['season'],'nativeTeam':str(raw['TEAM_ID']),'game':str(raw['GAME_ID']),'previous':old,'new':alias});nba_alias_blocked.add(key)
            nba_team_alias[key]=alias
# Native starter is prior performance information only after modeled knowledge.
nhl_path=next(r['path'] for r in base['inputs'] if r['path'].startswith('data/player_data/nhl'))
for batch in pq.ParquetFile(ROOT/nhl_path).iter_batches(columns=['game_id','player_id','starter']):
    for r in batch.to_pylist():
        if r['starter'] is not None:raw_nhl[(str(r['game_id']),str(r['player_id']))]=r['starter']
for key in nba_alias_blocked:nba_team_alias.pop(key,None)
write('reports/m61-nba-team-bridge.json',{'version':'m61-native-game-side-team-bridge-1','conflicts':nba_alias_conflicts,'blockedTeamSeasons':len(nba_alias_blocked),'sourceNativeMatchupOrientation':True,'arbitraryResolution':False})
for sport in SPORTS:
    previous=[];previous_year=None
    for c in [v for v in base['cohorts'] if v['sport']==sport]:
        year=c['seasonStartYear'];path=c['partition'];expected=c['partitionSha256']
        if sport=='NHL':
            bind=next(v for v in pack['cohorts'] if v['seasonStartYear']==year);path=bind['parentEnrichedPartition'];expected=bind['parentEnrichedPartitionSha256']
        if sha(path)!=expected:raise ValueError('Frozen historical bytes changed')
        rows=pq.ParquetFile(ROOT/path).read().to_pylist()
        for r in rows:
            if sport=='NHL' and (year,r['sourceRow']) in resolved:
                d=resolved[(year,r['sourceRow'])];r.update(enrichedStatsJson=json.dumps(d['resolvedStats']),enrichedMissingMask=d['missingStats'],enrichedPointsTenths=d['pointsTenths'],enrichmentConflictFields=[])
        current_schedule=[r for r in schedule_rows if r['sport']==sport and r['season']==year and r['game_type']=='regular']
        archive_games={cross.get((sport,r['sourceGameId'])) for r in rows if r['sourceGameId']};archive_games.discard(None)
        source_games={str(r['game_id']) for r in current_schedule};final_games={str(r['game_id']) for r in current_schedule if r['status'] in ['Final','OFF','final_score_present','Completed Early']}
        native_ids={r['sourceGameId'] for r in rows if r['sourceGameId']};native_info=None
        if sport=='NHL':
            info_path=f'data/provider_previews/m6-nhl/{year+1}/game_info_{year+1}.parquet'
            if (ROOT/info_path).exists():
                info=[r for r in pq.ParquetFile(ROOT/info_path).read().to_pylist() if str(r['game_type']) in ['R','2'] and int(r['season'])//10000==year]
                ids={str(r['game_id']) for r in info};native_info={'path':info_path,'sha256':sha(info_path),'games':len(ids),'missingFromArchive':sorted(ids-native_ids),'missingFromInfo':sorted(native_ids-ids),'sameOfficialUpstreamLineage':True,'independentPublisher':False}
        inventory.append({'sport':sport,'year':year,'seasonLabel':str(year) if sport in ['NFL','MLB'] else f'{year}–{year+1}','archiveNativeGames':len(native_ids),'v5ObservedGames':len(source_games),'playedFinalV5Games':len(final_games),'v5GamesMissingStatistics':sorted(final_games-archive_games),'archiveGamesNotInV5':sorted(archive_games-source_games),'acceptedFourNbaCrosswalkLimitations':c['uniqueCanonicalGames']-c['matchedGames'] if sport=='NBA' else 0,'sourceTeams':len({str(r[k]) for r in current_schedule for k in ['home_team','away_team']}),'observedRegularSeasonBoundaries':[min((r['game_date'] for r in current_schedule),default=None),max((r['game_date'] for r in current_schedule),default=None)],'statusCounts':dict(collections.Counter(str(r['status']) for r in current_schedule)),'nativeInfoComparison':native_info,'independentlyVerifiedClosedInventory':False,'expectedGames':None,'cancelled':sum(r['status']=='Cancelled' for r in current_schedule),'suspensionsAndResumptionsVerified':False,'duplicateV5Ids':len(current_schedule)-len(source_games),'sourceClosure':'RECONCILED_V5_ARCHIVE_AND_RETAINED_NATIVE_INFO_REQUIRES_REVIEW','accepted':False,'exclusionReasons':(['SEALED_HOLDOUT'] if year==2025 else ['COVID_CROSS_SPORT_COMPARABILITY'] if year in [2019,2020] else ['PARTIAL_CURRENT'] if year==2026 else ['CLOSED_INVENTORY_NOT_INDEPENDENTLY_VERIFIED'])+['COMPLETION_UTC_DAYS_NOT_RETAINED']})
        prior=previous if previous_year==year-1 else []
        draft_candidates=[parse_time(r['start_time_utc']) for r in current_schedule if r['start_time_utc'] is not None]
        draft_at=min(draft_candidates)-timedelta(days=7) if draft_candidates else datetime(year,1,1,tzinfo=timezone.utc)
        model_metrics={};snapshots={}
        for position_model in ['DATED_CARRY','PRIOR_ESTIMATE']:
            prior_latest=latest_facts(prior,year,position_model);preseason={p:f for p,f in prior_latest.items() if parse_time(f['knownAt'])<draft_at}
            position_counts=collections.Counter(code for f in preseason.values() for code in f['positions']);facts=list(preseason.values());positions=[]
            # Prior-season threshold lists apply following year only. No current MLB season-end grant.
            for t in thresholds:
                if sport=='MLB' and t['seasonStartYear']==year-1:
                    p=t['sourcePlayerId']
                    if p in preseason and t['position'] not in preseason[p]['positions']:preseason[p]['positions'].append(t['position'])
            dated_players=set();family_players=set();estimated_players=set();eligible_rows=0;players=set();independent=collections.Counter();steps=[0]*11;missing_by_position=collections.defaultdict(collections.Counter);prior_observed_keys=set(preseason)
            for r in rows:
                p=r['sourcePlayerId'];player_codes=set(preseason.get(p,{}).get('positions',[]));current_codes=position_facts(r,position_model)
                if r['scheduledStartsAt'] and r['valid'] and r['teamId']:
                    known=knowledge_boundary(parse_time(r['scheduledStartsAt']).date().isoformat());facts.append({'playerId':p,'team':r['teamId'],'positions':sorted(player_codes|set(current_codes)),'active':bool(r['teamId']),'effectiveAt':known,'knownAt':known});dated_players.add(p)

                if r['positionClass']=='FAMILY_DERIVED':family_players.add(p)
                if r['positionClass']=='HISTORICAL_ESTIMATED':estimated_players.add(p)
                player_codes.update(current_codes)
                mask=r.get('enrichedMissingMask',r['missingMask']);points=r.get('enrichedPointsTenths',r['baselinePointsTenths']);game=schedule.get((sport,cross.get((sport,r['sourceGameId']))));ordinary=bool(game and game['status'] in ['Final','OFF','final_score_present'] and r['scheduledStartsAt'])
                checks=[r['valid'],bool(p),bool(r['sourceGameId']),r['selectedRole'],r['participation']=='PLAYED',not mask and points is not None,r['roleSelection']!='SOURCE_CONTRADICTION' and not r.get('enrichmentConflictFields'),bool(player_codes),ordinary,bool(player_codes),ordinary and bool(r['teamId'])]
                # G09 in this diagnostic is only a CANDIDATE lag; primary requires verified completion UTC day.
                running=True
                for i,ok in enumerate(checks):
                    if not ok:independent[f'G{i+1:02}']+=1
                    running=running and ok;steps[i]+=running
                if all(checks):eligible_rows+=1;players.add(p)
                for code in r['positions'] or ['UNKNOWN']:
                    missing_by_position[code].update(mask)
            # Timestamp threshold evidence, retaining recorded source day separately.
            for t in thresholds:
                if sport=='MLB' and t['seasonStartYear']==year:
                    at=knowledge_boundary(t['thresholdReachedOn']);positions.append({'playerId':t['sourcePlayerId'],'kind':'LISTED','code':t['position'],'seasonYear':year,'effectiveAt':at,'knownAt':at});dated_players.add(t['sourcePlayerId'])
            by_player={};ambiguous_fact_keys=set()
            for f in facts:
                key=(f['playerId'],f['effectiveAt'],f['knownAt']);old=by_player.get(key)
                if old and old['team']!=f['team']:ambiguous_fact_keys.add(key)
                by_player[key]=f
            for key in ambiguous_fact_keys:by_player.pop(key,None)
            facts=list(by_player.values())
            import bisect
            history=collections.defaultdict(list)
            for f in facts:history[f['playerId']].append((f['knownAt'],f['positions']))
            for p,events in history.items():events.sort(key=lambda x:x[0])
            history_times={p:[parse_time(v[0]) for v in events] for p,events in history.items()}
            position_history=collections.defaultdict(list)
            for f in positions:position_history[f['playerId']].append((f['knownAt'],f['code']))
            position_counts=collections.Counter(code for f in preseason.values() for code in f['positions'])
            steps=[0]*11;independent=collections.Counter();eligible_rows=0;players=set()
            for r in rows:
                at=r['scheduledStartsAt'];known_positions=set();events=history.get(r['sourcePlayerId'],[])
                if at and events:
                    i=bisect.bisect_left(history_times[r['sourcePlayerId']],parse_time(at))-1
                    if i>=0:known_positions.update(events[i][1])
                if at:known_positions.update(code for known,code in position_history.get(r['sourcePlayerId'],[]) if parse_time(known)<parse_time(at))
                game=schedule.get((sport,cross.get((sport,r['sourceGameId']))));ordinary=bool(game and game['status'] in ['Final','OFF','final_score_present'] and at)
                mask=r.get('enrichedMissingMask',r['missingMask']);points=r.get('enrichedPointsTenths',r['baselinePointsTenths'])
                checks=[r['valid'],bool(r['sourcePlayerId']),bool(r['sourceGameId']),r['selectedRole'],r['participation']=='PLAYED',not mask and points is not None,r['roleSelection']!='SOURCE_CONTRADICTION' and not r.get('enrichmentConflictFields'),bool(known_positions),ordinary,bool(known_positions),ordinary and bool(r['teamId'])]
                running=True
                for i,ok in enumerate(checks):
                    if not ok:independent[f'G{i+1:02}']+=1
                    running=running and ok;steps[i]+=running
                if all(checks):eligible_rows+=1;players.add(r['sourcePlayerId'])
            model_metrics[position_model]={'priorCarryPlayers':sum(bool(f['positions']) for f in preseason.values()),'datedCurrentObservationPlayers':len(dated_players),'familyEvidencePlayers':len(family_players),'estimatedEvidencePlayers':len(estimated_players),'draftDiscoveredPlayers':len(preseason),'draftEligiblePlayers':sum(bool(f['positions']) for f in preseason.values()),'draftPositions':dict(position_counts),'modeledPriorPlayers':len(set(preseason)-{v['sourcePlayerId'] for v in prior if v['selectedRole'] and v['participation']=='PLAYED' and not v.get('enrichedMissingMask',v['missingMask'])}),'candidateLagRowsNotPrimaryAccepted':eligible_rows,'candidatePlayers':len(players),'candidatePlayerSeasons':len(players),'primaryApprovedRows':0,'primaryExclusion':'No verified completion UTC days; schedule-known chronology and closed inventory not retained','independentFailures':dict(independent),'candidateWaterfall':steps,'missingByPosition':{k:dict(v) for k,v in missing_by_position.items()}}
            if year==a.snapshot_year:
                snapshots[position_model]={'roster':facts,'positions':positions,'prior':prior,'draftAt':iso(draft_at),'preseason':preseason}
        coverage.append({'sport':sport,'year':year,'models':model_metrics,'strictRows':0,'availabilityEvidence':'UNKNOWN','irEvents':0,'firstDiscoveryDelayed':True,'continuity':'Last supported observed team until superseded; stale intervals unbounded without transactions'})
        metrics=model_metrics['DATED_CARRY'];gates.append({'sport':sport,'year':year,'physicalRows':len(rows),'strictWaterfall':next(x['waterfall'] for x in strict['cohorts'] if x['sport']==sport and x['seasonStartYear']==year),'candidateModelWaterfall':metrics['candidateWaterfall'],'approvedPrimaryWaterfall':metrics['candidateWaterfall'][:8]+[0,0,0],'candidateIndependentFailures':metrics['independentFailures'],'warning':'Candidate G09/G11 use retrospective calendar dates only; never accepted modeled knowledge.'})
        if sport=='NHL':
            byplayer=collections.defaultdict(collections.Counter);byfield=collections.Counter();byplayed=collections.Counter();onlyso=0;goalies=0
            for r in rows:
                if not r['valid']:continue
                mask=r.get('enrichedMissingMask',r['missingMask']);byfield.update(mask)
                if r['participation']=='PLAYED':byplayed.update(mask)
                if r['role']=='GOALIE':goalies+=1
                if mask:
                    byplayer[r['sourcePlayerId']].update(mask)
                    onlyso+=mask==['shutout']
            uncertainty.append({'sport':sport,'year':year,'fieldMissingAllRows':dict(byfield),'fieldMissingPlayedRows':dict(byplayed),'affectedPlayers':len(byplayer),'byPlayer':{k:dict(v) for k,v in byplayer.items()},'onlyShutoutMissingRows':onlyso,'shutoutUpperTenths':byfield['shutout']*187,'shutoutLowerTenths':0,'boundScope':'Missing binary credit only, NOT total score or adaptive strategy','adaptiveStrategyBound':'NOT_PROVEN','materialityVsHalfPercent':'NOT_ESTABLISHED; unknown faceoff and participation/correction feedback can prevent finite adaptive bounds','goalieRows':goalies})
        if year==a.snapshot_year:
            for position_model,snapshot in snapshots.items():
                for information_model in ['TWO_DAY','WEEKLY']:
                    fixtures=[];fixture_ids=set();outcomes=[];all_roster=snapshot['roster'];diagnostic_notes=[]
                    for game in current_schedule:
                        if game['start_time_utc'] is None or game['status'] not in ['Final','OFF','final_score_present']:continue
                        start=parse_time(game['start_time_utc']);gid=str(game['game_id']);day=start.date().isoformat();known=knowledge_boundary(day,model=information_model)
                        fixture_ids.add(gid);fixtures.append({'id':gid,'slate':str(game['week']) if sport=='NFL' else day,'startsAt':iso(start),'knownAt':iso(draft_at-timedelta(days=1)),'finalKnownAt':known,'teams':[str(game['home_team'] if sport=='NHL' else game['home_team_id'] or game['home_team']),str(game['away_team'] if sport=='NHL' else game['away_team_id'] or game['away_team'])]})
                    native_to_schedule=lambda r:cross.get((sport,r['sourceGameId']))
                    for r in snapshot['prior']+rows:
                        if not r['valid'] or not r['selectedRole'] or r['participation'] not in ['PLAYED','DID_NOT_PLAY'] or not r['scheduledStartsAt']:continue
                        if r['roleSelection']=='SOURCE_CONTRADICTION' or r.get('enrichmentConflictFields'):continue
                        mapped=native_to_schedule(r)
                        if r['seasonStartYear']==year and mapped not in fixture_ids:continue
                        start=parse_time(r['scheduledStartsAt']);known=knowledge_boundary(start.date().isoformat(),model=information_model);stats=json.loads(r.get('enrichedStatsJson',r['statsJson']));role_evidence=json.loads(r['roleEvidenceJson']);started=raw_nhl.get((r['sourceGameId'],r['sourcePlayerId'])) if sport=='NHL' else role_evidence.get('gamesStarted')=='1' if sport=='MLB' else None
                        # playedAt orders settlement only; never used as observed physical completion.
                        o={'playerId':r['sourcePlayerId'],'gameId':mapped or r['sourceGameId'],'seasonYear':r['seasonStartYear'],'role':r['role'],'playedAt':iso(start+timedelta(milliseconds=1)),'knownAt':known,'participation':r['participation'],'stats':stats,'teEligible':'TE' in r['positions']}
                        if started is not None:o['started']=bool(started)
                        outcomes.append(o)
                    # Preserve all missing inputs; no fixture-level DNP expansion or player deletion.
                    def transform_time(t):
                        return knowledge_boundary((parse_time(t)-timedelta(days=2)).date().isoformat(),model=information_model)
                    roster=[]
                    for f in all_roster:
                        f=retime_fact(f,information_model);f['team']=nba_team_alias.get((year,f['team']),f['team']) if sport=='NBA' else f['team'];roster.append(f)
                    positions=[retime_fact(p,information_model) for p in snapshot['positions']]
                    body={'sport':sport,'year':year,'label':f'{sport} {year} source-calendar diagnostic','coverage':'UNVERIFIED','coverageReason':'Not accepted: no independent closed inventory or historical completion UTC calendar proof','draftAt':snapshot['draftAt'],'fixtures':fixtures,'roster':roster,'positions':positions,'availability':[],'outcomes':outcomes,'decisionModel':{'participation':'PRIOR_ONLY','availabilityEvidence':'UNKNOWN','informationModel':information_model,'positionModel':position_model}}
                    location=f'data/simulation/approved_model_v1/{year}/{information_model}/{position_model}/{sport}.json';write(location,body);snapshot_bindings.append({'sport':sport,'year':year,'informationModel':information_model,'positionModel':position_model,'path':location,'sha256':sha(location),'fixtures':len(fixtures),'outcomes':len(outcomes),'rosterFacts':len(roster),'positionFacts':len(positions),'classification':'SOURCE_CALENDAR_DIAGNOSTIC_NOT_PRIMARY','limitations':diagnostic_notes+['Schedule assumed known for source-calendar diagnostic only','Terminal status does not verify actual completion UTC day; two-day from scheduled UTC date is NOT approved primary chronology']})
        previous=rows;previous_year=year;gc.collect();print(f'{sport}/{year}: primary 0; candidate {metrics["candidateLagRowsNotPrimaryAccepted"]}; draft {metrics["draftEligiblePlayers"]}',flush=True)
write('reports/m61-season-inventory.json',{'version':'m61-season-inventory-1','methodologyFingerprint':method['fingerprint'],'cohorts':inventory,'independentAcceptedCohorts':0,'reconciledAlternative':'V5_ARCHIVE_NATIVE_INFO_V1','alternativeAccepted':False,'sourceV5Fingerprint':sha('data/schedule_data/game_schedules.parquet')})
write('reports/m61-position-discovery-coverage.json',{'version':'m61-position-discovery-1','cohorts':coverage,'officialPublicationPopulated':False})
write('reports/m61-approved-model-gates.json',{'version':'m61-approved-model-gates-1','strictAuditUnchanged':sha('reports/m6-simulation-gate-audit.json'),'cohorts':gates,'strictRows':0,'primaryRows':0,'candidateRows':sum(c['models']['DATED_CARRY']['candidateLagRowsNotPrimaryAccepted'] for c in coverage),'classification':'CANDIDATE_VERSUS_PRIMARY_DISTINCT'})
write('reports/m61-statistical-uncertainty.json',{'version':'m61-statistical-uncertainty-1','cohorts':uncertainty,'imputedSourceValues':0,'adaptiveGlobalBoundsProven':False})
write('reports/m61-diagnostic-selections.json',{'version':'m61-diagnostic-selections-1','snapshots':snapshot_bindings,'methodologyFingerprint':method['fingerprint'],'productionWrites':0,'frozenPartitionsChanged':False})
accepted={'version':'m61-accepted-cohorts-1','methodologyFingerprint':method['fingerprint'],'acceptedSportSeasons':[],'acceptedFourSportCycles':[],'inventoryReportSha256':sha('reports/m61-season-inventory.json'),'positionCoverageSha256':sha('reports/m61-position-discovery-coverage.json'),'uncertaintySha256':sha('reports/m61-statistical-uncertainty.json'),'rejected':inventory,'officialBaselineRunnable':False};accepted['fingerprint']=fp(accepted);write('reports/m61-accepted-cohorts.json',accepted)

if any(sha(p)!=value for p,value in transforms.items()):raise ValueError('Preparation code changed during execution')
write('reports/m61-compilation-proof.json',{'version':'m61-compilation-proof-1','transformations':transforms,'elapsedMs':(time.perf_counter()-started_at)*1000,'methodologyFingerprint':method['fingerprint'],'reports':{p:sha(p) for p in ['reports/m61-accepted-cohorts.json','reports/m61-approved-model-gates.json','reports/m61-position-discovery-coverage.json','reports/m61-statistical-uncertainty.json','reports/m61-season-inventory.json','reports/m61-diagnostic-selections.json']},'productionWrites':0})
