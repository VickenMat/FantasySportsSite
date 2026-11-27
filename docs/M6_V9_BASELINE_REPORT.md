# Unchanged V9 evaluation: baseline status

> **Current execution:** D1–D6 are approved. [The current execution report](M6_METHODOLOGY_EXECUTION_REPORT.md) records real historical diagnostic campaigns and remaining cohort/statistical blockers. The synthetic workloads below remain foundation evidence, not an official baseline.

**No official historical V9 baseline has been executed. No historical four-sport scoring spread is established.** M6.3 remains unaccepted. Unknown inputs, historical chronology, source inventory and material methodology choices are not removed to force a result.

## Actual historical diagnostics

Existing hash-bound partitions contain 1,538,796 source-qualified score rows. The [44-cohort input diagnostics](../reports/m6-v9-input-diagnostics.json) report counts, known numerical sums and observed score ranges. These are unowned player-game inputs, not drafted franchise starter totals. They cannot establish mean/median franchise performance or cross-sport balance.

The NHL source overlay resolves all441original contradictory rows using terminal native-event actors;438 additional rows have complete scoring inputs and480,148 now meet retrospective selected/played criteria. Unknown1,979shutout credits remain unknown. Excluding these cases can preferentially remove strong goalie games, so near-total numerical completeness is not an unbiased baseline.

All strict decision-time cohorts remain blocked by missing historical known-at information. No production ownership, starter history, worker receipt or finalization record is required to generate synthetic fantasy state; those production-only records are not the blocker.

## Engine workloads — synthetic only

Twelve franchises, nine starters per sport, five sport-specific bench seats, five shared bench seats and five IR capacity were exercised. Explicit fixture allocation is NFL2/MLB1/NBA1/NHL1; it is not an approved historical strategy. All professional identities, health, schedule and outcomes in this workload are synthetic. Scoring uses the unchanged production V9 engine.

| Seed | Elapsed ms | Replay identical | Output fingerprint |
| --- | ---: | --- | --- |
| 11 | 548.587 | True | `3135669ed00295206247ed0e6a95ed5b4eb7e15c06a5438eed0fdddb09f4d7a0` |
| 29 | 421.594 | True | `697c890568c80d80926b30a88bacb7df80368e64431a487228cad4557cb90bf3` |
| 47 | 344.191 | True | `b9d6dc9c7f35c6cfd6fa64f51fa5d26fe0b49160a4c5757b27f43771c0fec1d4` |

The workload includes 40,320 synthetic outcome rows over 30 synthetic dates per sport. Sampled peak Node RSS is 395,247,616 bytes. Fixture construction and production scoring took 144.075ms. Engine phase timings separate draft/initialization, lineup/settlement and waiver phases. They are environment measurements, not runtime guarantees.

Reading the three native-key columns from all 1,746,957 existing source rows took 97.878ms; native-key iteration took 1277.532ms. Peak sampled Python process RSS was 133,103,616 bytes. This is a loading benchmark, not a simulation.

The [fixture report](../reports/m6-foundation-fixture-performance.json) contains franchise distributions, score/start/slot rates, position contributions, draft-round and waiver points, distinct-player bench exposure and available-player replacement expectations. Expected replacement values are prelock and constrained by actual synthetic ownership. Missing starter inputs are withheld; they do not become zero. Injury counterfactual, year-to-year stability and championship effects are not fabricated from a short fixture.

The established spread uses sport medians. Fixture-only spreads and pairwise comparisons test the arithmetic; they cannot measure real UBP imbalance. Three synthetic seeds do not support professional confidence intervals. Proposed larger disjoint seed groups and the V9 chronological split await method/cohort acceptance.

## Reproduce

```sh
node --import tsx src/workers/benchmark-m6-foundation.ts
python3 scripts/benchmark-m6-columnar.py
node scripts/verify-m6-foundation.mjs --verify-existing
node --import tsx src/workers/prepare-m6-fixture-selection.ts
node --import tsx src/workers/run-m6-simulation.ts data/simulation/foundation_fixture/selection/manifest.json /private/tmp/new-m6-fixture-result.json
```

The output path must be new. The four-sport CLI verifies each snapshot SHA and rejects an OFFICIAL manifest before execution because no official method/dataset is accepted. It never writes operational PostgreSQL. [Decision review](M6_UNRESOLVED_DECISIONS.md), [machine-readable baseline status](../reports/m6-v9-baseline-status.json).
