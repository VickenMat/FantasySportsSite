# M5 data coverage and archive reconciliation

Read-only checkpoint, November 25, 2026. Reproduce with `npm run data:m5:audit`; default machine report is `/private/tmp/fantasy-m5-data-baseline.json`. No archive or operational row was imported, repaired, merged or removed.

## Archive versus PostgreSQL

All four physical archive SHA-256 values and Parquet row counts match the prior full `reports/m2-5-analysis.json` audit. Its season-level validation is reused only after this exact content match; this is not a claim of a fresh remote-source verification. Total physical rows: **1,746,957**. Files cover the accepted 2016–2026 range, including NBA/NHL 2026–27; per-season coverage remains as qualified in the prior audit.

| Sport | Physical archive rows | Prior valid rows | Prior quarantined rows | Accepted imported rows (2026 start year only) | Accepted imported players |
| --- | ---: | ---: | ---: | ---: | ---: |
| NFL | 185,368 | 185,182 | 186 | 10,981 | 1,827 |
| MLB | 794,974 | 794,974 | 0 | 72,510 | 1,472 |
| NBA | 260,499 | 260,499 | 0 | 5,390 | 474 |
| NHL | 506,116 | 506,116 | 0 | 14,920 | 872 |
| Total | 1,746,957 | 1,746,771 | 186 | 103,801 | 4,645 |

The remaining development stat revisions are retained fixtures; total development statistics remain 107,312. Valid archive rows are not automatically a complete, authoritative season or verified pregame dataset. Keep the full archive in Parquet. Materialize only reviewed current-season and query-required subsets, with fingerprints and explicit approval before substantial development backfills.

## Identity, position and historical scoring coverage

| Sport | Accepted canonical identities | Imported historical position observations | Fully scored historical player totals | Current authoritative positions/lifecycle |
| --- | ---: | --- | --- | --- |
| NFL | 1,827 | 1,827/1,827 | 1,827/1,827 | Not established by a selected licensed current feed |
| MLB | 1,472 | 0/1,472 | 1,337/1,472 | Missing verified historical/current fielding source; roster categories do not grant positions |
| NBA | 474 | 0/474 | 474/474 | Missing verified historical/current position source |
| NHL | 872 | 872/872 | 41/872 | Current source authority not established; historical observed positions remain separate |

Historical scoring percentages apply to imported appearances, not full archive/live completeness. The existing read-only `npm run data:scoring-completeness` supplies the missing-input analysis. Canonical ID counts and all 56 V9 rules are preserved. Fixture-backed new-ID/alias promotion does not increase these development counts.

## Exact MLB investigation

Latest imported `v9-historical` player/game/role revisions contain **215 paired appearances across 135 players**. Raw `category` agrees with normalized HITTER/PITCHER in all pairs: **zero category mismatches**.

| Activity in the two normalized role records | Appearances |
| --- | ---: |
| Both roles contain a nonzero V9 input | 92 |
| Pitching only contains a nonzero V9 input | 121 |
| Hitting only contains a nonzero V9 input | 0 |
| Neither role contains a nonzero V9 input | 2 |

The canonical game/player target-set MD5 is `3ee6bcedcc4b33b2866d54d6099d3c03`. This identifies the investigation scope; it is not an approved mutation manifest. Zero/missing batting inputs are not proof that a batting appearance is erroneous, and paired source rows do not independently verify a legitimate professional two-way appearance.

The approved V9 specification explicitly prohibits scoring one athlete as pitcher and hitter in one game. Preserve that decision: no combining roles, choosing the higher realized score, automatic discarding or selecting based on nonzero totals. The missing input is trustworthy role-selection/pregame evidence for the applicable athlete/game. Original role-specific statistics remain separate. See `08_V9_SCORING_PRESET.md` and the existing `chooseRole` guard. No new double-scoring product decision is requested.

## NHL missing inputs

The prior accepted read-only reconciliation remains unresolved: 831 affected players, with overlapping missing reasons. SKATER faceoff wins and shorthanded bonus affect 13,428 appearances / 786 players; goalie wins affect 40 appearances / 32 players; shutouts affect 38 appearances / 28 players. The union is 13,499 appearances. Obtain exact official inputs. Faceoff percentage cannot supply integer wins; zero goals against cannot alone prove an individual goalie shutout. No missing value is replaced with zero.

## Schedules, boundaries and publication

Accepted V5 remains 57,352 schedule observations and 52,866 historical crosswalk records, including four accepted unresolved NBA IDs. Five future NBA starts remain unpublished. Preserve all five artifact hashes; do not reacquire V5 or force crosswalks. Scheduled starts/statuses do not establish actual start or completion instants.

Current read-only evidence audit finds zero AVAILABLE independently verified season-boundary revisions, zero game-completion evidence rows, zero availability evidence rows and zero rookie evidence rows. Existing position-evidence rows total 110, but that global count includes legacy/fixture scope and is not promoted into a four-sport authoritative coverage percentage. None of the 103,801 accepted imported statistical revisions has a source publication timestamp. Thus competitive official-publication and completion coverage is still pending, not 100% because a box score exists.

## Live coverage, freshness and conflicts

No licensed live source is selected or active. Actual-start, completion-instant, availability, rookie, retirement and official-publication coverage are unverified for all sports. New staging observations/decisions and cursor/lease/request state are verified in isolated fixtures only. `npm run data:ingestion-status` reports `PENDING_MIGRATION` safely on current development, with live ingestion disabled. After staging deployment it can report persisted stream freshness, failures and decision counts; these are operational metadata, not provider-quality guarantees.

The 215 MLB role conflicts, 831 NHL missing-total players, missing MLB/NBA positions and four historical NBA crosswalks remain visible. New contradictory identities/revisions quarantine without overwriting canonical records. Real-source quarantine counts are not fabricated from synthetic tests. The next coverage matrix must add licensed-field completeness, source-specific freshness and unresolved conflict counts once actual approved samples exist.
