# M6 historical starter reconciliation

November 27, 2026. Continues synchronized `ac3d1d6`; implementation checkpoint is recorded by Git history. This closes the original-assignment audit and supported engine repairs, not M6.1/M6.3 acceptance. The frozen D1–D6 fingerprint remains `3cd6215433978e520fc215dda4f4aa83463193c9a89b483ce4c1b24f9e1a1daa`. All work is offline, with no development migration or backfill.

## All 12,181 original assignments

The [exclusive audit](../reports/m62-original-starter-reconciliation.json) reconciles exactly to the preserved seed31 trace, SHA-256 `d80f04a4deefe266c77c052d0ac3766aa63a515af202402445d6cc4125e0735e`. Each category includes sport, season, position slot, distinct players/games, affected franchises, cause, scoring impact and required evidence. Individual facts and secondary flags remain in the hash-bound ignored JSONL; the public summary contains its fingerprint.

| Primary cause | Count | Supported interpretation |
| --- | ---: | --- |
| Missing player-game row | 10,611 | NFL599, MLB5,859, NBA2,443, NHL1,710. Participation unknown; no missing→zero inference. |
| Explicit verified DNP | 1,094 | NBA518 new published DNP; NHL576 existing zero-TOI/DNP rows excluded by old selected-role compiler. |
| MLB other doubleheader game | 274 | Appearance in another game does not settle the requested game. |
| Wrong modeled team with another actual appearance | 86 | NFL28, MLB27, NBA26, NHL5. Actual scoring truth and earlier modeled knowledge remain separate. |
| Played, incomplete V9 inputs | 52 | NHL shutout credit only. |
| Verified non-scoring MLB role | 33 | Confirmed single-role policy, not player nonparticipation. |
| Stale prior team, no same-period appearance | 20 | MLB17, NHL3. Prior observation alone is insufficient roster proof. |
| Recovered played participation | 9 | NFL positive snaps + canonical IDs; original complete score inputs unchanged. |
| Another game on same UTC day | 2 | NBA1, NHL1; canonical namespaces reconciled. |
| **Total** | **12,181** | Primary buckets are mutually exclusive; secondary flags overlap. |

No original assignment is established as a bye/off-day phantom, duplicate, missing professional game, unresolved identity or suspended-game primary cause. The audit explicitly records zero for unsupported requested categories rather than fabricating examples. Nonstarting pitchers may relieve. A player not found in a box is not thereby proved off the roster. Chronology is an independent cohort acceptance blocker, not automatically the cause of a missing player-game row.

## Engine repairs and supported settlement

The existing engine now retains frozen starters through later professional games, including MLB doubleheaders, preserves their locked positions and uncertainty, and waits for every relevant earlier appearance to release a lock. It records pregame manager assignments separately from scoring assignments. Canonical actual-game membership can attribute an appearance only when the player was already in the frozen slot and still owned at actual start; it cannot backdate a choice, grant dropped-player points or optimize a lineup with realized participation.

Settlement consumes explicit DNP, confirmed non-selected MLB roles, and snap-proven NFL appearances separately. It rejects contradictory/duplicate terminal evidence and conflicting canonical team membership. Confirmed role selection takes precedence over physical participation in both MLB roles. NFL recovered inputs enter only terminal scoring, evaluated through production V9; no scheduled-date publication timestamp or new ranking observation is invented. Original statistics/publication fields remain intact.

The old compiler excluded 576 explicit NHL DNPs along with unselected roles. The overlay restores those facts without rewriting its frozen output. NBA native IDs and ESPN IDs are bridged by published candidate pairs corroborated through twelve exact statistics in at least three uniquely matching canonical games; 549 pairs qualify. Names never establish the accepted identity. 133 conflicting/unresolved DNP source cases remain quarantined. There are 5,873 regular-season explicit NBA DNP facts and 2,450 NHL DNP facts in the separate derived inputs.

## Corrected seed31 and denominator bridge

| Sport | Before scored | After scored | Explicit DNP | Non-scoring role | Before unresolved | After unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NFL | 1,704 | 1,733 | 0 | 0 | 636 | 627 |
| MLB | 9,471 | 10,961 | 0 | 41 | 6,210 | 7,565 |
| NBA | 9,563 | 9,651 | 526 | 0 | 2,988 | 2,501 |
| NHL | 7,462 | 7,500 | 583 | 0 | 2,347 | 1,786 |

The [exact canonical-key bridge](../reports/m62-denominator-bridge.json) preserves **all 40,381 original assignments**. Of the original unresolved cases, **1,136 resolve** (1,094 DNP +33 non-scoring roles +9 played), leaving11,045. Corrected carry/actual-game settlement adds3,093 assignments:1,636 played,15 DNP,8 non-scoring roles and1,434 unknown. Therefore **11,045+1,434=12,479** corrected unresolved. No original keys were deleted. Rising total unresolved reflects corrected opportunity coverage, not a loss hidden by net reporting.

All108 draft starter seats per sport still fill. Per-franchise known points, position contribution, replacement comparisons, draft/waiver usage and exact before/after counts are in the [corrected report](../reports/m62-corrected-seed31.json). Its fingerprint is `f72eae09ebeb4d33e4de16a3a561e1b74be7251c12de9a3ef47f478ee0c827ed`. Known-subset totals are diagnostic; no official median/spread is published. A second execution reproduces the fingerprint, and removing all new terminal/membership facts leaves draft, manager history, expected lineups and waivers identical in all four sports. [Proof](../reports/m62-evidence-verification.json).

## 2023 professional inventory and completion day

| Sport | Canonical regular games | Separate inventory matches | Accepted closed membership | Verified completion UTC days |
| --- | ---: | ---: | --- | ---: |
| NFL | 272 | 272 | Yes, official published game-level season record | 2 |
| MLB | 2,430 | 2,430 | No, shared-upstream alternative remains gated | 2,427 |
| NBA | 1,230 | 1,230 | Yes, native NBA Stats inventory against ESPN-derived V5 | 1,229 |
| NHL | 1,312 | 1,312 | No, shared-upstream alternative remains gated | 52 |
| **Total** | **5,244** | **5,244** | **No accepted four-sport cycle** | **3,710** |

NFL week/team-pair membership is verified against the [official 2024 Record and Fact Book](https://static.www.nfl.com/league/apps/league-site/media-guides/2024/2024-Record-and-Fact-Book.pdf), SHA `ed58911ff56141c9bb7c31f7c5b46f59ef5fe70790f35f6a7c566b36c1ff7c88`. All32 clubs have17 matches. Three printed score/home typography conflicts are retained; original V5/PBP values are not overwritten. This is an independent published artifact with league upstream shared, not a different independent publisher. [NFL manifest](../reports/m62-nfl-inventory.json).

NBA native regular-season IDs bridge exactly to all1,230 V5 fixtures with matching final scores. MLB full PA records and NHL native game-info records match their observed calendars, but different filenames sharing the same league upstream do not alone meet D6. Aggregate league counts are corroboration, not substitute game-level certification. [Game-level reconciliation](../reports/m62-game-reconciliation.json).

Completion evidence uses explicit terminal clocks, final-score checks, contiguous MLB PA/actor inventories, or official NHL final summaries with stated local date/end/timezone. NHL reports require a unique interpretation of the printed twelve-hour clock compatible with the verified start. No scheduled start alone supplies completion. NFL final clock-free END_GAME rows remain insufficient. The three MLB exceptions `718394`, `716453`, `716404` are shortened/suspended finals requiring the actual final-call day. NBA `401585363` has a PBP final-score conflict; the [official final box](https://statsdmz.nba.com/pdfs/20240208/20240208_CLEBKN.pdf) confirms95–118 but gives no actual end UTC clock. Duration plus scheduled start is not substituted. **1,534 games remain without accepted completion-day evidence**.

Source catalogs, immutable bodies, license links, exact URLs, bytes and SHA-256 receipts remain under ignored `data/provider_previews/` and `data/simulation/evidence_closure_v1/`; public reports bind them. NFL/nflverse and NBA/MLB SportsDataverse products use the existing permitted CC-BY registry. Official published references are retained separately, without restricted-provider activation. No accepted Parquet or V5 input is replaced.

## Actual statistical uncertainty and evidence decisions

Only shutout credit affects the original52 known-played incomplete starter assignments. Their fixed-assignment missing-component interval is0..972.4points (52×18.7V9points). Corrected coverage has53 missing-SO assignments, interval0..991.1. These are not bounds on complete unknown outcomes, adaptive rankings, waivers or strategy feedback. Targeted official summaries confirm sole-goalie/zero-GA/full-time evidence for52 games, but do not explicitly publish the shutout credit; no credit was inferred. Faceoff, shorthanded-point and goalie-win gaps elsewhere in the archive were not falsely reported as affecting these original52 cases. NFL186 unidentified records and MLB35 unresolved paired keys remain quarantined.

[Exact inactive proposals](../reports/m62-evidence-policy-proposals.json) preserve D1–D6: the already required category-complete nonparticipation proof with applicable roster identity; a conservative historical-only completion proxy with strict exception exclusions; and multi-evidence NHL shutout credit. Their target fingerprints are recorded, but missing prerequisite facts mean they are **not ready for a bulk application approval**. No approximation or broad absence-to-DNP rule was activated. Continue targeted source/roster evidence first. The proposal includes a comparison with existing two-day/weekly models and explicitly identifies look-ahead risk; no lag repairs an undetected multi-day suspension.

## Acceptance and continuation

M6 remains **19/28**. M6.0 preparation and M6.2 mechanics are accepted within scope; M6.1 and M6.3 remain **unaccepted**. No comparable historical cycle is yet accepted; no new official seed31–50 campaign is run on incomplete evidence. The earlier28 diagnostic leagues and all originals remain preserved. Generalization to other years is dependency-blocked until this first cycle qualifies. The reserved2025/51–70 campaign remains unexposed by this work; 2025 is already historically exposed, so a prospective holdout needs separate review.

Before V10 work: close MLB/NHL inventory evidence, missing completion days/exception facts, applicable roster/participation inventories, and defensible statistical uncertainty; accept exact cohort manifest under frozen policies; run the unchanged V9 validation seeds; establish reproducible official balance/uncertainty; accept M6.1/M6.3; obtain subsequent phase authorization. V10 optimization/activation, contract automation and M7 remain unauthorized.

Final regression and preservation receipts are recorded in `reports/m62-verification.json` and `reports/m62-preservation.json`. The original normal suite passed; a first shuffled run exposed an intermittent recurring-competition concurrency backoff. The diagnostic rerun confirmed `TransactionWriteConflict` from Prisma7’s pg adapter at commit. A narrow fix recognizes its typed cause and SQLSTATE40001/40P01, as well as raw-query P2010 conflicts and existing P2034, with the same bounded retry policy and lease fences. The assertion now includes complete result diagnostics; the full shuffled suite passes after the adapter fix. No assertion or timeout was relaxed.
