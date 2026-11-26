# Fantasy Evolution project status

M5 is in progress from synchronized `ad99dff`: **11 checked / 21 unchecked / 32 total** at the provider-research and ingestion-foundation checkpoint. M4 remains **60/60**, with all existing gameplay decisions preserved. See [M5 checkpoint](docs/M5_CHECKPOINT_REPORT.md), [provider options](docs/M5_PROVIDER_COMPARISON.md), [coverage](docs/M5_DATA_COVERAGE_REPORT.md) and [checklist](docs/M5_MASTER_CHECKLIST.md).

## Current implementation

Provider-independent staging has immutable observations/decisions, explicit publication/effective/observation times, provider identity bridges, synthetic discovery, identity/revision conflict quarantine, positive position evidence and durable cursor/lease/budget/backoff recovery. MLB evidence reuses the existing 10-start/20-appearance mechanism. File ingestion defaults to a schema-only dry run. Promotion is restricted to authorized isolated test schemas. A pure SportsDataIO player decoder does not fetch data or grant status/eligibility claims.

No provider license exists. The user confirmed: prepare options, purchase nothing. No live source, paid account, subscription or network polling job is activated. Commercial candidate choices are conditional on actual quoted cost, rights, field coverage and timestamp semantics. Missing features and external dependencies are separated in [M5 unresolved decisions](docs/M5_UNRESOLVED_DECISIONS.md).

M4's authentication-aware public landing, responsive Overview/invitations, permanent Draft center, saved UTC/random/custom order, one-hour preparation, queues, scheduled rookie execution, immutable recaps, comprehensive Waivers, championships, financial/trade lifecycle and audited corrections remain unchanged. V9 requires one MLB scoring role per athlete/game; no double scoring or hindsight-based role selection is introduced.

## Current verification

- 159 unit tests pass.
- 93 PostgreSQL tests pass in normal and shuffled fresh schemas (seed `20261130`): all 87 M4 tests plus six M5 tests.
- 17 standard Chromium workflows pass, one development-writing opt-in skipped; two actual server/worker restart workflows pass.
- TypeScript, ESLint, Prisma validation, production build and Git whitespace checks pass; dependency audit reports zero vulnerabilities.
- Pending migration is validated on fresh schemas and a populated disposable copy: all 86 original application tables preserved, 196 resulting foreign keys, empty Prisma diff after applying migration 27 in the copy.

## Data, migration and integrity

Development remains at **26 applied migrations** and **195 existing foreign keys**. One additive staging migration is prepared but unapplied: `20261126010000_professional_ingestion_foundation`, adding three empty tables and two immutable triggers. It is not approved for development deployment; see [exact SQL review](docs/M5_PENDING_MIGRATION_REVIEW.md). There is no substantial backfill request, salary conversion or source import. Current schema differences from development are the intentionally pending staging tables, not an unexpectedly broken M4 migration.

Read-only development fingerprints cover every existing application table and migration history; only the normal worker journal advances. Existing 11 users, seven leagues, 8,042 players, 107,312 stat revisions, 47 roster entries, three drafts, 48 assignment events, 35 score entries, 57,352 schedule observations and 52,866 crosswalks are preserved. Private backups remain outside Git. The earlier approved classification of 3,388 fixtures is unchanged.

All four historical archive hashes match their full prior audit: 1,746,957 physical rows versus 103,801 accepted imported rows across 4,645 professional players. MLB's 215 dual-role appearances include 92 with nonzero inputs in both roles, 121 pitching only and two neither, with zero category mismatches. Preserve original roles and require trustworthy role-selection evidence. NHL missing inputs affect 831 players; verified MLB/NBA historical positions and all-sport current lifecycle/publication evidence remain pending.

All five accepted V5 fingerprints, all 56 V9 weights and the three user screenshot modifications remain preserved. V10, contracts and unapproved normalization are inactive. Neither iCloud nor the damaged recovery workspace was accessed. No M6 optimization or M7 deployment occurred.

## Commands and next work

Existing website/workers: `npm run dev:all` at <http://localhost:3000>. Stop the existing supervisor before starting another. The Docker project/volume and League1 roster violation remain untouched; its blocked draft can keep operational health at 503.

New tools: `npm run data:m5:audit`, `npm run data:ingest -- tests/fixtures/m5/player-page.json`, and `npm run data:ingestion-status`. They audit read-only data, default to write-free local dry runs and report pending staging deployment without pretending a live feed exists.

Next: evaluate approved provider samples/quotes, extend team/position/game-state/statistics/lifecycle codecs with fixtures, prepare precise crosswalk/repair manifests, implement source-aware V9 promotion and official correction semantics, then verify source-to-website freshness and authoritative competition. M5 is not complete and live authoritative competition is not ready.
