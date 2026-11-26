# Player data UI audit

Read-only development audit on November 25, 2026. No dataset was imported or modified.

| Sport | Canonical players | Demo | Synthetic | Real players with normalized historical stats | Real players with observed positions | Players with persisted V9 ledger scores |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NFL | 1,863 | 2 | 34 | 1,827 / 1,827 (100%) | 1,827 / 1,827 (100%) | 0 |
| MLB | 1,507 | 2 | 33 | 1,472 / 1,472 (100%) | 0 / 1,472 (0%) | 0 |
| NBA | 3,787 | 2 | 3,311 | 474 / 474 (100%) | 0 / 474 (0%) | 0 |
| NHL | 885 | 2 | 11 | 872 / 872 (100%) | 872 / 872 (100%) | 0 |

My Team, the consolidated Waivers player browser and Draft all query canonical `Player` identities and exclude synthetic players from acquisition pools. They share a season-scoped statistics service that uses persisted ledger entries when available and derives historical analytics from accepted normalized box scores otherwise. Derivation writes no competitive ledger events. Missing inputs or ambiguous two-way roles keep totals unknown. `PROJ` remains `N/A`. Historical position display does not itself grant current lineup eligibility.

The earlier audit mistakenly treated unflagged legacy fixtures as real players. Import provenance identifies 3,388 fixture-only players from named test CSVs and fixture names. The user explicitly approved setting their synthetic flags; no identity, statistic or ownership record was removed. The approved ID-set SHA-256 is `ad2140ed00d822115a09579a1b813976fc347deae97260b9c278a872951bb2f9`. Repeat dry run: zero candidates. All 35 persisted score revisions remain preserved and belong to fixtures rather than accepted real-player archive coverage.

## Archive versus imported data

Local archives contain NFL 185,368, MLB 794,974, NBA 260,499 and NHL 506,116 rows spanning 2016–2026 (NBA/NHL through 2026–27). Their metadata contains no MLB/NBA position column. No repaired position file was found under the project data directory. Missing positions are not an omitted-column bug in the current reader: it passes every physical column to the normalizer.

Development contains 103,801 accepted archive stat rows, all for the 2026 start-year season: NFL 10,981 / 1,827 players; MLB 72,510 / 1,472; NBA 5,390 / 474; NHL 14,920 / 872. The other 3,511 stat revisions are preserved fixtures (including synthetic NFL 2097/2098 and one-day 2025 MLB/NBA/NHL data). The large NBA population was primarily 3,311 fixture identities, not evidence of duplicate accepted player IDs.

## On-demand historical score completeness

Read-only verification against development, after approved classification:

| Sport / imported season | Players | Complete totals for all imported appearances | Unknown totals |
| --- | ---: | ---: | ---: |
| NFL 2026 | 1,827 | 1,827 (100%) | 0 |
| MLB 2026 | 1,472 | 1,337 (90.83%) | 135 |
| NBA 2026–27 | 474 | 474 (100%) | 0 |
| NHL 2026–27 | 872 | 41 (4.70%) | 831 |

These percentages describe imported historical appearances, not whole-season or live-production completeness. Missing statistics and ambiguous multiple scoring roles remain unknown. Active status, availability, rookie status, retirement and publication-time authority are still unavailable.

## Exact missing-input reconciliation

`npm run data:scoring-completeness` uses a read-only repeatable-read transaction, latest player/game/role revisions and the persisted V9 preset. It does not modify scores or choose a role. November 25 results:

| Sport / season | Reason | Affected appearances | Affected players |
| --- | --- | ---: | ---: |
| MLB 2026 | Both HITTER and PITCHER, no selected game scoring role | 215 | 135 |
| NHL 2026–27 | SKATER `faceoff_wins` | 13,428 | 786 |
| NHL 2026–27 | SKATER `shorthanded_points_bonus` | 13,428 | 786 |
| NHL 2026–27 | GOALIE `goalie_win` | 40 | 32 |
| NHL 2026–27 | GOALIE `shutout` | 38 | 28 |

Counts overlap by reason. NHL union: 13,499 appearances / 831 players. MLB has 72,295 distinct appearances from 72,510 role rows; its ambiguity accounts for all 135 unknown totals, with no additional missing-stat issue. NFL's 10,981 and NBA's 5,390 appearances have no missing V9 inputs. NHL has 14,920 imported appearances. These are imported-season statistics, not authoritative live completeness.

The NHL normalizer intentionally leaves missing decision and shared/short-game shutout evidence unknown; goals against of zero alone does not prove a shutout. A faceoff percentage does not establish integer faceoff wins. Missing shorthanded points cannot be inferred as zero.

## Position source contract and safe reconciliation

The local `reference/position_enrichment/POSITION_ENRICHMENT_STATUS.md` explicitly describes empty, unverified position fields and lookup templates, not a completed repair. Project data, tracked manifests/preparation code and the Developer workspace contain no repaired position dataset. Existing physical archives remain `data/player_data/mlb_2016_2026_final.parquet` and `data/player_data/nba_2016_2027.parquet`, without positions.

Expected supplied files can be named `mlb_positions_verified.json` and `nba_positions_verified.json`. The reconciliation CLI accepts this manifest shape (example identifiers must be replaced with verified source values):

```json
{
  "sport": "NBA",
  "sourceName": "nba_positions_verified.json",
  "sourceProvider": "verified historical position provider",
  "rows": [{
    "playerExternalId": "provider player ID",
    "identityProvider": "v9-historical",
    "seasonStartYear": 2026,
    "positions": ["PG", "SG"],
    "verificationStatus": "VERIFIED",
    "sourceReference": "traceable source record or URL",
    "knownAt": "2026-11-25T00:00:00Z"
  }]
}
```

MLB identity corresponds to original `player_id` + `season`; NBA to `PLAYER_ID` + `SEASON_YEAR` (start year). If supplying CSV instead, include these identity keys plus `primary_position`, pipe-delimited `eligible_positions`, `position_source`, `verification_status`, source reference and known timestamp so a reviewed manifest can be prepared. Batting/pitching category is not fielding eligibility.

Run `npx tsx --env-file=.env src/workers/reconcile-historical-positions.ts /path/to/manifest.json` for a dry run. It resolves existing IDs and appearances, rejects missing or conflicting evidence and fingerprints the exact target revisions and manifest. Apply additionally requires `--apply --expected-fingerprint=...` **and separate user approval for development backfill**. No development repair has been applied or authorized. Applying appends position-only statistical revisions, preserves raw originals and normalized counts, and creates no current eligibility evidence or competitive score-ledger events. Repeat application is a no-op. Synthetic isolated-schema acceptance verifies these properties.
