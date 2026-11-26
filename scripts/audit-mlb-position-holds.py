"""Local-only audit of recovered MLB position holds. No database, network, or source mutation."""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from decimal import Decimal, InvalidOperation

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/position_enrichment/mlb_position_holds_review.json'
FIELD = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
EXPECTED = {
    'data/raw/recovered/mlb_positions_repaired.csv': '7d642767b45d9e26f31778ebbf0456715d785de3ad3d274ec7bee1f07b7aec72',
    'data/raw/recovered/mlb_2016_2026_final.csv': 'a58fee138f99f825b9af9737e93cd6c512ee7ab6c43ca1fa23dffab2819211d0',
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for part in iter(lambda: source.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def integer(value):
    if value == '':
        return None
    try:
        n = Decimal(value)
        return int(n) if n.is_finite() and n == int(n) and n >= 0 else None
    except (InvalidOperation, ValueError, OverflowError):
        return None


for path, expected in EXPECTED.items():
    if digest(ROOT / path) != expected:
        raise RuntimeError(f'Immutable recovered source changed: {path}')
candidates_path = ROOT / 'data/position_enrichment/mlb_recorded_threshold_candidates.json'
candidates = json.loads(candidates_path.read_text())
assert candidates['sourceFingerprint'] == EXPECTED['data/raw/recovered/mlb_positions_repaired.csv']
summary = json.loads((ROOT / 'data/position_enrichment/reconciliation_summary.json').read_text())
assert digest(candidates_path) == summary['derivedFingerprints']['mlb']
by_key = {row['key']: row for row in candidates['rows']}
assert len(by_key) == len(candidates['rows'])
manifest = json.loads((ROOT / 'data/position_enrichment/mlb_review_manifest.json').read_text())
approved_ids = {row['playerExternalId'] for row in manifest['rows'] if row['seasonStartYear'] == 2026}
repair_rows = list(csv.DictReader((ROOT / 'data/raw/recovered/mlb_positions_repaired.csv').open()))
repair_by_line = {line: row for line, row in enumerate(repair_rows, 2)}
counts, game_evidence = Counter(), defaultdict(list)
# The accepted comparison already established shared normalized source equivalence.
# Reconstruct that 2026 source cohort; this audit never claims a fresh canonical DB read.
with (ROOT / 'data/raw/recovered/mlb_2016_2026_final.csv').open() as source:
    for line, row in enumerate(csv.DictReader(source), 2):
        if row['season'] != '2026':
            continue
        counts[row['player_id']] += 1
        if row['category'] != 'pitching':
            continue
        played, started, pitched = [integer(row[key]) for key in ('gamesPlayed', 'gamesStarted', 'gamesPitched')]
        if played != 1 or pitched != 1 or started not in (0, 1):
            continue
        proof = dict(sourceLine=line, rowSha256=canonical_hash(row), sourceGameId=row['game_id'],
                     sourceTeamId=row['team_id'], gamesPlayed=played, gamesPitched=pitched, gamesStarted=started)
        game_evidence[(row['player_id'], row['game_id'])].append(proof)
assert len(counts) == 1472 and sum(counts.values()) == 72510
supported_ids = {pid for pid in counts if by_key[f'{pid}:2026']['status'] == 'RECORDED_THRESHOLD_SUPPORTED'}
assert supported_ids == approved_ids and len(supported_ids) == 935
held_ids = sorted(set(counts) - approved_ids)
assert len(held_ids) == 537
pitching = defaultdict(list)
conflicting_games = []
for (pid, game_id), proofs in game_evidence.items():
    tuples = {(p['sourceTeamId'], p['gamesPlayed'], p['gamesPitched'], p['gamesStarted']) for p in proofs}
    if len(tuples) != 1:
        conflicting_games.append(dict(sourcePlayerId=pid, sourceGameId=game_id, proofs=proofs))
        continue
    pitching[pid].append(dict(sourceGameId=game_id, started=proofs[0]['gamesStarted'] == 1, proofs=proofs))
rows, primary = [], Counter()
for pid in held_ids:
    current = by_key[f'{pid}:2026']
    assert current['status'] == 'INSUFFICIENT_THRESHOLD_EVIDENCE'
    assert current['reasons'] == []
    source_rows = [repair_by_line[proof['line']] for proof in current['sourceRows']]
    assert all(str(integer(row['player_id'])) == pid and row['season'] == '2026' for row in source_rows)
    fielding = any(t['counts'][code] is not None for t in current['teams'] for code in FIELD)
    pitch = any(t['counts'][code] is not None for t in current['teams'] for code in ['SP', 'RP', 'P'])
    any_counts = fielding or pitch
    if current['possibleCombinedRequiresScopeVerification']:
        category = 'MULTI_TEAM_FIELDING_TOTAL_REQUIRES_SCOPE_PROOF'
    elif not any_counts:
        category = 'NO_RECORDED_APPEARANCE_COUNTS'
    elif not current['sourceReferences']:
        category = 'COUNT_SOURCE_REFERENCE_UNVERIFIED'
    elif fielding and pitch:
        category = 'FIELDING_AND_PITCHING_RECORDED_BELOW_THRESHOLDS'
    elif pitch:
        category = 'PITCHING_RECORDED_BELOW_ROLE_THRESHOLDS'
    else:
        category = 'FIELDING_BELOW_20_APPEARANCES_START_COUNTS_ABSENT'
    primary[category] += 1
    previous = by_key.get(f'{pid}:2025')
    carry = previous if previous and previous['status'] == 'RECORDED_THRESHOLD_SUPPORTED' else None
    games = sorted(pitching[pid], key=lambda row: row['sourceGameId'])
    starts = sum(row['started'] for row in games)
    relief = len(games) - starts
    positions = (['SP'] if starts >= 10 else []) + (['RP'] if relief >= 20 else [])
    # Generic P is a direct defensive role, not permission to manufacture an SP/RP subtype.
    p_threshold = starts >= 10 or len(games) >= 20
    counts_by_position = {code: max((t['counts'][code] or 0 for t in current['teams']), default=0) for code in FIELD + ['SP', 'RP', 'P']}
    listed_lists = sorted(set(tuple(proof['listedPositions']) for proof in current['sourceRows']))
    rows.append(dict(sourcePlayerId=pid, displayName=source_rows[0]['player_name'], seasonStartYear=2026, primaryHoldReason=category,
        sourceStatRows=counts[pid], repairedSourceRows=current['sourceRows'], repairedTeams=current['teams'],
        listedPositionLists=[list(value) for value in listed_lists], differingRepairedLists=len(listed_lists) > 1,
        repairMatchStatuses=dict(Counter(row['position_match_status'] for row in source_rows)),
        maximumIndependentlyRecordedCounts=counts_by_position,
        possibleCombinedRequiresScopeVerification=current['possibleCombinedRequiresScopeVerification'],
        currentThresholdSourceReferences=current['sourceReferences'],
        prior2025CarryProposal=None if not carry else dict(positions=carry['positions'], sourceRows=carry['sourceRows'],
            teams=carry['teams'], sourceReferences=carry['sourceReferences'], targetSeasonStartYear=2026,
            knownAt=None, effectiveAt=None, approvalRequired=True, historical2026ObservedPositionRewrite=False),
        explicit2026Pitching=dict(knownGames=len(games), knownStarts=starts, knownReliefAppearances=relief,
            independentlySupportedRolePositions=positions, genericPThresholdSupported=p_threshold,
            games=games if positions or p_threshold else [], gamePrecision='CALENDAR_DATE_NOT_OFFICIAL_INSTANT'),
        currentEligibilityPromoted=False))
assert sum(primary.values()) == 537
carry_rows = [r for r in rows if r['prior2025CarryProposal']]
pitch_rows = [r for r in rows if r['explicit2026Pitching']['independentlySupportedRolePositions']]
p_rows = [r for r in rows if r['explicit2026Pitching']['genericPThresholdSupported']]
carry_ids = {r['sourcePlayerId'] for r in carry_rows}
pitch_ids = {r['sourcePlayerId'] for r in pitch_rows}
p_ids = {r['sourcePlayerId'] for r in p_rows}
report = dict(version='mlb-position-holds-local-audit-1', sourceFingerprints=EXPECTED,
    candidateFileSha256=digest(candidates_path), acceptedHistoricalComparison='data/position_enrichment/recovered_comparison.json',
    cohort=dict(sourceSeasonStartYear=2026, playerSeasons=1472, statRows=72510, approvedHistoricalPlayerSeasons=935,
                withheldPlayerSeasons=537, freshDatabaseRead=False),
    primaryHoldReasons=dict(sorted(primary.items())),
    overlays=dict(differingRepairedPositionLists=sum(r['differingRepairedLists'] for r in rows),
        possibleCombinedFieldingScope=sum(bool(r['possibleCombinedRequiresScopeVerification']) for r in rows),
        prior2025ThresholdSupportedCarry=len(carry_rows), explicit2026SupportedSpRp=len(pitch_rows),
        explicit2026SupportedGenericP=len(p_rows), priorCarryAndSpRpOverlap=len(carry_ids & pitch_ids),
        priorCarryAndGenericPOverlap=len(carry_ids & p_ids),
        possibleSupportedCarryOrSpRp=len(carry_ids | pitch_ids),
        noSupportedCarryOrSpRp=537-len(carry_ids | pitch_ids),
        possibleSupportedCarryOrGenericP=len(carry_ids | p_ids),
        noSupportedCarryOrGenericP=537-len(carry_ids | p_ids)),
    excludedConflictingPitchingGames=conflicting_games, rows=rows,
    networkRequests=0, databaseConnections=0, developmentWrites=0, frozenBatchChanges=0,
    decision='SOURCE_ONLY_PROPOSAL_NO_CANONICAL_TARGET_OR_CURRENT_ELIGIBILITY_APPROVAL')
report['targetFingerprint'] = canonical_hash(report)
OUT.write_text(json.dumps(report, indent=2) + '\n')
proposal = dict(version='mlb-position-source-only-proposal-1', auditFingerprint=report['targetFingerprint'],
    sourceFingerprints=EXPECTED, historicalRoleCandidates=pitch_rows, priorSeasonCarryCandidates=carry_rows,
    genericPOnlyCandidates=[r for r in p_rows if not r['explicit2026Pitching']['independentlySupportedRolePositions']],
    historicalSourceRowsForNineRoleCandidates=sum(r['sourceStatRows'] for r in pitch_rows),
    canonicalTargetIdsResolved=False, exactDevelopmentTargetFingerprint=None, officialEffectiveAt=None,
    officialPublishedAt=None, currentEligibilityPromoted=False, approvalRequired=True)
proposal['sourceProposalFingerprint'] = canonical_hash(proposal)
OUT.with_name('mlb_position_additional_source_proposal.json').write_text(json.dumps(proposal, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['cohort', 'primaryHoldReasons', 'overlays', 'targetFingerprint']}, indent=2))
