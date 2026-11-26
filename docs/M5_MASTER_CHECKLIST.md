# M5 master checklist

A checked row is implemented and verified within its stated scope. Recommendations, codecs and fixtures do not count as successful provider integration. Current checkpoint (partial recovered-data/provider work does not complete whole rows): **13 checked / 19 unchecked / 32 total**.

## M5.1 provider research and architecture

- [x] Document provider comparison, licensing restrictions, unknown costs/limits and conditional primary/fallback recommendations
- [x] Define provider-independent observations, explicit time semantics, identity conflicts and safe rollout architecture
- [x] Select and approve permitted provider/product rights, retention, redistribution, credentials and costs
- [ ] Verify contracted field coverage, historical years, measured latency, reliability and publication semantics with real samples

## M5.2 identities and positions

- [x] Verify accepted canonical identity counts and preserve IDs; fixture-test explicit bridges, discovery and name/conflict quarantine
- [x] Implement immutable staging decisions and fixture-backed position promotion through existing MLB thresholds
- [ ] Integrate licensed discovery, professional team assignment/history, position revisions/retractions and identity conflict resolution
- [ ] Resolve MLB/NBA historical positions with verified sources and exact approved backfill manifests (MLB conservative target approved/validated; unresolved subset and NBA current evidence remain)

## M5.3 schedules and boundaries

- [x] Verify accepted V5 preservation and retain pending/unmatched evidence states
- [ ] Reconcile independently verified regular/postseason boundaries and unpublished future starts
- [ ] Integrate actual start/completion instants, postponements, rescheduling, cancellations and suspensions
- [ ] Resolve remaining historical crosswalks without forced identity matches; verify draft/lock/hold/deadline/rollover interaction

## M5.4 historical reconciliation

- [x] Verify all four archive hashes/metadata against prior full audit and distinguish 1,746,957 archived rows from 103,801 imported rows
- [x] Investigate exact MLB dual-role categories/activity without selecting or combining roles
- [ ] Obtain verified NHL faceoff/shorthanded/goalie outcome inputs and resolve MLB role evidence/any confirmed scoring decision
- [ ] Complete licensed repair manifests, historical scoring reconciliation and approved selective materialization

## M5.5 automated ingestion

- [x] Implement bounded pure provider codec/local adapter and default write-free dry-run CLI
- [x] Fixture-verify persisted leases, budgets, backoff, page/cursor atomicity, replay and restart recovery
- [ ] Activate approved network adapters, rate-window enforcement, incremental schedules and live/final box scores
- [x] Implement reviewed source arbitration and source-aware existing V9 ledger promotion without duplicate events (synthetic all-role promotion, explicit MLB role, bounded freshness, hybrid missing-field provenance and replay verified; no live provider claim)

## M5.6 availability and lifecycle

- [ ] Map licensed availability/injury/IR/suspension evidence with source status and effective/known timestamps
- [ ] Integrate authoritative rookie classification without inference
- [ ] Integrate team changes and retirement evidence without automatic dynasty removal
- [ ] Verify real independent sport lifecycle operation from authoritative evidence

## M5.7 corrections and finalization

- [ ] Establish approved source publication/correction semantics distinct from ingestion/update timestamps
- [ ] Integrate original/corrected statistics and completion evidence into existing provisional V9 results
- [ ] Verify authoritative 24-hour finalization, post-final correction safety, playoffs and cumulative championships
- [ ] Verify final placement/rookie order and rollover from the licensed real-data pipeline

## M5.8 acceptance and website

- [x] Add reproducible read-only archive/database baseline and staging-status commands
- [ ] Complete source-to-V9-to-gameplay-to-website acceptance with freshness/unknown/provisional/final indicators
- [ ] Complete real-source coverage/failure/rate-limit/replay/restart/concurrency matrix for all sports
- [x] Complete checkpoint M4 regression, populated-copy migration verification, preservation and delivery report (live-source acceptance remains open)

## Recovered-data continuation evidence

Seven immutable recovered files were fingerprinted and all four archives compared by canonical keys, typed values and normalized duplicate-aware multisets. MLB threshold candidates, provenance-preserving NBA history and canonical NHL missing-field requests are reproducible. The conservative MLB manifest passed populated-copy application/idempotence and received explicit development approval. Historical repair now preserves official publication and cannot grant current roster eligibility. See [recovery review](M5_RECOVERED_DATA_REVIEW.md).

The free-first strategy supersedes commercial-first recommendations. A shared bounded HTTPS transport, conditional cache, Retry-After and adaptive per-game polling policy are tested. A real attributed NFLverse identity preview is isolated from operational promotion. Rolling provider-wide quota windows, central adaptive game scheduling, dependency retries, typed lifecycle/boundary/game/stat adapters, correction-safe V9 promotion and freshness UI are implemented with isolated synthetic fixtures. Mixed requirements above remain unchecked until their real-source component is verified. See [mechanism delivery](M5_INGESTION_MECHANISMS_REPORT.md).


## Prior real-data checkpoint — e758a46

At that prior checkpoint, progress was **12 checked / 20 unchecked / 32 total** because the remaining rows include unavailable all-sport evidence or live competitive acceptance. Partial real-source success is recorded without checking whole mixed requirements.

- Migration 28 was explicitly approved and deployed; none is pending. All 89 original application tables were preserved, 196 foreign keys validated and Prisma drift was empty.
- Eleven current-season licensed release products were fetched in 22 successful HTTP requests including redirects. Content-addressed snapshots, source hashes and attribution remain ignored. Real canonical identity staging accepted NFL 586, MLB 1,470, NBA 469 and NHL 786 records in disposable copies.
- Real NFL and NHL statistical staging accepted 3,577 and 11,808 observations respectively; bounded 100-score samples used the existing V9 ledger with complete inputs. Replays added zero observations, stats or score entries. This is batch-source acceptance, not a live-publication SLA.
- Approved NHL repair appended exactly 11,808 historical revisions for 785 players. Missing-input players fell 831 → 678; 153 became statistically complete. Source positions/publication and existing ledgers were preserved.
- Confirmed MLB starter priority resolved 197/215 appearances across 128 players. Exact historical materialization was separately approved and applied: 197 ledgers/entries, zero source-stat changes. Missing-role appearances/players fell 215/135 → 18/18.
- NBA current roster evidence matches 469/474 imported players; coarse codes and missing effective/publication instants grant zero eligibility. MLB positions remain the earlier approved 935 players / 66,825 revisions, with 537 imported player-seasons withheld.
- Chromium additionally verified the actual four-sport imported populations on a populated disposable copy. Unknown projections/positions/times remain unknown. Existing V5, recovered sources, accepted archives, 56 V9 weights and user screenshots are preserved.

See [real-data delivery](M5_REAL_DATA_COMPLETION_REPORT.md) and [exact approval/application review](M5_REAL_DATA_REVIEW.md). Remaining goalie evidence, 18 MLB appearances, current eligibility, source publication/completion, independently verified boundaries, lifecycle evidence and continuous permitted live feeds remain open.

## Accelerated continuation — verified engineering, exact approvals pending

Current accounting is **13 checked / 19 unchecked / 32 total**. Only the existing source-selection row closes: the minimum set is nflverse and SportsDataverse licensed redistribution products, under the approved $0 strategy. Product-specific CC BY 4.0 links, attribution/change notice, retained immutable objects, no required credentials and conservative shared request limits are recorded in the enabled registry and [capability matrix](M5_PROVIDER_CAPABILITY_MATRIX.md). Restricted direct APIs, media assets and unsupported live access are excluded from that selection. No mixed coverage/live/finalization requirement closes from partial success.

- Fifteen permitted release products are enabled in the central durable scheduler. The first operational synchronization used 30 HTTP requests including redirects and a conditional follow-up used two more (32 managed total); immediate due-wait replay made zero requests. Controlled NHL game-info refresh was NOT_MODIFIED with unchanged hash, 399 retained state observations and zero actual-start/completion transitions. New injury artifacts demonstrate one Nov 25→26 daily transition. Release synchronization is active; automatic canonical promotion and live feeds remain disabled.
- Durable conditional storage, rolling provider budgets, leases, retry/Retry-After, cursor/freshness/health reporting, restart recovery and audited identity resolution reuse the existing architecture. Actual managed data-worker graceful stop/restart passed. Current 198 units, 129 normal integration and 129 shuffled integration tests passed (seed 261129); latest Webpack production build/full TypeScript passed. Standard Chromium 20,actual restart 2 and actual populated Chromium 1 passed; ESLint/Prisma/security audit0/diff check passed. Git synchronization remains pending.
- The new consolidated proposal contains 58 NBA real identities/538 aliases, 1,248 NFL real identities/3,402 aliases, 162 absent NFL statistics on seven existing V5 games, 1,660 NHL revisions/665 players and 16 MLB historical scores. No development application is claimed. Both exact populated-copy reviews passed 89 application-table preservation, 196 foreign keys, zero drift and replay zero; the main invalid-component rollback passed. Actual historical-stat copy completeness is NFL 1,829/1,829, MLB 1,470/1,472, NBA 474/474 and NHL 844/872: 4,617/4,647 total versus accepted development 3,949/4,645. Another 1,304 new identities remain roster-only. Development coverage changes only after approval/application. NFL historical analytics use the recorded historical position context; a context-free diagnostic has 110 missing TE-bonus decisions. These observations grant no current eligibility.
- All 48 previously rejected NHL games now reconcile using explicit shootout and goalie-actor evidence; the remaining 40 shutout-evidence rows span 28 players. Two MLB role cases remain unsupported. Five NBA starts remain unknown; four historical NBA mappings are corroborated proposals with retained timestamp conflicts.
- Nullable games played separates positive participation, terminal explicit non-participation and unknown evidence; source records are retained. Unknown GP/AVG displays N/A; a played source cannot be manufactured from roster membership. Current integration and final browser regression passed. The separate aggregate mechanism supports explicit FIELDING, STARTING_PITCHING, RELIEF_PITCHING and DESIGNATED_HITTER counts. Nullable starts/appearances retain unknown values; SP requires known pitching starts, RP explicit relief appearances and DH explicit designated-hitter evidence. Independently verified per-team thresholds retain lower-bound scope without claiming all-team completeness or summing teams/providers. Complete season totals require all-team/non-duplicate proof; contradictions fail closed, revisions/retractions preserve as-of history, and independently valid per-game eligibility remains sufficient. The 140 real prior-season carry cases still require dated evidence and reviewed source adaptation; none is promoted. The separate 251 historical-position copy target for nine MLB players passed, observed coverage 935→944 players, 66,629→66,879 appearances, 66,825→67,076 role rows.
- The original 20-row audit is retained with one closed row and 19 individually classified remaining rows. See [closure audit](M5_REQUIREMENT_CLOSURE_AUDIT.md), [30-item delivery report](M5_ACCELERATED_COMPLETION_REPORT.md), [dataset readiness](M5_DATASET_READINESS.md), [exact consolidated review](M5_ACCELERATED_BACKFILL_REVIEW.md), [MLB holds](M5_MLB_POSITION_HOLDS.md) and [unresolved evidence decisions](M5_EVIDENCE_POLICY_REVIEW.md). M4 remains 60/60; all six completed acceptance journeys passed the final regression.

Final acceptance:198 units, 129 normal/129 shuffled integrations (seed 261129), 20 standard Chromium, two actual restarts and one populated-real Chromium passed; Webpack/full TypeScript, ESLint, Prisma, audit 0 and diff check passed. The local NFL transition added 69 normalized keys with zero normalized-stat corrections/position changes; no real chronological correction episode is claimed. Exact [acceptance](../reports/m5-accelerated-acceptance.json) and [preservation](../reports/m5-accelerated-preservation.json) reports retain scope. Git synchronization and the exact consolidated backfill/two policy choices remain pending.
