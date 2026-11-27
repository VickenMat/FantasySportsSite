# Bounded MLB operational product inspection

Six primary-source HTTP requests were made on November 27, 2026 UTC. No database writes, source-manifest changes, large artifact downloads, V5 reacquisition or direct league/API requests occurred. Small metadata/documents and their hashes are retained in the ignored `data/provider_previews/capability_review/mlb_operational_products/` directory.

| Inspected primary resource | Result | Meaning |
| --- | --- | --- |
| SportsDataverse `mlb_game_state` release metadata | HTTP 200 | Publisher explicitly describes RE24 run expectancy, win expectancy and per-play WPA/leverage models. This is not professional final-status/game-info evidence. |
| SportsDataverse `espn_mlb_rosters` release metadata | HTTP 404 | This exact candidate tag was absent. |
| SportsDataverse `mlb_rosters` release metadata | HTTP 404 | This exact candidate tag was absent. |
| SportsDataverse `mlb_game_info` release metadata | HTTP 404 | This exact candidate tag was absent. |
| SportsDataverse `mlb_schedules` release metadata | HTTP 200 | A small published schedule artifact exists; schema/final semantics remain to be inspected. |
| SportsDataverse producer `baseballr-data/main/README.md` | HTTP 200 | Primary producer documentation retained; confirms release publication architecture and distinguishes model outputs from captured raw inputs. |

The 404 results are specific inspected names, not an exhaustive claim that no permitted free roster or final-state source exists. No paid subscription requirement follows from this inspection.

## Published schedule descriptor

The [SportsDataverse MLB schedules release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/mlb_schedules) contains:

- URL: `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/mlb_schedules/mlb_schedule_2026.csv.gz`
- Published asset size: **39,229 bytes**.
- Published asset SHA-256: `e5163a8e0a09cae0b387a8ab932ff350f5596c824deb2b9b3f32c1dc89273a41`.
- Asset modification: `2026-10-29T12:35:19Z`; this is not an official game/statistical publication timestamp.
- Alternate Parquet asset: 43,366 bytes; SHA-256 `f6d583bd06155b6dadf604a483a9f0a6fa5e7aa1f0e2492143814af3f8a5ec47`.
- Metadata observed: `2026-11-27T01:16:37.566Z`.
- Retained metadata SHA-256: `c2e6ff4efac5e6dc927fe0b0cbbb37beafd40a4e9c8430d04a6c1698d7bfb0bc`.

The request budget was exhausted at discovery, so the small body was **not downloaded**. Canonical MLB game/team IDs, row count, explicit completed status, outcomes, cancelled/suspended states and timestamp precision remain unverified. No observation builder or registry entry should infer those fields from the product name. A bounded download of this one small published body, checked against the exact asset hash, is the next concrete capability check.

The [game-state model release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/mlb_game_state) is a false lead for final-status purposes: its own description identifies analytical reference/model tables. Its retained metadata SHA-256 is `a2720dcbcaee56f10a5652e91c36524f67b1a798e55be809cb2f67626cb590b7`.

The [producer README](https://github.com/sportsdataverse/baseballr-data/blob/main/README.md) describes committed raw capture as a separate layer. That is a documentation lead only; this review did not retrieve raw game feeds or presume their permission/schema. Its retained document SHA-256 is `86a04ac59091173e27ba9383414bb2fdfaefd5ea3ee1615a7decf00b19ee472f`.

## Remaining holds

Current player/team roster relationships are not established by a last historical appearance or roster-tag 404. The existing MLB PBP still lacks an explicit professional final-state field; its last play cannot supply one. No final/completion observation, current eligibility or current-team assignment was promoted by this inspection. The possible small schedule product can reduce the final-state acquisition gap if its actual schema supports that claim; roster freshness remains independently gated.

## Authorized follow-up: actual small-body validation

A subsequent authorized two-hop download retrieved the 39,229-byte gzip and matched the published digest exactly. The actual schema has 2,990 rows with `game_pk`, season/date, numeric home/away MLB team IDs, explicit scores, `status_code`, `detailed_state`, and a separate scheduled `game_datetime`. There are 2,960 unique game IDs and 30 duplicate calendar groups. Twenty-nine groups preserve postponed predecessors beside a later final row; one game (`824912`) has two conflicting final calendar dates and remains held. Array order never resolves these groups.

The snapshot has 2,939 `Final`, 18 `Completed Early`, four `Cancelled`, and 29 `Postponed` rows. Crucially, **`abstract_state` is `Final` for every row**, including cancellations/postponements. The decoder therefore requires the actual detailed-state/code pair and explicit final scores. It never treats the scheduled datetime as an actual start/end or the artifact modification as publication. All 2,467 retained PBP game IDs have a matching explicit final result in this release.

Three further bounded primary documentation/license reads inspected the raw repository README, repository metadata and license text. Its GitHub license classification is `NOASSERTION`; the entire LICENSE text specifies only year and copyright holder, without a dataset reuse grant. The conditional permission requirement for raw game files was therefore not satisfied: **zero raw game payloads were fetched**. This does not affect the already permitted central published schedule/PBP products. The complete research count is eleven requests: six initial metadata/doc requests, two schedule download hops and three raw-repository documentation/license requests.

## Separate functional MLB supplement

`mlb-schedule-result.ts` provides the strict decoder and precise source descriptor. `prepare-mlb-source-supplement.ts` binds accepted V5 regular-season evidence without rewriting canonical phase: 2,429 of the 2,430 verified canonical regular games remain `UNKNOWN` in the original Game row. It prepares 2,429 identified state candidates and 2,398 complete historical-box candidates; unresolved canonical dates, PA inventory or roles remain held.

The separate one-game manifest is `data/stat_enrichment/mlb_source_supplement/reviewed_mlb_history_box_manifest.json`, fingerprint `0bb7222f88118b9b9b890cfb82d6c5fba6325877102b4fa742eb193f05d54502`. It targets actual game `823244`, canonical ID `d5166dfa-092a-4aa9-aca9-36c3cd332e48`, and 26 existing accepted historical stat rows. It proposes no new PlayerGameStat rows. Field provenance is explicit: final state comes from the licensed schedule; participation and role completeness come from licensed PBP; scoring values come from the existing accepted historical archive, **not a direct SportsDataverse player box**. Existing V9 calculation and ledger APIs are reused, with exact current stat/ledger/source head guards. All earlier frozen manifests remain untouched.

The isolated controlled fourth-sport proof is `validate-real-mlb-stage.ts`, exposed through `--verify-real-mlb-stage`. Hypothetical pre-lock ownership and threshold eligibility are explicitly labeled fixtures. Actual IDs, historical scoring values and original canonical UNKNOWN phase remain unchanged. Its read-model report leaves browser acceptance pending. No database mutation or database test execution was performed by this workstream.
# Supplemental validation and execution safeguards

The actual-target populated-copy hook `--verify-supplemental-source-promotion` now validates the NHL40 fresh-stat proposal, MLB26 existing-stat proposal and 3,258 FINAL-only observations atomically. Its composite review fingerprint is `0413f205bf71b0369108b58d998745caf04641c360546842febdcdea6cb660d1`, binding component fingerprints, target counts and exact manifest-file SHA-256 values. This is separate from the controlled fantasy acceptance fixtures. The validator checks all original application rows, exact append counts, late-component rollback and empty replay; execution results are recorded only after the parent runs the disposable copy.

The deployment operator remains behind the exact `APPROVED_SUPPLEMENTAL_SOURCES` environment approval gate. It checks the populated-copy baseline against development, requires a paused stack, creates a private cluster-verified backup and fully decodes it, and verifies all 90 original tables and append deltas after one atomic application. It has not been run or approved as part of this implementation.

The MLB loader detects gzip by verified byte signature, including extensionless content-addressed objects. Both retained hashes were rechecked and decoded without changing source inputs: 2,990 schedule rows and 187,064 participation rows, with one final-state row and 74 participation plays for the exact target game. The isolated hypothetical eligibility fixture uses the required stable player-season-position aggregate stream and explicit ten-start evidence; it never claims actual historical fielding eligibility.
