# Fantasy Evolution project status

M5 is in progress from synchronized `4c730e0`: **12 checked / 20 unchecked / 32 total** at the fixture-verified ingestion-mechanisms checkpoint. M4 remains **60/60**, with all existing gameplay decisions preserved. See [M5 checkpoint](docs/M5_CHECKPOINT_REPORT.md), [provider options](docs/M5_PROVIDER_COMPARISON.md), [coverage](docs/M5_DATA_COVERAGE_REPORT.md) and [checklist](docs/M5_MASTER_CHECKLIST.md).

## UI refinement continuation

The November 26 UI workstream adds compact Overview/Team/Settings/Trades, separate Eastern draft date/time controls, a 60-second default for new drafts, league-specific multi-position filters, private two-step conditional-cut acquisitions and selected-sport scoring with active-weight comparisons. Existing gameplay and M5 data mechanisms are retained. See [request-to-implementation QA mapping](docs/UI_REFINEMENT_QA_REPORT.md). No development migration/backfill is included; migration 28 remains pending separate approval.

## Current implementation

Provider-independent ingestion now includes immutable identities and team history, revision-aware position corrections, boundaries, lifecycle evidence, actual start/completion/game states, live/final/corrected statistics, provider-wide rolling quotas, central adaptive per-game polling and dependency retries. Reviewed source selection and missing-only hybrid enrichment feed the existing V9 ledger with field provenance and explicit publication semantics. All mechanisms are synthetic-fixture verified; live-source acceptance remains open. Team and Matchups expose freshness and unknown/provisional/source-published status. See [mechanism report](docs/M5_INGESTION_MECHANISMS_REPORT.md).

The approved strategy is $0 subscriptions with one hybrid internal service. An attributed NFLverse identity preview fetched 24,872 rows and retained 18,793 standard GSIS identities in ignored preview files; 6,079 unsupported primary IDs remain held out. No operational promotion or continuous live feed is active. ESPN and restricted sport feeds remain disabled pending appropriate rights. Commercial providers are optional future extensions, not implementation prerequisites. See [unresolved work](docs/M5_UNRESOLVED_DECISIONS.md).

M4's authentication-aware public landing, responsive Overview/invitations, permanent Draft center, saved UTC/random/custom order, one-hour preparation, queues, scheduled rookie execution, immutable recaps, comprehensive Waivers, championships, financial/trade lifecycle and audited corrections remain unchanged. V9 requires one MLB scoring role per athlete/game; no double scoring or hindsight-based role selection is introduced.

## Current verification

- 171 unit tests pass, including DST, starter-filter resolution and scoring comparison validation.
- 115 PostgreSQL integration tests pass twice in separate fresh schemas, including shuffled order (UI seed 261126); added locked-cut assertions also pass the focused acquisition suite.
- 20 production Chromium workflows pass; the development-writing opt-in is skipped. Two actual server/worker restart workflows pass. UI details and final focused checks are in the UI QA report.
- TypeScript, ESLint, Prisma validation, production Turbopack build and whitespace checks pass.
- Pending migration 28 preserves all 89 existing application tables in a disposable populated copy, validates all 196 foreign keys and yields empty Prisma drift.

## Data, migration and integrity

Development is at **27 applied migrations** and **196 foreign keys** after explicit approval of the reviewed staging migration and exact MLB backfill. A fresh 35,831,832-byte private backup passed listing/full decode. The backfill appended **66,825 historical position revisions for 935 MLB players**; all original rows across 86 tables were preserved. No current eligibility or scoring changed. See [approval/application review](docs/M5_RECOVERED_DATA_REVIEW.md).

Post-application read-only fingerprints cover all 90 tables including migration history; only the normal worker journal advances during these automated tests. Existing 11 users, seven leagues, 8,042 players, 174,137 stat revisions, 47 roster entries, four drafts (including the commissioner draft configuration saved during this session), 48 assignment events, 35 score entries, 57,352 schedule observations and 52,866 crosswalks are preserved. Private backups remain outside Git. The earlier approved classification of 3,388 fixtures is unchanged.

All four historical archive hashes match their full prior audit: 1,746,957 physical rows versus 103,801 accepted imported rows across 4,645 professional players. MLB's 215 dual-role appearances include 92 with nonzero inputs in both roles, 121 pitching only and two neither, with zero category mismatches. Preserve original roles and require trustworthy role-selection evidence. NHL missing inputs affect 831 players; the remaining MLB subset and current NBA positions and all-sport current lifecycle/publication evidence remain pending.

All five accepted V5 fingerprints, all 56 V9 weights and the three user screenshot modifications remain preserved. V10, contracts and unapproved normalization are inactive. Neither iCloud nor the damaged recovery workspace was accessed. No M6 optimization or M7 deployment occurred.

## Commands and next work

Existing website/workers: `npm run dev:all` at <http://localhost:3000>. Stop the existing supervisor before starting another. The Docker project/volume and League1 roster violation remain untouched; its blocked draft can keep operational health at 503.

New tools: `npm run data:m5:audit`, `npm run data:ingest -- tests/fixtures/m5/player-page.json`, and `npm run data:ingestion-status`. They audit read-only data, default to write-free local dry runs and report pending staging deployment without pretending a live feed exists.

Next: obtain separate approval for reviewed migration 28 (SKIPPED matchup enum and observation lookup index), then verify permitted real provider products and field semantics. Generic mechanisms are implemented; current/live all-sport data acceptance remains open. No approved live feed is configured and no subscription is purchased. M5 is not complete and live authoritative competition is not ready.

Recovered data details: all seven source CSVs are immutable and Git-excluded; all four statistical archives were compared by canonical typed multisets and normalization. Derived threshold candidates, NBA provenance and canonical NHL requests are separate ignored files. The latest baseline audit counts latest appearances separately from immutable revisions. Source-aware V9 replay retains one canonical ledger and fixed role and requires an explicit source-switch review reason. See [recovery completion](docs/M5_RECOVERY_COMPLETION_REPORT.md).
