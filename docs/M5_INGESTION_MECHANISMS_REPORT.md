# M5 ingestion mechanisms delivery

This continues synchronized `4637185`. Generic M5 mechanisms are implemented with isolated synthetic evidence. M5 remains incomplete: no approved live-game source is active, measured real-source coverage and latency are unverified, and fixture success is not provider acceptance. The subscription budget remains $0.

## Implemented behavior

- One bounded central job per provider/professional game; adaptive live/suspended/final polling, per-provider rolling request reservations across sports, persisted leases/cursors/backoff, atomic page decisions and pending dependency retries. Failed HTTP attempts consume quota. Cache validators are bound to their original source URL. Provider configuration changes cannot reset quota history.
- Explicit immutable player/team/game bridges and synthetic discovery; no name-only merges. Ordered team history and conflicting-source status are visible. Position corrections/retractions append evidence and resolve as of publication; older immutable snapshots remain unchanged. Historical estimates never grant current eligibility.
- Typed source-backed season boundaries, availability, NFL suspension/IR rules, rookies, retirement, actual starts, explicit completion, postponed/suspended/cancelled games. Retirement never removes dynasty ownership. Unknown completion preserves waiver claims and FAAB reservations while awaiting evidence.
- The confirmed postponement rule preserves original fantasy weeks for NBA/MLB/NHL and official NFL weeks. Actual verified starts control lineup capture. Cancelled-only regular periods are skipped without fabricated ties; uncertain championship/playoff consequences remain pending review. Finalized outcomes remain protected.
- Incremental live/final/corrected statistics use the existing V9 engine and canonical ledger. All six scoring roles are fixture-tested. MLB still requires one explicit role per athlete/game; no role is chosen from first arrival or highest score. Source priority, staleness and conflict holds prevent arbitrary latest-provider selection.
- Optional reviewed hybrid enrichment fills only unknown allowed fields. Every contributed value retains provider/stat/publication provenance. Known primary values are never overwritten. Original official publication must be explicit; fetch/final/correction timestamps cannot invent it. Unknown required statistics remain unknown and hold finalization. The 24-hour correction window uses original publication, never last correction or fetch time.
- Team and Matchups show source freshness, original/current publication, provisional/unknown status and verified source links; current professional team provenance is distinguished from historical team display. Visible pages refresh every 15 seconds through the application. This is not a live-source latency guarantee.

## Safety and deployment

Operational promotion remains limited to authorized disposable schemas. The managed development worker has an empty approved feed registry and idles without network or database ingestion. Merely adding an adapter does not grant provider rights.

Migration `20261126020000_professional_projection_states` adds the `SKIPPED` matchup enum value and a lookup index. Development remains at 27 migrations pending explicit approval of this separate 27 → 28 change. The populated disposable copy preserves all 89 existing application tables, validates 196 foreign keys and has empty Prisma drift. No backfill accompanies this migration. See [review](M5_PENDING_MIGRATION_REVIEW.md).

The earlier explicitly approved migration 27 and exact 66,825-row historical MLB append are complete. Those original-row fingerprints and backup evidence remain in [recovery report](M5_RECOVERY_COMPLETION_REPORT.md). Commissioner draft changes during the session were preserved. Subsequent automated tests use only fresh schemas of `fantasy_evolution_test`.

## Recovered inputs

All seven immutable recovered sources stay ignored. All 1,746,957 statistical records match accepted archives by typed, duplicate-aware shared values and gameplay normalization, including validated decoding of all 506,116 NHL names. NBA's extra historical position column is retained separately. No accepted Parquet was overwritten.

The refined NHL request set targets 13,501 imported rows, including 40 shutout requests: 38 unknown values plus two legacy positive credits lacking explicit shutout evidence. No values were changed. Exact target SHA-256 is `7c1b59869db35a993c935709b43065f2073a80e49d69062ac376bc79be61cc37`. Zero supplementary values have been recovered. The machine report retains the earlier null-only target for traceability.

## Acceptance

Unit: 168/168. Integration: 114/114 in a fresh disposable schema; the shuffled fresh-schema repeat also passes 114/114 (seed 5261126). Production Chromium: 18 passed, one development-writing opt-in skipped. Actual server/worker restart: two passed. TypeScript, ESLint, Prisma validation and production Turbopack build pass. Existing M4 gameplay tests remain included. No V10, contract automation, paid source, production deployment or broad development import was enabled.

## Remaining external acceptance

Permitted real provider products, documented field/publication/completion semantics and limits, real-source all-sport failure/freshness/restart acceptance, authoritative current NBA positions, exact missing NHL inputs, unresolved MLB thresholds/team aggregation and single-role evidence remain open. Four accepted historical NBA crosswalk limitations remain. These are recorded without fabricating production evidence. Commercial subscriptions are optional future extensions.

Post-application preservation: all 90 development tables (including migration history) were checked with exact counts and row fingerprints. Only BackgroundJobRun advanced during normal running workers; no other difference or missing table was found. All seven recovered source SHA-256 values and all five accepted V5 fingerprints remain exact. The 56 V9 scoring rows are unchanged. Three user-modified screenshots remain unstaged.
