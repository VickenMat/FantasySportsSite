# Real source processing and controlled competitive acceptance

The source-processing preparer reads development data only in explicit read-only transactions. It validates retained source body hashes and builds review candidates; it does not promote professional data, grant eligibility or activate a feed. Large queue/manifest artifacts remain ignored under `data/stat_enrichment/competitive_processing/`.

## Actual retained-source queue

The prospective first-validation receipt distinguishes local validation of retained source facts from the original source retrieval, artifact modification, exact actual game events and official publication. Exact actual start/completion and official publication remain null when absent. An unchanged exact source/canonical-binding bundle reuses its first-validation receipt.

Frozen initial prepared source scope (preserved; later expanded queues are separate):

| Sport | Identified games | Complete stat candidates | Full source-box binding candidates | Held stat rows | Held game bindings |
| --- | ---: | ---: | ---: | ---: | ---: |
| NFL | 164 | 3,715 | 164 | 0 | 0 |
| NBA | 241 | 6,737 | 226 | 17 | 29 |
| NHL | 399 | 14,458 | 194 | 1,502 | 0 |

These are source/body and historical-input results, not a claim of production pre-lock fantasy eligibility, actual live coverage or finalized leagues. NBA retains explicit zero-count DNP rows, original minutes and comments; no missing minutes or counts are replaced with zero. Missing canonical player IDs and game bindings remain held.

NHL's held population includes 1,040 source rows across 26 existing V5 games with no approved canonical historical statistical row, 425 rows where current box values differ from accepted canonical known fields, and 37 otherwise matching rows with missing shutout evidence. Three additional shutout-unknown rows also have known-field conflicts: all 40 accepted canonical unknown-shutout rows remain withheld. The queue records exact accepted/source field differences and original stat hashes rather than overwriting known values. The 373 historical NHL games' existing `GameTeam.side=UNKNOWN` records are retained; accepted V5 observation IDs/hashes provide explicit home/away binding in the derived DTO only.

The original three-sport queue did not infer MLB final states from play-by-play. The newly verified separate MLB schedule/accepted-history supplement is documented in M5_MLB_OPERATIONAL_CAPABILITY_REVIEW.md. The retained play-by-play itself still has no explicit final-state field. Neither its last play nor complete PA counts are promoted into a game-final or completion timestamp. The two unresolved MLB participation records and missing explicit NHL shutout evidence remain genuine source gaps; no repeated restricted-source collection or inferred repair was added.

## Bounded three-game proposal

`reviewed_three_game_manifest.json` is frozen at fingerprint `1640180613acdf23fc6289c9a6e06764b74ac46c88f2a4509175e8dfdb426f6a`:

| Sport | Actual source game | Canonical game | Statistical rows |
| --- | --- | --- | ---: |
| NFL | `2026_01_NE_SEA` | `f09d16f8-65e1-4652-ac77-37cfb82b3f81` | 23 |
| NBA | `0022600001` | `82ff559b-6e99-4c14-b492-eeef35a27e5b` | 35 |
| NHL | `2026020002` | `5239eff2-7e53-474e-a6d1-6d4ff1de910c` | 40 |

The proposal contains 98 STAT records and three observed-policy FINAL states. This exact three-game slice was explicitly approved as part of initial operational target bdf5696a… and applied:98 statistics/global V9 scores and three complete-box clocks. A/B alone did not authorize it. Future recurring statistics remain separately gated. Every original source/stat/ownership/financial record and accepted game timestamp remains intact.

`applyCompetitiveStages` checks retained source bytes, canonical game/participant/schedule proof, accepted historical stat heads, expected observation heads and expected ledger heads before append-only promotion. It uses the existing V9 calculator and binds actual resulting source-stat and score-entry IDs to the complete-box service. Its immutable batch receipt permits zero-change replay. It creates no position evidence and never edits original game times, ownership, roster assignments or finalized competitive results. Recorded NFL game position may supply the already approved historical global TE scoring context; it grants no current lineup eligibility. Missing pre-lock fantasy evidence still blocks the independent snapshot/competition gates.

## Separate controlled acceptance

`validate-real-competitive-stages.ts` runs only in an authorized populated disposable schema. It uses the actual canonical game/player IDs and retained source statistics, while explicitly labeling hypothetical pre-lock fantasy ownership, position/availability evidence and clock advancement as synthetic setup. None of that hypothetical chronology belongs in development or is represented as actual professional history.

For one full source game per sport it exercises the 15-stage path from real identities through controlled accepted eligibility, assignments, conservative locks, immutable starter snapshots, real V9 statistics and provisional scores, first-final completion, complete-box validation, a persisted correction anchor, controlled 24-hour finalization and website standings/analytics. Bench and IR records are excluded, missing snapshots block before capture, delayed-source lineup attempts are rejected, and a genuinely new Node process verifies replay. A separately labeled synthetic post-final statistical correction proves finalized-result protection; it is never attributed to a real publisher or described as an actual observed professional correction episode. Existing dedicated fixture tests cover normal in-window corrections without clock reset and audited invalidation/replacement.

The populated-copy hook is `--verify-real-competitive-stages`. Scoped unit tests and static checks passed; database execution belongs to the coordinated parent verification run. Completion of this worker is not itself evidence that all 15 stages have passed until that report is produced.

## Later licensed-source reconciliation

The separate expanded NBA queue binds all270 source games using explicit publisher ID/participant bridges:7,500 statistical candidates,254 full boxes,18 held rows across six missing player IDs. All29 former game-binding gaps are reconciled without changing accepted V5 games or four historical crosswalk proposals. The frozen initial manifest remains unchanged.

NHL future-source derivation supports1,029 of1,040 rows across26 games beyond archive inputs, with15 complete boxes; seven missing-identity appearances and four unsupported shutout rows remain held. Existing425 known-field conflicts remain held. Exact separate NHL40 proposal9fdd5523… and MLB26 historical-box proposal0bb7222f… are not part of the approved initial batch. FINAL-only bootstrap f6524ebe… independently covers3,258 other games and needs no statistical completeness claim.

Current root acceptance passed the three real-source14-stage mechanisms, including actual new-process zero replay, reused source rows, bench/IR exclusion and controlled24-hour finalization. Chromium stage15 and the independent MLB controlled-source path are being completed; final results belong in [the40-item delivery report](M5_OPERATIONAL_DELIVERY_REPORT.md).
