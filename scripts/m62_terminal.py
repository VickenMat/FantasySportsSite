import datetime

def completion_utc(end, scheduled):
    try:
        actual=datetime.datetime.fromisoformat(str(end).replace("Z","+00:00"))
    except (ValueError,TypeError):
        return None
    if not actual.tzinfo or actual < scheduled:
        return None
    return actual.astimezone(datetime.timezone.utc)

"""Strict terminal-event predicates; never infer unknown completion from a schedule."""
def nba_terminal_rows(rows, game):
    def final(r):
        return (r['wallclock'] and r['clock_display_value'] in ['0:0.0','0:00','00:00']
                and r['period_number'] >= 4 and r['home_score'] == game['home_score']
                and r['away_score'] == game['away_score'])
    ends = [r for r in rows if r['type_text'] == 'End Game' and final(r)]
    if not ends:
        period = max((r['period_number'] for r in rows), default=0)
        ends = [r for r in rows if r['type_text'] == 'End Period' and final(r)
                and r['period_number'] == period and r['home_score'] != r['away_score']]
    return ends if len(ends) == 1 else []

def mlb_complete(rows, game):
    """Rows are sorted by PA index; shortened finals need separate call-time proof."""
    if not rows:
        return False
    last = rows[-1]
    indices = [int(r['at_bat_index']) for r in rows]
    inning, outs = int(last['inning']), int(last['outs'])
    home, away = int(last['home_score']), int(last['away_score'])
    half = last['half_inning'].lower()
    return (indices == list(range(len(rows))) and all(r['batter_id'] and r['pitcher_id'] for r in rows)
            and home == game['home_score'] and away == game['away_score'] and inning >= 9
            and ((half == 'top' and outs == 3 and home > away)
                 or (half == 'bottom' and (outs == 3 and away > home or home > away))))
