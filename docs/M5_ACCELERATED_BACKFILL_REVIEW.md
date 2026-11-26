# M5 consolidated historical and identity backfill review

Status: **prepared; development application requires explicit approval**. No migration is included. This proposal is independent of the earlier approved NHL/MLB repairs. Operational release retrieval is already authorized and does not authorize these canonical changes.

Exact frozen batch: `387869154d0a85654c6e86c97877b2ecfdfaa199cd8e149b4ba72c51ca604940`.

| Component | Exact additions | Component SHA-256 fingerprint |
| --- | --- | --- |
| NHL missing inputs | 1,660 append-only stat revisions for 665 players: 1,620 skater appearances with exact FO/SH evidence; 40 explicit goalie-loss/non-win decisions | `d9be091dcc818f0e3b219b9f4bbbe9fd5382658ae9630273fc487780dcea0c20` |
| MLB role selection | 16 new global historical V9 ledgers and 16 entries | `02921815004815f0e912f572948d3b14e59e5c07cdd7eaecc625cb058685e5bd` |
| NBA identities | 58 real professional players; 538 aliases (58 direct IDs and 480 corroborated ESPN IDs) | `888a36d53df44bc5d43f6f9acf08d5e5b299bd193ef1ff8e815d9ac8f3b47d77` |
| NFL identities | 1,248 real professional players; 3,402 aliases (1,248 GSIS IDs and 2,154 explicit same-row ESPN IDs) | `415a455dab8af67e951dcc96823efe5ddb1a0218cb35b2f4bfa763b9474deb5c` |
| NFL historical statistics | 162 previously absent historical stat rows on seven already accepted V5 games, depending on two exact new NFL identities | `6c6bb8270a5728b9ab8fd6f5903a3658c3bf32e43ec7fb57de6f9fc78017cd2b` |

The combined append scope is 1,306 Players, 3,940 PlayerExternalIds, 1,822 PlayerGameStats, 16 ScoreLedgers, 16 ScoreLedgerEntries, two ImportBatches and two audited ProfessionalDataObservations/Decisions. Every existing row must remain identical. No Games, teams, schedule dates, current eligibility, ownership, financial ledgers, competitive scoring or official publication clocks change. Unsupported NFL professional positions remain represented without granting fantasy eligibility.

## Evidence and coverage

All 399 NHL games now reconcile. Shootout team-score semantics and legitimate goalie scoring actors explain the 48 previously held games; source completeness and explicit actor links remain required. Goalies receive known zero wins only when the complete canonical goalie inventory and an explicit different winning goalie establish the decision. No shutouts are inferred. Imported NHL complete-input players are expected to improve from 194/872 to 844/872; 40 unresolved shutout records across 28 players remain held.

The 16 MLB cases use complete-game, event-aware participation and starting-pitcher priority, without choosing scores by points. Kyle Freeland/game823317 and Orion Kerkering/game824807 remain unresolved. Complete imported MLB players are expected to improve from 1,454/1,472 to 1,470/1,472.

NBA aliases require independent identity corroboration; publisher name-only bridges do not qualify. NFL direct-ID collisions require reviewed distinct GSIS/birth-date proof; six unresolved same-name cases remain held. These new roster identities are counted separately from the 4,645 accepted archive professionals. The NFL statistical addition uses explicit existing game IDs, season/week/phase and actual GameTeam participation. It creates no game or timestamp and leaves source publication unknown. Its diagnostic calculation without TE eligibility leaves 110 missing TE-bonus decisions; historical observed positions do not grant current eligibility.

## Immutable source inputs

The ignored exact manifest `data/stat_enrichment/m5_accelerated_batch.json` contains all canonical player/game/stat targets, expected alias heads, prior stat hashes, source rows, team/season tuples and source proofs. Immutable objects are addressed under `data/provider_previews/objects/<sha256>` and verified again before deployment.

NFL roster: `4c896a493ac645ec66c0d0daed9cdbe72584ef9989e1d25d4d6a0092fa1a7698`; NFL statistics: `c5256b203f3c4de37222b95ec61a19b1e21b34f2496c8c5cd590146258f3fd36`. NBA roster: `33851efb72805317c1e5908337d7d4cb32a1f5c35b164af394293dc37734b2a5`; ESPN redistribution roster: `b1a1a52879730b931edc8bed0ca7b6f9679270fd3c7b839b8ca37715a45f5258`; corroborating player crosswalk: `797a164aa13a4e4ff6fd1af492e5a69d3d5e3759ea454389f819c2f3c0e0eed6`; prior NBA roster: `1468b9c76e9b3d0453d341d9fa2ef7acf6ae23b01c4a438e715ab0bfa758a78e`; team crosswalk: `e19391675c20d0a6f90e0ac8c770610adf1df46ac5a4d87f169b50eef0ffd5f7`. Full NHL/MLB object hashes and exact row evidence are retained in the pinned manifest and [historical reconciliation report](M5_HISTORICAL_CONTINUATION_REPORT.md).

Sources remain the reviewed nflverse/SportsDataverse CC BY 4.0 redistribution products. Attribution/change notices are preserved. No restricted direct feed, paid source or new license assumption is introduced.

## Validation and deployment

Read-only exact-target preview passed. Populated disposable-copy validation passed: all 89 application tables retained every original row, all 196 foreign keys validated, Prisma reported no schema drift, the deliberately invalid final component rolled back the whole transaction, all eight append-table counts matched, and replay added zero rows. Four-sport historical acceptance additionally verified 25 real complete V9 scores per sport and website analytics, with 100 disposable global ledgers/entries and no competitive results. Actual copied coverage was NFL 1,827→1,829 players with complete inputs, MLB 1,454→1,470, NBA unchanged474, NHL194→844. The expanded historical-stat population is4,647;1,304 other new identities remain roster-only. The private validation result is `data/stat_enrichment/m5_accelerated_batch_copy_validation.json`; it must match this batch fingerprint before deployment.

After explicit approval only: pause the managed stack; verify all 28 migrations; create a private custom-format development backup and verify its archive listing and full decode; recheck source objects/target heads; apply the exact batch in one serializable transaction with ordered sport locks; verify all 90 original development tables including migration history and exact eight-table append scope; verify V5/56 V9 weights; restart workers and check real website behavior. The prepared entry point is `src/workers/apply-reviewed-accelerated-batch.ts`, requiring the exact approval fingerprint in `APPROVED_ACCELERATED_BACKFILL`. It is not executed by ordinary sync or tests.

A failed transaction rolls back all its appends. A committed evidence correction requires an audited compensating revision and fresh review; old rows are not deleted or rewritten. Retain the verified private backup for separately authorized recovery. Do not automatically restore over subsequent user activity. No migration rollback is needed because this batch adds no schema.

## Separate exact MLB historical-position continuation

A second independently fingerprinted target is prepared from the completed 537-case audit: **251 append-only historical position revisions for nine existing MLB players**, and one ImportBatch. Exact target: `ee09780d243fc11e0246e23678554109c3b717acaf746b78f15cc770218ddebc`; source-manifest hash: `b23a06cc2cd91de5d421846bcc51b91898d9eb7aead6fa956b2a573d7b0c7bec`. It is not included in the five-part batch fingerprint above.

Source verification independently rehashes the recovered MLB archives and checks 250 explicit pitching source rows against player/game/team IDs, positive pitching participation and starts/relief evidence. Distinct games meet the established SP/RP thresholds. The 251 canonical role-row targets are bound to exact prior IDs/content hashes; all currently lack observed positions. The separate ignored manifest/preview are `data/position_enrichment/mlb_nine_role_historical_manifest.json` and `mlb_nine_role_historical_preview.json`. The [537-case audit](M5_MLB_POSITION_HOLDS.md) records all nine IDs, threshold counts, carry cases and residual ambiguities.

This repairs historical display observations only. It never creates current eligibility, fielding-game facts, publication timestamps or scores. The source-known timestamp of every prior stat is preserved. Prior-2025 carry evidence for 140 cases remains pending actual dated evidence under the unchanged policy.

Its populated-copy check passed: all 89 original application tables/rows preserved, 196 foreign keys valid, no schema drift, exactly 251 appended stats and one ImportBatch, both replays zero. Latest 2026 MLB historical position coverage rose from935 to944 players,66,629 to66,879 distinct player/game appearances, and66,825 to67,076 role rows; all denominators remained unchanged. The independent deployment entry point, `src/workers/apply-reviewed-mlb-position-continuation.ts`, requires its exact fingerprint in `APPROVED_MLB_POSITION_CONTINUATION`, a matching populated-copy proof, paused workers and another fresh fully decoded private backup. If both targets are approved together, apply the main batch first, verify its exact scope, then this independent continuation with its own backup and preservation checks. A failure in one transaction does not delete a previously verified independent batch. Both original target sets remain frozen; no schema change is involved.
