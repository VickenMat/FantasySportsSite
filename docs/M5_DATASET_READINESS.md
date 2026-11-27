# M5 archive readiness for a future M6 handoff

Readiness assessment, November 26, 2026. This prepares data boundaries only: **M6 has not started, V10 is inactive, no weights were optimized, and no archive was imported into PostgreSQL**. Baseline accepted applications are `e758a46`; later proposals do not count as applied coverage. Reproduce aggregates with `node scripts/build-m5-dataset-readiness.mjs`. The machine artifact is [m5-dataset-readiness.json](../reports/m5-dataset-readiness.json).

## Immutable archive inventory

| Sport | Physical role rows | Prior valid rows | Row quarantines | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| NFL | 185,368 | 185,182 | 186 | `f607a8d8587bb30780f85bc204f3f4a9f4e7ca2dcddd2474a4c45c9767aa727c` |
| MLB | 794,974 | 794,974 | 0 | `714f247ff66aaef58216771f955ecc2fd118fa0667f2d2ed4bd827aadff3fc3e` |
| NBA | 260,499 | 260,499 | 0 | `f008d29826972de96eca1dd8d12525e6b267d47fa8c04b61bff838e4cce8f8c3` |
| NHL | 506,116 | 506,116 | 0 | `0f91459cfff70ee04cd16e3f318ee109d5f337a8c2f2e0e78e46659fa103f632` |

All four hashes were freshly verified before reusing the accepted full audit. Total physical rows: **1,746,957**. The prior audit supplies season identity/count aggregates, not a new independent completeness certification. NFL's 186 rejected rows lack valid player IDs; do not invent identities. Operational imported coverage is 103,801 original role rows across 4,645 players, with append-only revisions, not 1,746,957 operational appearances. The accepted 185,945 development revisions and 197 historical role selections are overlays, not extra games.

## Available seasons and populations

Cells are **unique player IDs / observed regular-season games** within each archive season. Do not sum players across years. Source coverage classifications are retained in the machine artifact.

| Season start | NFL | MLB | NBA | NHL |
| --- | ---: | ---: | ---: | ---: |
| 2016 | 1,855 / 256 | 1,353 / 2,428 | 486 / 1,230 | 999 / 1,230 |
| 2017 | 1,868 / 256 | 1,358 / 2,430 | 540 / 1,230 | 1,005 / 1,271 |
| 2018 | 1,883 / 256 | 1,379 / 2,431 | 530 / 1,230 | 1,024 / 1,271 |
| 2019 | 1,888 / 256 | 1,410 / 2,429 | 529 / 1,059 | 983 / 1,082 |
| 2020 | 1,983 / 256 | 1,289 / 898 | 540 / 1,080 | 1,032 / 868 |
| 2021 | 2,081 / 272 | 1,508 / 2,429 | 605 / 1,230 | 1,147 / 1,312 |
| 2022 | 2,006 / 271 | 1,495 / 2,430 | 539 / 1,230 | 1,077 / 1,312 |
| 2023 | 1,942 / 272 | 1,457 / 2,430 | 572 / 1,230 | 1,041 / 1,312 |
| 2024 | 1,996 / 272 | 1,454 / 2,429 | 569 / 1,230 | 1,041 / 1,312 |
| 2025 | 2,019 / 272 | 1,470 / 2,430 | 582 / 1,230 | 1,063 / 1,312 |
| 2026 | 1,827 / 158 | 1,472 / 2,429 | 474 / 242 | 872 / 373 |

NBA/NHL season start 2016 means 2016–17, through 2026–27. All 2026-start populations are partial/in-progress samples, not completed professional seasons. The accepted audit labels MLB 2020, NBA 2019–20/2020–21 and NHL 2019–20/2020–21 season coverage QUARANTINED; their rows were not all rejected. NFL 2022 is count-based PARTIAL. Other past seasons are UNVERIFIED rather than independently verified complete. Cancellations, shortened schedules, expansion and changed season lengths require explicit cohort rules; matching an expected game count alone is insufficient.

## Scoring and participation readiness

| Imported sport | Canonical players | Complete statistical inputs at accepted baseline | Limitation |
| --- | ---: | ---: | --- |
| NFL | 1,827 | 1,827 | Population includes professional positions outside the fantasy starter set; do not force OL/defense/specialists into offensive eligibility. |
| MLB | 1,472 | 1,454 | 18 unresolved player-game role selections across 18 players; 197 other paired appearances use the approved starter-priority rule. |
| NBA | 474 | 474 | Complete statistical inputs do not establish positional eligibility or complete-season coverage. |
| NHL | 872 | 194 | 678 players have missing inputs; 194 is a selected incomplete-season cohort, not representative full-league coverage. |

**Full-archive MLB:** the fresh streaming role-key audit finds **54,992 paired HITTER/PITCHER player-games**. These are paired source role keys requiring participation and single-role reconciliation, not 54,992 proven errors or verified played appearances. Counts by season start are 2016: 10,523, 2017: 10,434, 2018: 10,790, 2019: 10,843, 2020: 62, 2021: 11,241, 2022: 262, 2023: 244, 2024: 171, 2025: 207, 2026: 215. The sharp pre/post-2022 record-structure change and atypical 2020 season must be investigated before comparing uniform cohorts. The 197 validated imported selections cover 2026 only. Never add both role scores, select the better score, or extend an absence-based selection to an incomplete event stream.

**Full-archive NHL:** the fresh evidence-aware scan finds **455,497** skater rows missing exact faceoff wins and the same **455,497** missing shorthanded points; **1,704** goalie-win gaps and **1,979** explicit shutout-evidence gaps. Missing reasons overlap. The 11,808 approved current-season revisions improve only the matching current canonical keys; they do not repair earlier seasons. The scan identifies **28** old 65-minute shutout-inference candidates across the full archive, including the two imported cases. None is explicit positive shutout credit in the recovered source.

**Participation bias:** **23,607** full-archive goalie records have explicit zero ice time, including **706** of the 1,492 current imported goalie rows. Source roster/box-row presence is not proof of a played game. The participation helper preserves all records and excludes only proven final DNP with no contrary activity; unfinished zero-time snapshots and absent participation evidence remain unknown. Any future per-game denominator must use known participation and retain unknown GP, not count every backup row as a played game. No source row is deleted.

## Position, identity and temporal coverage

- MLB repaired evidence covers 15,645 player-seasons: 9,772 have recorded threshold support, 5,873 insufficient evidence, 531 conflicting populated lists and 102 potential team-scope aggregation cases. The approved imported subset is 935 players / 66,825 revisions; 537 imported player-seasons remain withheld. Historical observations do not grant dated current/following-year eligibility automatically.
- NBA recovery contains 5,972 estimated source records, nine manual-review records and 301 unmatched records across 5,492 player-seasons; 346 populated player-season lists conflict. The 242,798 embedded historical position rows agree by player/season/team with the repair evidence, but remain estimates. Current 2026–27 archived rows have no same-season embedded/repaired positions. New current roster matches (469/474 at baseline) are coarse G/F/C evidence without effective/publication instants.
- NFL and NHL archives contain observed positions. Their source observation does not establish pregame eligibility, injury status, team membership history, rookie designation or retirement at a chosen historical instant. Preserve canonical provider IDs; do not repair unmatched identities by name alone.
- V5 retains 57,352 schedule observations and 52,866 historical crosswalk records, with four accepted unresolved NBA IDs and five future starts pending. Targeted supplementary crosswalks now corroborate four candidate pairs by exact teams/scores with one-day date conflicts, but no bridge/start is newly accepted. See [NBA schedule review](M5_NBA_SCHEDULE_EVIDENCE_REVIEW.md).
- Original/corrected publication and actual start/completion instants are absent from the current licensed snapshots. Observation time, date-only fields, artifact updates and scheduled starts cannot be substituted. Without dated eligibility/availability and publication, retrospective strategy simulations would leak later knowledge.

## Dataset contract and recommended boundaries

Keep accepted Parquet/CSV inputs immutable. A future simulation view should contain canonical sport/season/game/player IDs, exactly one selected role, latest approved normalized inputs with explicit nulls, known participation state, position evidence quality and effective/known times, source hashes/record references, schedule identity and separate timing precision, and quarantine reasons. Join selective overlays by exact canonical keys and prior content hashes; retain old versions and the decision fingerprint. Row counts or revisions must never be counted as new games.

Use complete retrospective statistical vectors for pipeline/calculation checks first. Treat NFL/NBA as statistical-input candidates, not ready pregame fantasy simulations; require eligible-position cohorts and participation filters. MLB needs archive-wide application of the confirmed role policy with evidence, beyond the current 197 selections. NHL cannot support an unbiased cross-sport scoring comparison while most skater FO/SH inputs are absent; zero-filling would systematically undercount specific roles. Restricting NHL to the 194 currently complete players would introduce source-conflict and participation selection bias.

Exclude in-progress 2026-start samples and shortened/quarantined seasons from an initial like-for-like full-season study unless a separate reviewed cohort design explicitly addresses unequal games and rule/source changes. Do not introduce an unapproved normalization multiplier. V9 remains the baseline; prior exploratory V10 outputs are not activated or revalidated by this report.

**Readiness conclusion:** the immutable sources and canonical overlays are reproducible, but the unresolved NHL inputs, MLB historical role selections, position/timing gaps, participation bias and unequal season structures would invalidate an unqualified cross-sport optimization comparison. The handoff is suitable for planning and targeted dataset curation, not for claiming production or M6 simulation readiness.


## Current-turn candidates, not accepted coverage

The coordinated continuation has prepared a consolidated candidate set including 1,660 NHL revisions (1,620 skater rows plus 40 independently supported non-winner decisions), 16 additional MLB historical scores, 58 NBA identities and 538 identity aliases. If separately approved, applied and verified, the existing imported cohorts could improve from NHL 194/872 to 844/872 statistically complete and MLB 1,454/1,472 to 1,470/1,472. These are proposal impacts, not applied counts in this baseline handoff; new identities without statistics do not increase complete imported statistical populations. NFL roster-discovery counts remain subject to the separate concrete review. The root delivery/application report is authoritative for any later accepted update.

## Applied operational overlay — current handoff

The immutable archive aggregates above retain their original scope. The [new read-only application audit](../reports/m5-operational-application.json) now supersedes prior imported completeness: 5,951 accepted professional identities, 4,647 historical-stat players, 4,617 fully scorable players and 1,304 identities outside that archive cohort. After the approved operational source slice, two additional NBA identities have accepted source statistics: 4,649 identities have any accepted statistics and 1,302 have none. These denominators must remain distinct. By sport, complete historical-stat populations are NFL1,829/1,829, MLB1,470/1,472, NBA474/474 and NHL844/872. Exactly213 historical MLB role selections are materialized; two remain unresolved. MLB historical positions cover944 players,66,879 appearances and67,076 role rows. These overlays do not repair the full 44-season archive.

M6 must separately model the approved `NBA_GRANULAR_FAMILY_OBSERVED_V1` policy and distinguish explicit/family positions. Mapped guards/forwards have greater slot flexibility than granular-only cohorts. Do not mix unknown current positions, retrospective estimated minutes and approved prospective eligibility. Any controlled league/clock acceptance remains synthetic context even when professional statistics are real. Current source missingness, NHL backup/DNP participation, observed versus exact timing and source-age bias remain cohort selection constraints. M6, V10, weight optimization and contract automation remain inactive.
