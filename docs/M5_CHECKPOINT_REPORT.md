# M5 provider research and ingestion foundation checkpoint

M5 is in progress from synchronized `ad99dff`; M4 remains 60/60 for fixture-backed gameplay. The M5 checklist is **11 checked / 21 unchecked / 32 total**. This report accompanies a verified commit on `main`; its exact synchronized HEAD is given in the delivery message. No live provider is selected or active, and authoritative fantasy competition is not yet ready.

## Milestone status

| Milestone | Current status |
| --- | --- |
| M5.1 | Provider comparison, conditional recommendations, terms/pricing/access limitations and provider-independent architecture documented. License/product selection and real-sample contractual acceptance pending. |
| M5.2 | Canonical baseline verified; explicit identity bridges, synthetic discovery, name/conflict quarantine and positive position promotion implemented in disposable fixtures. Real crosswalks, team history, retractions and historical position repair remain. |
| M5.3 | Accepted V5 preserved. Independently verified boundaries, actual starts/completion and remaining crosswalk resolution remain pending. |
| M5.4 | Exact archive/import reconciliation and MLB activity/category investigation completed. NHL input repairs and licensed selective materialization remain. |
| M5.5 | Bounded decoder/local adapter, immutable observations/decisions and durable lease/cursor/retry/budget mechanisms implemented and fixture-tested. Licensed network/live statistics adapters and real rate-window controls remain. |
| M5.6 | Real availability, rookie, retirement and team-change adapters remain; no unknown status is promoted to an eligibility claim. |
| M5.7 | Required publication/completion semantics identified; source-aware V9 promotion and real official correction acceptance remain. Observation time is never substituted for publication. |
| M5.8 | Checkpoint M4 regression, populated-copy migration and preservation verified. Source-to-score-to-gameplay-to-website acceptance and freshness UI remain. |

## Implemented mechanisms

Three additive staging tables separate immutable raw/normalized content, immutable versioned decisions and mutable operational sync state. Provider/sport/category/entity/revision/hash identity prevents duplicate application. Same-revision contradictions quarantine; older revisions remain raw without changing accepted evidence. Missing explicit temporal/identity prerequisites remain pending. Position replacement/retraction is held for a proper resolution mechanism rather than silently overwriting positive history.

Explicit provider identifiers resolve existing canonical players without renaming or name-only merges. Contradictory bridges and duplicate-name discovery quarantine. Synthetic new discovery is confined to authorized disposable schemas. Positive position evidence reuses the existing M4 service inside the same transaction; MLB fielding preserves the 10-start/20-appearance and following-year rule. Listed roster roles cannot bypass those thresholds.

Worker claims persist per-stream leases, request ceilings, cursor, next poll and failure/success metadata. Page application and cursor advancement commit together. Mixed-scope/bad pages roll back; expired workers cannot overwrite a recovered cursor. Backoff honors Retry-After and suppresses rapid authentication retries. Disabled adapters are never invoked. Error metadata and source references exclude API credentials. The current quota mechanism is a hard persisted ceiling; full vendor rolling windows remain future implementation.

The SportsDataIO player codec is pure normalization with no network access. Its update/position/status fields are retained raw without inventing publication, eligibility, rookie or retirement evidence. No credentials, paid accounts or provider terms were accepted. The user confirmed: no existing license; prepare options.

## Commands

```sh
npm run data:m5:audit
npm run data:ingest -- tests/fixtures/m5/player-page.json
npm run data:ingestion-status
```

The first audits local archive hashes/metadata and PostgreSQL in a read-only transaction, writing an aggregate report to `/private/tmp/fantasy-m5-data-baseline.json`. Prior season-level audit results are reused only when the actual file SHA/count matches exactly. The second defaults to a **schema-only dry run**, reports a source fingerprint and performs no database writes; it is not a backfill target manifest. The third safely reports `PENDING_MIGRATION` on current development and leaves live ingestion disabled.

Fixture application is explicitly restricted:

```sh
node scripts/run-in-test-environment.mjs --isolated-schema -- npm run data:ingest -- tests/fixtures/m5/player-page.json --apply-fixture
```

That command prepares only the authorized disposable schema and removes it afterward. Production/development application is unavailable. No new process is added to `dev:all`, no source is polled automatically and no network requests are scheduled. Read-only full-table preservation commands are in `scripts/m5-development-fingerprint.mjs`.

## Provider options, costs and API consumption

[Provider comparison](M5_PROVIDER_COMPARISON.md) recommends SportsDataIO as the first commercial quote candidate and Sportradar as alternate, subject to four-sport fantasy rights, exact fields, retention and actual price approval. Neither has an approved quote here. SportsDataIO commercial pricing is customized; Discovery Lab's personal-use scope does not cover the public fantasy site. Sportradar's documented default trial is 1,000 calls/rolling 30 days and 1 QPS for 30 days. No trial was created.

nflverse releases offer a CC BY development/historical NFL option after per-dataset/upstream review and attribution. MLB/NBA/NHL public interfaces remain permission candidates, not assumed commercial fallbacks. Retrosheet and MySportsFeeds need further accessible current documentation. No invented price, guaranteed latency or reliability measurement is reported.

Proposed inactive polling: daily identities, six-hour schedule refresh away from games, thirty-minute availability around game windows, sixty-second active aggregate stats only if licensed and necessary, and staged final/daily correction reconciliation. One three-hour per-game 60-second loop consumes 180 calls/game; aggregate feeds can reduce this. A real endpoint/account budget and commercial limits must be approved first. **Actual automated vendor API consumption: zero.** Public documentation research included one successful MLB metadata response; it was not an ingestion run.

## Data reconciliation

The complete physical archive contains **1,746,957 rows**; prior valid rows total 1,746,771, with 186 preserved quarantined NFL rows. Operational accepted imported coverage is only **103,801 rows**, all 2026 start-year data, across **4,645 players**: NFL 1,827, MLB 1,472, NBA 474, NHL 872. Full archives stay Parquet; no wholesale PostgreSQL materialization was performed.

MLB has 215 two-role appearances / 135 players: 92 with nonzero inputs in both roles, 121 pitching only, two neither, zero category mismatches. V9 already requires one scoring role per athlete/game; preserve separate source records and require trustworthy role-selection evidence, never maximum realized score or combined role points. NHL still needs exact faceoff/shorthanded/goalie inputs for 831 players. MLB/NBA historical position files remain missing. Imported historical scoring completeness remains NFL 1,827/1,827, MLB 1,337/1,472, NBA 474/474 and NHL 41/872.

No accepted imported stat revision has official source publication time. Current audit has zero AVAILABLE independently verified boundary revisions, completion, availability or rookie evidence rows. Global legacy position evidence count 110 is not represented as four-sport authoritative completeness. V5's four unresolved historical NBA games and five pending starts remain explicit. See [coverage report](M5_DATA_COVERAGE_REPORT.md).

## Verification and database preservation

- 159 unit tests pass, including four new contract/codec/backoff/safety tests.
- 93 PostgreSQL integration tests pass in normal and shuffled fresh schemas, seed `20261130`: all 87 M4 tests plus six M5 tests. The final position-retraction quarantine assertion also passes in a separate targeted run.
- Standard Chromium: 17 workflows pass, one development-writing opt-in skipped. Actual server/worker restart workflows: two pass.
- TypeScript, ESLint, Prisma validation, production build and Git whitespace checks pass; dependency audit reports zero vulnerabilities.
- Pending migration validated in fresh schemas and a populated disposable copy: all **86 original application tables preserved**, **196 resulting foreign keys**, empty Prisma drift after applying migration 27 in the copy.
- Development remains at **26 applied migrations**, with all original records and 195 existing foreign keys preserved. Full-table read-only fingerprints include migration history; only the normal worker journal may advance. Historical archive hashes, five accepted V5 fingerprints, 56 V9 weights and the three user screenshot modifications are preserved.

The pending migration adds only three empty tables and two immutable triggers. Its exact SQL digest and deployment limits are in [migration review](M5_PENDING_MIGRATION_REVIEW.md). No development deployment or substantial backfill approval has been inferred. No backfill manifest is proposed because no permitted repair source/target set is ready. Original iCloud/recovery workspaces were not accessed. Existing League1 roster noncompliance is untouched. M6, M7, V10, contracts and normalization remain inactive.

## Remaining work and decisions in dependency order

1. Obtain an approved written provider quote/scope and evaluate bounded real samples; do not send vendor messages or create accounts without authorization. In parallel, extend provider-independent codecs and coverage/conflict tooling using fixtures.
2. Complete explicit canonical crosswalk/review manifests, professional team histories and revision-aware positions/retractions. Source historical MLB/NBA fielding/position evidence before proposing a backfill.
3. Add verified boundaries and full game-state transitions around accepted V5; preserve missing timestamps and crosswalk ambiguity.
4. Obtain exact NHL fields and MLB role-selection evidence. Review any concrete correction/materialization manifest before applying it to development.
5. Implement licensed network transports, incremental schedules, real rate-window limits and live/final/corrected statistics. Generalize the existing V9 source-selection layer without aliasing a new provider to historical data or duplicating the scoring engine.
6. Integrate availability/rookie/retirement/team evidence and verified publication/completion semantics, then exercise M4 financial/competitive invariants and the complete source-to-website pipeline.
7. Add concise freshness/source-state UI and finish the real all-sport acceptance matrix before claiming authoritative competition readiness.

Current user decisions: no license/purchase/activation approved; commercial provider choice and any actual quoted cost remain pending. No settled gameplay rule needs to be reopened. Development staging deployment is a separate future approval; the current offline tools and tests do not require it.
