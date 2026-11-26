# M5 accelerated implementation and evidence report

Continuation baseline: synchronized `e758a46`, November 26, 2026. This report records implemented mechanisms, measured retrieval and prepared exact targets. **Both exact populated-copy reviews passed; development application still awaits one consolidated approval. All final automated verification passed; Git commit/synchronization remains pending. The two exact backfills and two product-policy choices remain unapproved.** This is a verified engineering delivery, not M5 completion or authoritative live activation. The original 32 checklist rows and six M4 gameplay journeys are preserved.

## 1. Git checkpoint and synchronization

The verified starting checkpoint is `e758a46`. The current implementation is an uncommitted shared batch; the final verified descendant, upstream synchronization and commit will be recorded after acceptance. Automatic ordinary fetch/commit/push authorization applies; no force push, excluded source objects, private backups, credentials or user-owned screenshots belong in the implementation commit.

## 2. Exact M5 checklist completion

**13 checked / 19 unchecked / 32 total**, versus 12/20/32 at the starting baseline. Only the existing source-selection row closes: the actual minimum permitted products, data-license links, attribution/change notices, immutable retention, no subscription/credential requirement and conservative request budgets are recorded. Other mixed requirements remain unchecked despite substantial partial engineering progress. M4 remains 60/60; no V10/M6 implementation begins.

## 3. Remaining unchecked requirements individually

The [closure audit](M5_REQUIREMENT_CLOSURE_AUDIT.md) and [machine-readable audit](../reports/m5-requirement-closure-audit.json) retain all original 20 baseline unchecked rows with stable U01–U20 IDs. U01 is now closed. The following 19 remain open; these are the existing rows, not added requirements.

| ID | Remaining scope | Classification and exact next action |
| --- | --- | --- |
| U02 | Product field/year/latency/reliability/publication verification | Real-source acceptance incomplete; Missing authoritative evidence. Verify missing categories and chronological corrections/reliability; obtain exact clocks or approved evidence policy. |
| U03 | Licensed discovery, team/position revisions/retractions and identity resolution | Partial implementation; Missing authoritative evidence. Complete controlled identity tests and reviewed population application; integrate dated facts under approved precision rules. |
| U04 | MLB/NBA historical/current position resolution | Partial implementation; Missing authoritative evidence. Resolve withheld MLB threshold/team evidence; retain estimates; approve exact NBA mapping if desired and review dated targets. |
| U05 | Independent season boundaries and future starts | Missing authoritative evidence; Real-source acceptance incomplete. Obtain actual endpoints/following-season IDs and positive-team explicit-start revisions. |
| U06 | Actual starts/completions and exceptional game states | Partial implementation; Missing authoritative evidence; Product decision blocked. Integrate permitted exact/approved bounded evidence and real lock/hold/state acceptance. |
| U07 | Historical crosswalks and schedule interactions | Partial implementation; Real-source acceptance incomplete; Missing authoritative evidence. Review four corroborated NBA candidates, preserve conflicts, verify once-only attribution and dependent services. |
| U08 | Missing NHL fields and MLB role evidence | Partial implementation; Missing authoritative evidence. Approve/apply supported targets; obtain explicit shutout and two remaining MLB participation facts. |
| U09 | Repair manifests, historical reconciliation and materialization | Partial implementation; Real-source acceptance incomplete. Complete populated-copy/preservation/replay and apply only an approved exact batch with verified backup. |
| U10 | Active network, rate windows, incremental schedules/live-final boxes | Partial implementation; Real-source acceptance incomplete; Licensing or permission blocked for restricted feeds. Final-test enabled recurring releases; acquire permitted live/incremental data and semantics. |
| U11 | Availability/injury/IR/suspension with effective/known times | Missing authoritative evidence; Real-source acceptance incomplete. Resolve explicit ID bridges and approved snapshot precision, then verify actual status/IR gates. |
| U12 | Authoritative rookie classification | Missing authoritative evidence; Real-source acceptance incomplete. Validate explicit rookie fields and temporal meaning; demonstrate real gates, without age/novelty inference. |
| U13 | Team changes/retirement with dynasty retention | Missing authoritative evidence; Real-source acceptance incomplete. Map explicit supported facts, correction/precision and missing sport evidence; preserve ownership. |
| U14 | Real independent sport lifecycle | Missing authoritative evidence; Real-source acceptance incomplete. Verify real boundaries/final placements before activation/close/rollover. |
| U15 | Publication/correction semantics | Missing authoritative evidence; Product decision blocked. Obtain documented official instants or explicit alternative policy approval; keep retrieval distinct. |
| U16 | Original/corrected statistics and completion in provisional scores | Partial implementation; Missing authoritative evidence; Real-source acceptance incomplete. Demonstrate real revision episodes and trustworthy completion through existing provisional scoring. |
| U17 | Authoritative 24-hour finalization and competition protection | Missing authoritative evidence; Real-source acceptance incomplete; Product decision blocked. Run real finalization after accepted clock evidence/policy, preserving finalized results. |
| U18 | Real placement/rookie order/rollover | Missing authoritative evidence; Real-source acceptance incomplete. Verify accepted end-of-season results through deterministic order and independent rollover. |
| U19 | Source→V9→gameplay→website acceptance | Real-source acceptance incomplete; Missing authoritative evidence. Complete real starter/provisional/UI acceptance, label synthetic calendar stages and retain finalization gates. |
| U20 | All-sport real failure/rate/replay/restart/concurrency acceptance | Real-source acceptance incomplete; Partial implementation. Finish controlled final matrix and chronological source history; distinguish real observations from injected faults. |

No remaining row is solely Financial approval blocked. Missing paid contracts are not engineering blockers under the approved free strategy.

## 4. Minimum viable permitted provider set

**nflverse + SportsDataverse redistribution releases**, retaining the accepted recovered archives/V5. Both reviewed publishers identify CC BY 4.0 data grants; software licenses are separately recorded. Retention, attribution, changes and source references travel with immutable objects. No new service, paid contract, credential or per-league provider request is required. See [capability matrix](M5_PROVIDER_CAPABILITY_MATRIX.md). This scoped selection does not authorize direct restricted league/ESPN APIs or image assets.

## 5. Actual enabled automated sources

The central registry enables 15 read-only release products: NFL roster/statistics; NBA direct roster/ESPN roster; MLB play-by-play; NHL skater boxes, goalie boxes, scoring CSV, scoring Parquet, event Parquet and game-info; and NFL/MLB/NBA/NHL injury Parquets. Source URLs, limits, license references and attribution are in `src/ingestion/open-data/sources.ts`. Registry configuration classifies roster, game-state, statistical and availability snapshots. Canonical automatic promotion and restricted/live feeds remain disabled. Auxiliary crosswalk/biography reviews are bounded evidence fetches, not falsely counted as additional enabled live feeds.

## 6. Freshness and measured update cadence

The operational registry schedules most releases every six hours and MLB products daily; it expects two-day statistical/injury freshness and seven-day roster freshness where configured. These are internal policies, not publisher guarantees. Four injury releases actually changed Nov 25→26, adding one snapshot day. Latest Nov 26 snapshots contain NFL 800, MLB 144, NBA 97 and NHL 118 athletes. A controlled NHL game-info due refresh returned NOT_MODIFIED in two HTTP requests with the same SHA; processing retained 399 local status observations and zero transitions, actual starts or completions. This measures one daily transition, not future reliability or sub-minute latency. Source artifact modification, retrieval, processing, snapshot date and unknown official publication remain separate. Exact latest hashes and snapshot deltas are in the capability matrix and ignored operation records.

## 7. Actual request consumption

The first central 15-product synchronization used **30 HTTP requests including redirects**; a controlled conditional follow-up used two more, giving **32 measured managed-sync HTTP requests**. Immediate due-wait replay made **zero** requests. These counters describe that specific operational run, not every research request this turn. NBA schedule supplements used four HTTP hops total for 260,978 bytes, then cached replays; the separate NHL combined-box inspection used two metadata requests and two artifact hops. Other bounded capability research has its own retained fetch metadata. Do not sum these examples into an invented all-turn total. Shared conservative rolling limits are 60/minute and 600/hour, concurrency 1, with Retry-After and exponential retry; they are local caps, not unlimited publisher rights.

## 8. Player identity coverage

Accepted imported baseline remains **4,645 professional players**: NFL 1,827, MLB 1,472, NBA 474, NHL 872. Development also contains separately classified synthetic fixtures; canonical real coverage must not be confused with total Player rows. Existing prior disposable staging accepted NFL 586, MLB 1,470, NBA 469 and NHL 786 identities.

New exact proposals, not development changes: NBA 58 direct-ID real players and 538 unique aliases; NFL 1,248 GSIS real players and 3,402 aliases. If applied exactly, accepted real identities would become 5,951 (NFL 3,075; NBA 532; MLB/NHL unchanged), but historical completeness denominators must still be reported for the original imported cohort. NFL six same-name cases and one no-GSIS row remain quarantined; three collisions were resolved by distinct explicit GSIS IDs and different recorded birth dates. NBA 480 unique corroborated NBA↔ESPN pairs collapse only identical evidence rows; eight team/jersey conflicts, six missing biographies, two birth-date issues and ten missing-ID pairs remain held. No name-only merge or ownership reassignment is performed.

## 9. Current and historical positions

MLB accepted repair remains **66,825 historical revisions /935 players**, with 537 imported player-season cases audited. The separately validated 251-revision target for nine existing players improves historical observed-position coverage in a disposable copy from 935→944 players, 66,629→66,879 distinct appearances and 66,825→67,076 role rows. It grants no current eligibility. The separate aggregate mechanism supports explicit FIELDING, STARTING_PITCHING, RELIEF_PITCHING and DESIGNATED_HITTER counts. Nullable starts/appearances retain unknown values; SP requires known pitching starts, RP explicit relief appearances and DH explicit designated-hitter evidence. Independently verified per-team thresholds retain lower-bound scope without claiming all-team completeness or summing teams/providers. Complete season totals require all-team/non-duplicate proof; contradictions fail closed, revisions/retractions preserve as-of history, and independently valid per-game eligibility remains sufficient. The 140 real prior-season carry cases still require dated evidence and reviewed source adaptation; none is promoted. See [MLB hold audit](M5_MLB_POSITION_HOLDS.md). The 10-start/20-appearance rule and current/following-season scope remain authoritative; missing fielding evidence and unverified multi-team aggregation do not grant eligibility. MLB scoring roles are not fielding positions.

NBA current direct roster matches 469/474 imported players; two missing IDs have corroborated current ESPN profiles, three remain pending current evidence. Current G/F families lack approved granular PG/SG/SF/PF expansion; estimates remain historical. NHL C/D/L/R translations retain source provenance and temporal gates. NFL non-fantasy professional positions remain represented rather than forced into QB/RB/WR/TE: the latest 11,473-row NFL snapshot normalizes 11,461 rows, rejects 12 missing IDs and holds 7,722 unsupported-position observations rather than forcing fantasy positions. Canonical lookup gaps are zero after the exact seven V5 game bridges and two reviewed ID dependencies in the disposable copy. Current eligibility promotion is not included in the new population target.

## 10. MLB scoring-role reconciliation

The accepted rule remains starting pitcher→PITCHER; otherwise batting→HITTER; one role per athlete/game, never summed or selected by score. Prior approved 197 appearances/128 players remain materialized. Per-batter PA/event completeness now supports **16 more PITCHER choices** from the remaining 18. Those 16 historical ledgers/entries are proposed, not applied. Kyle Freeland game 823317 and Orion Kerkering 824807 remain held because GP 1/PA 0 and no documented scoring participation do not prove a role. Original source records remain intact. The full archive contains 54,992 paired role keys; that larger structural ambiguity is not automatically solved by the reviewed current-season selections.

## 11. NHL statistical reconciliation

All **399/399** source games now reconcile versus 351/399: 32 shootout cases and 17 goalie-actor cases overlap once. Explicit SHOOTOUT rules separate team deciding goals from personal scoring; same-game box IDs and positive time establish goalie actors. Exact faceoff actors are counted independently; percentages only cross-check. The proposal adds **1,660 revisions/665 players**: 1,620 skater rows with exact FO wins/SH points and 40 goalie rows with proven non-winner values from validated unique decision inventories. No missing decision is simply zeroed.

Remaining shutout evidence:40 rows across 38 games/28 players, including 38 nulls and two preserved unsupported positive credits. Reviewed permitted combined boxes contain no explicit shutout credit. Neither elapsed time nor zero GA supplies it. Source records, current eligibility, publication timestamps and competitive ledgers remain unchanged by the proposal. See [historical continuation](M5_HISTORICAL_CONTINUATION_REPORT.md).

## 12. Before/after historical statistical completeness

| Imported cohort | Accepted baseline complete | Conditional after exact proposed batch | Still incomplete |
| --- | --- | --- | --- |
| NFL | 1,827/1,827 | Verified copy: 1,829/1,829 historical-stat players, including two new identities with statistics | No incomplete players in this cohort; roster-only discoveries are separate |
| MLB | 1,454/1,472 | Verified copy: 1,470/1,472 | 2 role/participation cases |
| NBA | 474/474 | Verified copy: 474/474 | Current eligibility and clock semantics remain separate |
| NHL | 194/872 | Verified copy: 844/872 | 28 players with explicit shutout-evidence gaps |

The populated-copy total is **4,617/4,647 complete historical-stat players**, versus accepted development **3,949/4,645**. Another **1,304 new roster-only identities** have no historical-stat completeness claim. This is verified disposable-copy after-evidence, not an applied development count. Historical observed positions support historical TE-bonus analytics; the 110 missing TE-bonus decisions occur only in a context-free diagnostic that deliberately omits those positions. They do not mean 110 players remain incomplete and do not grant current eligibility. Revisions are not new professional games or complete seasons.

## 13. Verified professional season boundaries

Accepted V5 observations remain valid accepted schedule evidence. Observed min/max games are not independently verified professional regular/postseason endpoints or following-season IDs. The bounded NBA supplements resolve **zero new authoritative season boundaries**. Real boundary-dependent draft/rollover acceptance remains gated. Professional postseason and fantasy playoff boundaries stay distinct.

## 14. Actual start and completion coverage

Current redistributed products provide scheduled/date fields and final-state observations, not complete exact actual start/completion instants. The two NBA schedule crosswalks contain no start timestamps. Five future IDs 401909450–454 remain date-only ESPN placeholders with negative team IDs. Four 2019 NBA source IDs now have unique nearby-date same-team/final-score V5 candidates, but one-day date/start conflicts remain; identity agreement does not fix clocks. Their manifest is PROPOSED_CORROBORATED_NOT_APPROVED, fingerprint `2c5a373aeca22b5b703015b8c484a8debb7cb0aa874c232cb1ff9b8a2e3071cd`. Official NHL minute-precision report research is a capability lead with separate permission/precision review, not an activated exact-time adapter.

## 15. Official publication and correction coverage

The selected products lack documented exact original/corrected official statistical publication instants. Artifact modified, snapshot date, observed final and receipt time remain separately labeled. The authoritative 24-hour correction requirement stays intact; no observation timestamp starts that clock under the current policy. Version hashes/release updates can establish representation revisions, not their official publication meaning. See [evidence policy report](M5_EVIDENCE_POLICY_REVIEW.md). A local chronological comparison of the two retained NFL releases found 11,404→11,473 physical rows, 12 invalid IDs in each, 11,392 unchanged normalized keys, 69 added keys, zero removed keys, zero normalized-stat corrections and zero position changes. This is an actual release transition with additions, not a real statistical correction episode. Artifact time is not official publication.

## 16. Availability, rookie and retirement

Four real injury products are retained and decoded. Latest source designations include NFL 40 IR / 1 Suspension, NHL 91 IR / 2 Suspensions; NBA Day-To-Day is not Questionable or IR eligibility. Profile Active and absent injury records are not health. NFL roster has 22 explicit RET records and rookie_year evidence, but effective precision/canonical integration and all-sport coverage remain incomplete. These facts are not yet promoted to gameplay IR/rookie/retirement gates; no dynasty roster removal occurs. NHL/MLB injury identity links remain unresolved where explicit bridges are absent.

## 17. Actual source-to-score acceptance

Current real-source acceptance verified **25 complete V9 scores per sport** (100 total) and shared website analytics against actual source/canonical records in a populated disposable copy; it wrote no competitive results. Separate actual staging accepted **3,739 NFL statistics** with 100 complete scores, and **11,808 NHL statistics** with 100 complete scores. All replays added zero. Actual populated-player Chromium acceptance passed **1/1**. Historical observed-position context was retained for V9 calculations without current eligibility promotion.

This verifies real batch-source normalization, canonical mapping, V9 calculation, historical analytics and browser presentation. Complete authoritative source→immutable starter→competitive correction/finalization remains open where official clocks and an actual chronological correction episode are missing. The 69 new NFL source keys are additions, not corrections. Synthetic calendar/clock mechanisms are reported separately; no historical import creates competitive ledger events merely by existing.

## 18. Measured live scoring latency

**Not established.** No permitted continuous live feed is active; daily/final releases do not demonstrate the desired 60-second source-to-site target. Measured internal per-score timings were NFL mean 10.32 ms (8–35 ms) and NHL mean 11.33 ms (6–32 ms). These are local processing timings, not official-publication-to-site latency. Release freshness monitoring is useful but cannot be relabeled live scoring.

## 19. Operational worker health

The central scheduler reuses PostgreSQL durable state, leases, immutable storage, cursor/retry/request-window records and the existing data worker. Last retrieval/processing, artifact time, freshness, accepted/quarantined/pending counts, request use, retries, cursors, worker status and evidence gaps are available through the operations report. Website, gameplay worker, data worker, stale/disabled/restricted source, blocked league and pending competition remain distinct health concepts. League1's existing roster violation is preserved and is not a provider outage. Actual managed graceful data-worker stop/restart passed. Verified safeguards include metadata publication fenced by a live worker lease, atomic content-addressed file publication under 12 concurrent writers, and explicit disabled-heartbeat reporting: products show DISABLED while prior cursors/request records remain retained. Website, gameplay and data workers report healthy; all 15 releases are synced, while the existing blocked league remains separately identified. The health endpoint returns HTTP 503 with application available/database connected: all three workers HEALTHY, one existing blocked draft, zero blocked schedules and leagueHealth BLOCKED. This is the preserved league issue, not provider failure.

## 20. Commands and configuration

- `npm run data:releases:sync`: central due-source synchronization; `OPEN_DATA_RELEASE_SYNC=true` enables managed retrieval within the authorized database scope.
- `npm run data:accelerated:prepare` / `npm run data:accelerated:validate`: consolidated frozen-target preparation and populated disposable-copy validation; no implicit development application.
- `npm run data:operations` / `npm run data:ingestion-status`: unified operational state without credentials.
- `npm run data:identity:review`: audited mapping correction/retraction review; no implicit broad merge authority.
- `node --import tsx src/workers/prepare-historical-continuation.ts`, `prepare-nfl-roster-review.ts`, `prepare-nfl-stat-continuation.ts` and `prepare-accelerated-batch.ts`: exact reviewed proposals, isolated/read-only by default.
- `node --import tsx src/workers/review-nba-schedule-evidence.ts --canonical-targets`: read-only corroboration; no timestamp repair.
- `node scripts/build-m5-dataset-readiness.mjs`: archive hashes, season counts and streaming ambiguity/gap report; no PostgreSQL archive import or optimization.
- `npm run dev:all` remains the Webpack managed default; optional Turbopack commands remain available.

The local two-release NFL comparison is read-only and reuses immutable cached source objects; it proves additions without inventing a correction/publication event. Per-product URLs/categories/license/byte bounds are in sources; refresh/freshness/window/concurrency/failure/enablement policy in registry. Exact command modes and development application remain gated by exact review and approval.

## 21. Migration approval

**No new migration proposed.** Development baseline remains 28 applied, none pending; current mechanisms reuse existing tables. Both populated-copy reviews preserved 89 original application tables, validated 196 foreign keys and reported zero Prisma drift. Existing immutable mechanisms remain unchanged. Do not infer future schema deployment approval from prior exact batches.

## 22. Concrete backfill approval

A consolidated meaningful proposal is prepared: NBA 58 players/538 aliases; NFL 1,248 players/3,402 aliases plus 162 absent statistics on seven existing games; NHL 1,660 revisions/665 players; MLB 16 ledgers/entries. The frozen combined fingerprint is `387869154d0a85654c6e86c97877b2ecfdfaa199cd8e149b4ba72c51ca604940`. Populated-copy validation **passed**: all 89 original application tables/rows preserved, 196 foreign keys valid, zero drift, exact append counts verified, deliberate invalid-component transaction rolled back, replay added zero. The final JSON-normalized NFL statistics component fingerprint is `6c6bb8270a5728b9ab8fd6f5903a3658c3bf32e43ec7fb57de6f9fc78017cd2b`, bound to the final identity dependency; older preparer/preview hashes are superseded without changing its 162-row target. No approval is requested for a hypothetical set, and prior NHL/MLB approvals do not authorize this new batch. Four NBA bridge candidates retain a separate proposed identity-evidence review and are not silently included. A second exact target, `ee09780d243fc11e0246e23678554109c3b717acaf746b78f15cc770218ddebc`, appends 251 historical position revisions for nine MLB players; its independent populated-copy/preservation/foreign-key/drift/replay checks also passed. Both development targets remain unapplied and will be presented in one consolidated approval question. See [exact backfill review](M5_ACCELERATED_BACKFILL_REVIEW.md) and [MLB hold audit](M5_MLB_POSITION_HOLDS.md).

Recovery procedure remains: pause workers, private durable fully decoded backup, exact target/populated-copy check, apply only approved manifest, compare original-row/table/V5/V9 fingerprints, replay, restart and verify website. Originals are never overwritten; any later correction is audited/compensating.

## 23. Automated test results

Starting verified baseline: 177 units; 117 integration tests normal and shuffled; 20 standard Chromium workflows; two actual restart workflows; additional populated real-player website acceptance; TypeScript/ESLint/Prisma/audit clean; Webpack production passed. Those are prior checkpoint results, not reruns of this batch.

Current full suites: **198/198 units, 129/129 normal and 129/129 shuffled PostgreSQL integration tests passed**. The full integration suite passed serially after one earlier run hit the existing five-second waiver-test deadline during overlapping startup/unit/lint load. Assertions and deadlines were unchanged. Shuffled seed 261129 passed on the final explicit-count/nullable/lower-bound implementation. The latest Webpack production build and full TypeScript compilation passed. All final automated checks passed: 198 units, 129 normal integration, 129 shuffled integration (seed 261129), 20 standard Chromium workflows, two actual restart workflows and one populated-real-player Chromium workflow. The two standard opt-in skips are exercised by the separate actual restart run. Production Webpack/full TypeScript, ESLint, Prisma validation, security audit (zero vulnerabilities) and whitespace checks passed. Git commit/synchronization remains pending.

Real acceptance passed: four-sport 25-score V9/analytics samples; separate NFL/NHL staging/100-score/replay checks; populated-player Chromium 1/1; actual managed data-worker stop/restart; conditional NOT_MODIFIED retrieval; both populated-copy preservation/replay reviews. These overlap integration mechanisms and are not added together to invent a suite total. The machine-readable acceptance report records the exact result scope; Git synchronization is the remaining delivery step.

## 24. M4 regression

All 60 completed checklist requirements and six completed gameplay acceptance journeys are preserved. The final normal/shuffled integration and standard/actual-restart browser reruns passed, preserving all six M4 journeys. This does not certify unsupported real-source competitive finalization. No assertion or deadline was weakened. Original-week postponements, role policy, immutable starters, financial/ownership history and independent sport behavior remain authoritative.

## 25. Database and dataset preservation

No current-turn canonical backfill is claimed. Read-only research/preparers did not reset, reseed, truncate, remove source rows or wholesale import archives. A fresh 90-table development baseline comparison preserved all 87 non-operational tables exactly; only three authorized operational metadata tables changed: BackgroundJobRun 16,434→17,859,ProfessionalSyncState 0→15 and ProfessionalRateLimit 7→11. Users 11,leagues 7,players 8,042,stats 185,945,rosters 47,drafts 4,ScoreLedgers 220,entries 232,schedule observations 57,352,crosswalks 52,866 and migrations 28 remain unchanged. No canonical backfill was promoted. The accepted baseline includes 28 migrations, 57,352 schedule observations, 52,866 historical crosswalks and 103,801 original imported role rows, with prior append-only revisions kept distinct.

Fresh readiness generation verified all four accepted Parquet hashes and reused accepted 44 sport-season identity counts only after hash equality. All seven recovered CSVs, all five V5 fingerprints and all 56 UBP V9 weights remain preserved. All 16 protected artifacts (seven CSVs, four Parquets, five V5 inputs) and V9 source are unchanged. All 56 V9 rule rows and the SHA fingerprints of all three user-owned screenshots are unchanged. Private backups/raw provider objects/large datasets remain excluded from Git. V10, contract automation and unapproved normalization stay inactive.

## 26. Remaining licensing restrictions

CC BY redistribution products require attribution/license/change notices and no implied endorsement. Their software license does not license unrelated source content; release access does not license headshots/logos or authorize restricted direct APIs. Automated direct league/ESPN access remains permission-blocked; official minute-precision report research does not remove that barrier. Commercial providers are optional later candidates, not required development spend or a reason to stop unrelated engineering.

## 27. Remaining product decisions

Two precise choices, not reopened settled rules:

1. NBA family mapping: retain strict granular evidence or approve G→PG/SG, F→SF/PF, C→C, G-F/F-G→PG/SG/SF/PF, F-C/C-F→SF/PF/C; blank unknown. Luguentz Dort G and Jalen Johnson F illustrate the flexibility/scarcity impact. Mapping does not supply an effective time or approve a population/backfill.
2. Evidence policy: keep exact instants; approve labeled bounded events/snapshots while keeping official publication strict; or also approve the separately named observed-complete-box 24-hour alternative. Early-bound locks and late-bound holds affect fairness; daily artifacts can delay playoffs/rollover. No alternative is active, and re-fetches must not reset a shared clock.

The full [policy review](M5_EVIDENCE_POLICY_REVIEW.md) records examples, precision and consequences. No paid subscription decision is needed. Consolidated exact data approval is separate from these gameplay-policy choices.

## 28. M6 dataset readiness

[Dataset readiness](M5_DATASET_READINESS.md) and its [aggregate report](../reports/m5-dataset-readiness.json) cover 44 sport-seasons, all per-season player/game counts and exact hashes for 1,746,957 physical archive rows. Full-archive gaps include NHL 455,497 skater FO/SH rows, 54,992 MLB paired role keys, 186 NFL missing-ID rejects, estimated/missing positions and non-playing/unknown-participation source rows. Partial current 2026/2026–27 season coverage and sport-specific selection bias can invalidate naive cross-sport comparisons. Use immutable columnar archives plus pinned derived masks/roles/positions, not a wholesale PostgreSQL import; require comparable scoring-input completeness and explicit quarantines before simulation. This handoff does not optimize V9, activate V10 or begin M6.

## 29. Can authoritative live fantasy competition operate?

**Not yet under the unchanged exact-instant/publication rules.** Useful permitted automated release retrieval, real historical analytics and isolated provisional projections can operate. Exact official start/completion/publication coverage, finalization evidence, independent boundaries and some identity/position/lifecycle evidence remain insufficient. No 60-second live claim or unsupported finalized competitive result is made.

## 30. Exact remaining steps to finish M5

All automated regression and preservation checks passed. Record the verified commit and synchronize it; the only requested changes awaiting approval are the two exact backfills and two product-policy choices. Both populated-copy targets and preservation/replay proofs are complete; present the exact two fingerprints in one consolidated development approval question. Managed worker health and actual historical source-to-V9/analytics acceptance passed; authoritative competitive acceptance remains gated on its missing temporal evidence. If approved, perform the private-backup/exact-application/replay/preservation/restart procedure and measure actual coverage. Commit/synchronize the verified code/documentation without datasets or screenshots. Resolve the two explicit product choices only where they prevent promotion; retain strict gates until answered. Acquire explicit remaining shutout/MLB participation facts, current granular or approved family positions, effective lifecycle evidence, season boundaries and permitted temporal/live data. Run the remaining real correction/finalization/placement/rollover journeys when that evidence exists. Close each original checklist row only when its full real-source scope passes; retain precise external dependencies if no permitted source supplies them.

Machine-readable acceptance and preservation evidence: [acceptance](../reports/m5-accelerated-acceptance.json), [preservation](../reports/m5-accelerated-preservation.json).
