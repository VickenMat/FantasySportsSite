# M5 historical completion continuation

This work prepares a new exact review batch without changing development data or the two previously approved manifests. The existing `ebef6a…` NHL and `c0efa5…` MLB artifacts remain preserved under `data/stat_enrichment/approved_manifests/`. All new target artifacts remain ignored.

## NHL: all 48 withheld games reconciled

The earlier validator treated valid hockey cases as source conflicts:

- 32 games ended in a shootout. The PBP ending retains the overtime tie, while final team scores add one deciding goal. The scoring release includes that deciding shootout marker; it must not count as a personal goal. Thirty-one games had this issue alone.
- 17 games contained a legitimate goalie goal or goalie assist. The previous actor inventory included only skaters. Sixteen games had this issue alone, and one also involved a shootout.

NHL [Rule 84.4](https://media.nhl.com/site/asset/public/ext/2025-26/2025-26Rules.pdf) separates the team shootout adjustment from personal goals. Reconciliation now requires explicit SHOOTOUT period types, an exact one-goal team adjustment from a tied ending, a matching winning-team shooter, and no shootout assists. It recognizes goalies only through same-game goalie-box IDs, matching team identity and positive recorded playing time. Skater goals/assists still match the complete skater box; goalie participation never becomes skater credit. No name-only matching or arbitrary duplicate selection is used.

Result: **399/399 source games validate, zero rejected**, versus 351/399 before. Independent faceoff validation also accepts all 399 games. Percentages cross-check event counts; they never supply integer faceoff wins. Missing events, duplicate IDs, unknown actors or incompatible scores remain rejection conditions.

A goalie goal in game `2026020010`, source player `8478048`, is preserved as event provenance. **No V9 known-value correction is needed:** the GOALIE role intentionally has no goals coefficient. It continues to use only wins, saves, goals against and shutouts.

## Goalkeeper non-winner evidence

Forty imported rows lack `goalie_win`. The new proof does not translate an empty decision to zero. It requires a final matching game result, four distinct goalie IDs split two per professional team, exactly one explicit `W`, exactly one explicit `L`/`O` on the other team, and no unknown decision codes. Every other listed goalie is a proven non-winner because the unique win is explicitly credited to a different participant.

All **399 source-game inventories** pass these checks. For all 40 targets, **all four source actors map to accepted same-game canonical GOALIE records**: 160 verified canonical links. Those links are separately retained in `data/stat_enrichment/nhl_accelerated_canonical_decisions.json`.

No positive or negative shutout credit is manufactured. The 40 remaining shutout evidence gaps (38 nulls and two retained unsupported positive credits) are still withheld.

## Exact NHL proposal

`data/stat_enrichment/nhl_accelerated_missing_manifest.json`

- Fingerprint: **`d9be091dcc818f0e3b219b9f4bbbe9fd5382658ae9630273fc487780dcea0c20`**.
- **1,660 appended revisions / 665 affected players**, consisting of 1,620 skater revisions adding exact faceoff wins and shorthanded points, plus 40 goalie revisions adding proven non-winner values.
- **650 additional statistically complete players**: incompleteness falls **678 → 28**, or complete current imported players **194/872 → 844/872**.
- Source/game/player/role/previous-stat IDs, prior content hashes and per-field source/event evidence are explicit. Current eligibility, ownership, source publication and competitive records do not change.
- No development application occurred in this workstream. Populated-copy validation and consolidated explicit approval are required before application.

The report and unresolved canonical IDs are in `data/stat_enrichment/nhl_accelerated_report.json`. Source fingerprints are pinned in the manifest to immutable source objects, so a later conditional refresh cannot silently change the review target.

## MLB: 16 of the last 18 appearances resolved

The source is an at-bat/event stream, not a list containing exactly one charged plate appearance per row. The 17 previously incomplete target cases each had one extra non-PA event: an inning-ending caught stealing/pickoff or an advisory. [MLB's plate-appearance definition](https://www.mlb.com/glossary/standard-stats/plate-appearance) excludes interrupted turns ending on baserunning outs.

`mlbPlayCompleteness` now separates reviewed PA outcomes, inning-ending baserunning outs and non-play advisories. It requires contiguous unique source indices and reconciles **each canonical batter's PA count**, as well as the game total. Advisory actors are not treated as positive participation. Unknown event types remain pending.

This validates **16 additional PITCHER choices / 16 players** using the confirmed single-role policy; none depends on fantasy totals. The historical source rows remain intact.

`data/stat_enrichment/mlb_accelerated_role_manifest.json`

- Fingerprint: **`02921815004815f0e912f572948d3b14e59e5c07cdd7eaecc625cb058685e5bd`**.
- Proposed addition: 16 historical V9 ledgers/entries, subject to disposable validation and explicit approval.
- Current accepted-population completeness would improve **1,454/1,472 → 1,470/1,472**.

Two cases remain explicitly unresolved:

| Player | Canonical source game | Source player | Evidence gap |
| --- | --- | --- | --- |
| Kyle Freeland | 823317 | 607536 | Batting gamesPlayed=1, PA=0; pitching games=0; no batter/pitcher or post-on-base ID participation in the complete source stream. |
| Orion Kerkering | 824807 | 689147 | Same conflicting participation shape; one non-play advisory explains the old global PA mismatch but does not establish an actual scoring role. |

These could reflect fielding-only participation, an unused-roster artifact or other source semantics. No zero-scoring role is assigned arbitrarily. Additional explicit defensive/substitution/runner participation evidence is needed. Existing raw records and both roles remain preserved.

## Remaining shutout dependency

The current permitted goalie box has no explicit shutout field. A bounded inspection of the licensed combined `nhl_player_boxscores` release also found no such field: `player_box_2027.csv`, **15,960 rows / 38 columns**, SHA-256 **`e40f0d61be40810295e07b82f963f579ae32dad626133b5ba8045390d4979545`**. Two release-metadata requests and two artifact HTTP hops were used; no direct restricted NHL API was called. The published SportsDataverse catalog currently lists no NHL per-player game-log product.

The remaining 40 rows span 38 games and 28 players. They require explicit credit/denial evidence; zero goals against, elapsed time, starter status or a team score alone is not promoted as a shutout. The exact blocker is **field absent in reviewed redistribution products**, with direct-league automated-use permission unresolved for alternative game-log sources. It is not missing implementation of an unknown-to-zero fallback.

A separate primary NHL [playing-roster report](https://www.nhl.com/scores/htmlreports/20262027/RO020043.HTM) exposes actual start/end at minute precision (`Start 7:08 CDT; End 9:25 CDT`, October 5). This establishes an evidence-capability lead, not an approved data adapter: direct-source permissions and precision must be reviewed, and second-level exact instants must not be invented.

## Verification and reproduction

- Seven targeted tests pass: four new historical cases plus three existing open-data cases.
- New cases cover shootout/team/personal separation, real goalie actors, missing/duplicate decision inventory, no default null-to-zero and per-player baseball PA reconciliation.
- A read-only repeatable development audit prepared the exact targets and before/after coverage; development writes: **zero**.
- TypeScript inspection found no errors in the historical files. Full repository validation is coordinated by the root agent.
- Reproduce with `node --import tsx src/workers/prepare-historical-continuation.ts`. It writes only new ignored continuation filenames, never the approved old manifests.

These results concern the imported 2026/2026–27 subset, not every archived historical season or a complete current professional season. Official publication/completion semantics remain separate, and no live finalization gate is weakened. All V9 weights, V5 inputs, source CSVs, accepted Parquets and user screenshots remain unchanged.

### NFL historical-provider lookup gap review

A subsequent read-only review found that all 138 supported rows held by the original NFL preview lacked the adapter's `v9-historical` game lookup; the accepted games already existed under `schedule-v5`. The refreshed licensed snapshot has 11,473 rows, SHA-256 `c5256b203f3c4de37222b95ec61a19b1e21b34f2496c8c5cd590146258f3fd36`, versus the original 11,404-row `b06ab83310fe351db1b16e89e87c074f7de464e51700f6b3ff730315598d0c12` snapshot. Its corresponding held cohort is 162 rows across seven games.

`src/workers/prepare-nfl-stat-continuation.ts` prepares a separate, read-only proposal. Each game is identified by its exact source game ID, season, official week and both home/away teams, with one accepted V5 schedule observation. Each proposed statistic uses the existing game's actual `GameTeam` participant UUID. Historical and V5 team UUIDs differ in the baseline; the proposal preserves both identities and every existing game/team row and timestamp.

The ignored `data/stat_enrichment/nfl_v5_stat_continuation_manifest.json` proposes 162 genuinely absent player/game/FOOTBALL rows for 162 players, with final reviewed fingerprint `6c6bb8270a5728b9ab8fd6f5903a3658c3bf32e43ec7fb57de6f9fc78017cd2b`. Existing statistics are checked across all providers and never overwritten. Two rows depend on the separately reviewed direct-GSIS roster identities for Xavier Gipson (`00-0038496`) and Carter Runyon (`00-0040488`); neither is among the quarantined roster name collisions. The other 160 players already have canonical identities. No new game, team, current eligibility, actual start, publication timestamp or score ledger is proposed. Source positions remain per-game historical observations and `sourceKnownAt` remains null. Without separate eligibility evidence, 110 rows still lack the TE-bonus decision needed for a complete V9 score; the proposal does not invent that eligibility.

The preparer uses an explicit read-only, repeatable-read transaction and pins both source snapshots. It records the seven existing-game bridge proofs separately within the manifest. Root integration must validate this proposal in a populated disposable copy and obtain any required consolidated development backfill approval before applying it. No development writes were performed by this review.

The transaction-compatible materializer is `src/server/reviewed-nfl-statistics.ts`. It checks the reviewed manifest fingerprint, hashes the immutable source bytes, verifies each exact CSV source line and its existing normalizer output, validates the canonical game tuple and unchanged V5 timestamps/participants/observation, resolves existing GSIS identities, and rejects any existing player/game/role statistic across providers. A dry run may accept a separately supplied exact planned GSIS-to-new-player map; application requires those identities to have been materialized earlier in the same transaction. Import-batch and row fingerprints permit an exact replay with zero additions. Its ordinary apply wrapper permits disposable schemas only; consolidated approved development execution must use the parent-owned transaction entry.

The focused disposable-schema regression test covers dry runs, fingerprint and team mismatch rejection, historical-only observed positions, unchanged game timestamps, append/replay behavior, overwrite rejection and absence of position evidence or score-ledger writes. Full TypeScript, scoped ESLint and diff checks passed. Database execution of the new test is delegated to the parent’s coordinated isolated validation run.
