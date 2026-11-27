# M6.0 NHL historical enrichment

Actual offline enrichment covers all 11 seasonal source cohorts, 2016–17 through partial 2026–27. Compact report fingerprint: `2bc5a7082f09a8018706796771f61490b2f426874e5808fc5119072f2f8c11b6`.

The 55 licensed SportsDataverse Parquet products contain 199,002,470 retained bytes. Receipts record 110 HTTP requests including redirects. Acquisition reuses existing immutable storage and conditional transport, never changes the operational source registry or recurring policy, and enforces durable 60/minute and 600/hour ceilings with a conservative3-second request interval after the first bounded pass. The first local 60-request cap stopped acquisition; cached progress resumed without source replacement. Retained-source schema names/types are profiled independently for every season.

These are published source-cohort counts, including regular/postseason records where present. They differ from the 506,116-row accepted archive. The core 44-cohort pipeline separately joins exact season/game/player/role, preserves original values and quarantines nonnull contradictions. No source-cohort percentage is a claim of archive simulation readiness.

| Season start | Skaters | Exact FO | Exact SH | Goalies | Known win | Known SO | Unknown SO | Source V9 complete |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 47,409 | 47,373 | 47,301 | 5,268 | 5,268 | 5,010 | 258 | 52,311 |
| 2017 | 48,780 | 48,708 | 48,708 | 5,420 | 5,419 | 5,180 | 240 | 53,887 |
| 2018 | 48,888 | 48,816 | 48,816 | 5,432 | 5,432 | 5,211 | 221 | 54,027 |
| 2019 | 43,632 | 43,524 | 43,415 | 4,850 | 4,848 | 4,661 | 189 | 48,075 |
| 2020 | 34,252 | 34,252 | 34,252 | 3,808 | 3,808 | 3,633 | 175 | 37,885 |
| 2021 | 50,415 | 50,415 | 50,415 | 5,605 | 5,603 | 5,387 | 218 | 55,801 |
| 2022 | 50,381 | 50,381 | 50,381 | 5,599 | 5,599 | 5,405 | 194 | 55,786 |
| 2023 | 50,389 | 50,389 | 50,389 | 5,599 | 5,599 | 5,390 | 209 | 55,779 |
| 2024 | 50,321 | 50,321 | 50,321 | 5,592 | 5,592 | 5,369 | 223 | 55,690 |
| 2025 | 50,183 | 50,183 | 50,183 | 5,575 | 5,575 | 5,401 | 174 | 55,584 |
| 2026 | 14,364 | 14,364 | 14,364 | 1,596 | 1,596 | 1,552 | 44 | 15,916 |

The overlays provide 488,726 exact faceoff-win rows and 488,545 shorthanded-credit rows. Goalie-win evidence covers 54,339 rows; 52,199 shutout fields have supported known values, while 2,145 remain unknown. None of these five product families provides explicit positive shutout credits. Positive-time zero-GA cases remain unknown; known zero is supported only by positive GA or explicit zero playing time. A complete same-game unique explicit winner inventory can prove nonwinner zero.

Faceoffs reconcile independently from scoring credits, so a scoring conflict does not discard independently verified faceoff evidence. Shorthanded points require all ordinary goals/assist actors/strengths to match complete boxes. A historical-only 2019–20/2022–23 format profile is pinned to exact scoring and event SHAs: omitted shootout deciding credits are excluded from individual scoring; the explicit final SO period, correct +1 final team adjustment and complete ordinary goals/credits/boxes must all agree. No shootout row or actor credit is fabricated. Runtime helper defaults remain unchanged.

Every numeric field has `proof[field]`, source hashes, event/credit references or explicit known-zero evidence, and a transformation version. Every overlay is historical-only and has `sourceKnownAt:null`. Acquisition time is retained separately and never backdated to the professional game. These overlays cannot establish past fantasy eligibility, current positions, prior-information-only decisions or competitive ownership.

Reproduce with `fetch-m6-nhl-history.ts --seasons=2017,...,2027`, then `prepare-m6-nhl-enrichment.ts` over the same explicit end years and `report-m6-nhl-enrichment.ts`. Existing cached products are SHA-verified without requests. `--verify-only` recomputes overlay bytes from retained decoded source files without rewriting frozen outputs. Large inputs, decoded files and overlays remain ignored under `data/`; code/tests and the compact report are tracked.

Real 2016–17 and format-profile 2019–20 overlays were recomputed without writes and matched their complete output bytes and metrics exactly.

Eight targeted unit tests pass, covering exact fields, unknown shutouts, independent faceoff/scoring evidence, format rejection, duplicate identities and historical shootout omission without changing runtime behavior. Database tests and production writes were not run by this workstream. Active V9 weights, V5 inputs, accepted archives and current eligibility remain unchanged.

## Full base-vector corroboration

Supplemental-field agreement does not establish agreement of the preserved archive's goals, assists, shots, blocks, hits or goalie saves/GA with the newer publisher boxes. A separate audit now compares every available direct weighted base field on all 506,116 archive tuples. Report: `reports/m6-nhl-full-box-corroboration.json`, fingerprint `e24c395ea12cb73c627156a1fcc9fd4494c9ca5a294f7adbdbb238154a38b43b`. Reproduce with `python3 scripts/audit-m6-nhl-full-box.py`.

The audit finds 441 unresolved known-value conflicts: 16 goalie-save rows in 2021–22 and 425 rows across 155 games in partial 2026–27. The latter exactly reproduces the M5 queue's 425 held rows. All archive tuples match a retained box; no team or missing-field comparison explains the discrepancy. The other nine cohorts have no known base-field differences.

Of the 503,774 archive rows with complete numerical V9 inputs after enrichment, 438 have a known base-vector conflict. Therefore at most 503,336 rows qualify for scoring after this additional evidence gate; numerical completeness and scoring readiness must remain separate. The independent FO/SH facts remain preserved, while conflicted scoring vectors are withheld. Neither archive nor newer source values are silently preferred or overwritten.

Retained PBP diagnostics match the newer box saves in all 16 older cases. For current-season differences, event counts match 79 of 80 blocked-shot values, all 95 hit values, 142 shots-on-goal values, 99 save values and four goal values in the newer boxes. One blocked-shot event count instead matches the archive, so a blanket preference for the newer box would hide a real source disagreement. Assists remain tied to explicit scoring-credit reconciliation rather than potentially stale PBP assists. These diagnostics do not authorize an archive correction.

The earlier zero-conflict supplemental-field result is strictly scoped to supplemental fields. It must never be reported as zero full-source scoring contradictions. Unknown goalie shutouts remain an additional nonrandom missing-data gate: excluding positive-time zero-GA appearances disproportionately removes successful goalie performances and cannot establish cross-sport simulation comparability.
