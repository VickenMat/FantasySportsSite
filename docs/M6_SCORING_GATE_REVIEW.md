# M6 scoring gate review

The old `strictSimulationEligible:false` is unconditional in `src/simulation/preparation/scoring-readiness.ts`. Its eleven materialized artifacts are NHL season partitions2016–2026, totaling506,116physical player/game/role rows. They are not eleven distinct gate algorithms and the zero does not mean zero arithmetically scorable games or players. They remain frozen.

The new independent G01–G11 audit separates statistical and decision predicates across all1,746,957physical rows. All supplied historical statistical known-at fields are null. Measured strict rows therefore remain zero even after source-supported conflict resolution. Counts of strict players/player-seasons, sport-seasons and accepted complete four-sport cycles are consequently zero; those are separately named denominators, not interchangeable meanings of the former flag.

| Gate | Requirement | Scope | Independent passing rows | Independent failing rows | Waterfall remaining | Newly excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| G01 | Valid normalized source row | SCORING | 1,746,771 | 186 | 1,746,771 | 186 |
| G02 | Explicit native player identity | SCORING | 1,746,771 | 186 | 1,746,771 | 0 |
| G03 | Explicit native professional game identity | SCORING | 1,746,957 | 0 | 1,746,771 | 0 |
| G04 | One supported selected scoring role | SCORING | 1,544,266 | 202,691 | 1,544,266 | 202,505 |
| G05 | Explicit played participation | SCORING | 1,699,011 | 47,946 | 1,541,138 | 3,128 |
| G06 | All required V9 inputs known | SCORING | 1,744,429 | 2,528 | 1,538,796 | 2,342 |
| G07 | No unresolved known source contradiction (independent full-vector comparison available for NHL only) | SCORING | 1,746,957 | 0 | 1,538,796 | 0 |
| G08 | Nonempty historical position evidence (not proof of dated applicability) | DECISION | 1,666,880 | 80,077 | 1,465,481 | 73,315 |
| G09 | Historical statistical information availability known | DECISION | 0 | 1,746,957 | 0 | 1,465,481 |
| G10 | Historical position effective/known chronology known | DECISION | 0 | 1,746,957 | 0 | 0 |
| G11 | Discovery, schedule and availability decision chronology established | DECISION | 0 | 1,746,957 | 0 | 0 |

Independent failures overlap; do not add that column. The waterfall attributes each exclusion once, and sums to the physical row denominator. Per-cohort overlap signatures and per-position impact are in the JSON. G03 preserves native game IDs even on NFL rows quarantined for missing player identity. G07 means no unresolved *known* contradiction, not universal independent publisher corroboration. G08 is position presence, not dated eligibility; G10 supplies the distinct chronology requirement. G11 is strategy-dependent rather than a universal requirement to invent health evidence.

| Existing NHL artifact year | Physical rows | Frozen retrospective rows | Frozen strict rows |
| --- | ---: | ---: | ---: |
| 2016 | 49,197 | 46,581 | 0 |
| 2017 | 50,840 | 48,225 | 0 |
| 2018 | 50,840 | 48,193 | 0 |
| 2019 | 43,280 | 40,985 | 0 |
| 2020 | 34,700 | 32,917 | 0 |
| 2021 | 52,460 | 49,809 | 0 |
| 2022 | 52,460 | 49,814 | 0 |
| 2023 | 52,468 | 49,818 | 0 |
| 2024 | 52,473 | 49,782 | 0 |
| 2025 | 52,478 | 49,835 | 0 |
| 2026 | 14,920 | 13,751 | 0 |

G01–G07 are necessary statistical predicates; G08–G10 concern historical decisions. G11 depends on whether the manager strategy uses health, discovery and schedule assumptions. Production fantasy ownership, production snapshots, worker receipts, correction-window anchors and production finalization are explicitly excluded from these simulation requirements. None is secretly responsible for this zero.

Implementation/evidence: `scripts/audit-m6-simulation-gates.py`, original prepared/enriched partition hashes, original eleven gate hashes, separate native-event resolution manifests, source missing/position/participation masks and source chronology fields. Each gate's missing evidence and review requirement is recorded in [the machine-readable audit](../reports/m6-simulation-gate-audit.json).

No production gate, original scoring-gate artifact, V9 rule or historical known-at field was relaxed. An approved approximation must create a separately labeled simulation information timeline, not overwrite source publication. [Methodology decisions](M6_UNRESOLVED_DECISIONS.md).
