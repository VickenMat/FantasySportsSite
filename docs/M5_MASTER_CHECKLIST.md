# M5 master checklist

A checked row is implemented and verified within its stated scope. Recommendations, codecs and fixtures do not count as successful provider integration. Current checkpoint (partial recovered-data/provider work does not complete whole rows): **12 checked / 20 unchecked / 32 total**.

## M5.1 provider research and architecture

- [x] Document provider comparison, licensing restrictions, unknown costs/limits and conditional primary/fallback recommendations
- [x] Define provider-independent observations, explicit time semantics, identity conflicts and safe rollout architecture
- [ ] Select and approve permitted provider/product rights, retention, redistribution, credentials and costs
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


## Real-data continuation — November 26

Progress remains **12 checked / 20 unchecked / 32 total** because the remaining rows include unavailable all-sport evidence or live competitive acceptance. Partial real-source success is recorded without checking whole mixed requirements.

- Migration 28 was explicitly approved and deployed; none is pending. All 89 original application tables were preserved, 196 foreign keys validated and Prisma drift was empty.
- Eleven current-season licensed release products were fetched in 22 successful HTTP requests including redirects. Content-addressed snapshots, source hashes and attribution remain ignored. Real canonical identity staging accepted NFL 586, MLB 1,470, NBA 469 and NHL 786 records in disposable copies.
- Real NFL and NHL statistical staging accepted 3,577 and 11,808 observations respectively; bounded 100-score samples used the existing V9 ledger with complete inputs. Replays added zero observations, stats or score entries. This is batch-source acceptance, not a live-publication SLA.
- Approved NHL repair appended exactly 11,808 historical revisions for 785 players. Missing-input players fell 831 → 678; 153 became statistically complete. Source positions/publication and existing ledgers were preserved.
- Confirmed MLB starter priority resolved 197/215 appearances across 128 players. Exact historical materialization was separately approved and applied: 197 ledgers/entries, zero source-stat changes. Missing-role appearances/players fell 215/135 → 18/18.
- NBA current roster evidence matches 469/474 imported players; coarse codes and missing effective/publication instants grant zero eligibility. MLB positions remain the earlier approved 935 players / 66,825 revisions, with 537 imported player-seasons withheld.
- Chromium additionally verified the actual four-sport imported populations on a populated disposable copy. Unknown projections/positions/times remain unknown. Existing V5, recovered sources, accepted archives, 56 V9 weights and user screenshots are preserved.

See [real-data delivery](M5_REAL_DATA_COMPLETION_REPORT.md) and [exact approval/application review](M5_REAL_DATA_REVIEW.md). Remaining goalie evidence, 18 MLB appearances, current eligibility, source publication/completion, independently verified boundaries, lifecycle evidence and continuous permitted live feeds remain open.
