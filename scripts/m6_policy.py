"""Approved offline D1–D6 primitives. Modeled time never means publication."""
from datetime import datetime, timedelta, timezone
UTC = timezone.utc
DAY = timedelta(days=1)
SPORTS = ['NFL', 'MLB', 'NBA', 'NHL']
SEED_GROUPS = {'development': list(range(11, 31)), 'validation': list(range(31, 51)), 'holdout': list(range(51, 71))}
def parse_time(value):
    result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Explicit timezone required')
    return result.astimezone(UTC)
def iso(value):
    return value.astimezone(UTC).isoformat().replace('+00:00', 'Z')
def knowledge_boundary(completion_day, *, completion=None, model='TWO_DAY', exceptional=False, resumed_completion_day=None):
    if exceptional and not resumed_completion_day:
        return None
    selected_day = resumed_completion_day or completion_day
    if not selected_day:
        return None
    date = datetime.fromisoformat(selected_day).replace(tzinfo=UTC, hour=0, minute=0, second=0, microsecond=0)
    floor = date + 2 * DAY
    if completion:
        actual = parse_time(completion)
        # D is the later verified UTC completion day, never the original scheduled date.
        floor = max(floor, actual.replace(hour=0, minute=0, second=0, microsecond=0) + 2 * DAY)
    if model == 'WEEKLY':
        # First Wednesday 12:00 UTC not earlier than the two-day safety floor.
        weekly = floor.replace(hour=12) + timedelta(days=(2-floor.weekday()) % 7)
        if weekly < floor:
            weekly += 7 * DAY
        return iso(weekly)
    if model != 'TWO_DAY':
        raise ValueError('Unknown information model')
    return iso(floor)
def bench_allocation(seed):
    group = next((values for values in SEED_GROUPS.values() if seed in values), None)
    if group is None:
        raise ValueError('Seed was not preregistered')
    return {sport: 1 + (index == (seed-group[0]) % 4) for index, sport in enumerate(SPORTS)}
def nba_positions(codes):
    granular = {'PG','SG','SF','PF','C'}
    direct = sorted(set(codes) & granular)
    # C alongside a family (C-F) is expanded by the normalized preparation layer.
    if direct:
        return direct
    families = {'G':['PG','SG'], 'F':['SF','PF'], 'G-F':['PG','SG','SF','PF'], 'F-G':['PG','SG','SF','PF'], 'F-C':['SF','PF','C'], 'C-F':['SF','PF','C']}
    return sorted({p for c in codes for p in families.get(c,[])})
def position_facts(row, model='DATED_CARRY', prior=False):
    """Return applicable supported codes, never a target season-end MLB list."""
    sport = row['sport']
    if sport == 'MLB':
        proof = __import__('json').loads(row.get('positionProvenanceJson') or 'null') or {}
        evidence = proof.get('currentSeason') if prior else proof.get('priorSeasonCarry')
        if not evidence or evidence.get('status') != 'RECORDED_THRESHOLD_SUPPORTED':
            return []
        return sorted(evidence.get('positions', []))
    if sport == 'NBA':
        proof = __import__('json').loads(row.get('positionProvenanceJson') or 'null') or {}
        if not prior and not (proof.get('knownAt') and proof.get('effectiveAt')):
            return []
        estimated = row['positionClass'] == 'HISTORICAL_ESTIMATED'
        if estimated and not (model == 'PRIOR_ESTIMATE' and prior):
            return []
        if not prior and estimated:
            return []
        return nba_positions(row['positions'])
    allowed = {'QB','RB','WR','TE'} if sport == 'NFL' else {'C','LW','RW','F','D','G'}
    return sorted(set(row['positions']) & allowed)

def retime_fact(fact, model):
    """Batch knowledge without erasing the order of underlying observations."""
    copied = dict(fact)
    source_day = (parse_time(fact['knownAt'])-2*DAY).date().isoformat()
    copied['knownAt'] = knowledge_boundary(source_day, model=model)
    return copied
