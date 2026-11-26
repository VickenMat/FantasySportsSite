# Fantasy Evolution project status

M5 is in progress from synchronized `4c730e0`: **11 checked / 21 unchecked / 32 total** at the provider-research and ingestion-foundation checkpoint. M4 remains **60/60**, with all existing gameplay decisions preserved. See [M5 checkpoint](docs/M5_CHECKPOINT_REPORT.md), [provider options](docs/M5_PROVIDER_COMPARISON.md), [coverage](docs/M5_DATA_COVERAGE_REPORT.md) and [checklist](docs/M5_MASTER_CHECKLIST.md).

## Current implementation

Provider-independent staging has immutable observations/decisions, explicit publication/effective/observation times, provider identity bridges, synthetic discovery, identity/revision conflict quarantine, positive position evidence and durable cursor/lease/budget/backoff recovery. MLB evidence reuses the existing 10-start/20-appearance mechanism. File ingestion defaults to a schema-only dry run. Promotion is restricted to authorized isolated test schemas. A pure SportsDataIO player decoder does not fetch data or grant status/eligibility claims.

The approved strategy is $0 subscriptions with one hybrid internal service. An attributed NFLverse identity preview fetched 24,872 rows and retained 18,793 standard GSIS identities in ignored preview files; 6,079 unsupported primary IDs remain held out. No operational promotion or continuous live feed is active. ESPN and restricted sport feeds remain disabled pending appropriate rights. Commercial providers are optional future extensions, not implementation prerequisites. See [unresolved work](docs/M5_UNRESOLVED_DECISIONS.md).

M4's authentication-aware public landing, responsive Overview/invitations, permanent Draft center, saved UTC/random/custom order, one-hour preparation, queues, scheduled rookie execution, immutable recaps, comprehensive Waivers, championships, financial/trade lifecycle and audited corrections remain unchanged. V9 requires one MLB scoring role per athlete/game; no double scoring or hindsight-based role selection is introduced.

## Current verification

- 166 unit tests pass.
- 95 PostgreSQL tests pass in a fresh schema, including historical repair scoping/publication safety and source-aware V9 replay. The preceding full fresh-schema run passed 94/94 before the new scoring regression.
- 17 standard Chromium workflows pass, one development-writing opt-in skipped; two actual server/worker restart workflows pass.
- TypeScript, ESLint, Prisma validation, production build and Git whitespace checks pass; dependency audit reports zero vulnerabilities.
- Pending migration is validated on fresh schemas and a populated disposable copy: all 86 original application tables preserved, 196 resulting foreign keys, empty Prisma diff after applying migration 27 in the copy.

## Data, migration and integrity

Development is at **27 applied migrations** and **196 foreign keys** after explicit approval of the reviewed staging migration and exact MLB backfill. A fresh 35,831,832-byte private backup passed listing/full decode. The backfill appended **66,825 historical position revisions for 935 MLB players**; all original rows across 86 tables were preserved. No current eligibility or scoring changed. See [approval/application review](docs/M5_RECOVERED_DATA_REVIEW.md).

Read-only development fingerprints cover every existing application table and migration history; only the normal worker journal advances. Existing 11 users, seven leagues, 8,042 players, 174,137 stat revisions, 47 roster entries, four drafts (including the commissioner draft configuration saved during this session), 48 assignment events, 35 score entries, 57,352 schedule observations and 52,866 crosswalks are preserved. Private backups remain outside Git. The earlier approved classification of 3,388 fixtures is unchanged.

All four historical archive hashes match their full prior audit: 1,746,957 physical rows versus 103,801 accepted imported rows across 4,645 professional players. MLB's 215 dual-role appearances include 92 with nonzero inputs in both roles, 121 pitching only and two neither, with zero category mismatches. Preserve original roles and require trustworthy role-selection evidence. NHL missing inputs affect 831 players; the remaining MLB subset and current NBA positions and all-sport current lifecycle/publication evidence remain pending.

All five accepted V5 fingerprints, all 56 V9 weights and the three user screenshot modifications remain preserved. V10, contracts and unapproved normalization are inactive. Neither iCloud nor the damaged recovery workspace was accessed. No M6 optimization or M7 deployment occurred.

## Commands and next work

Existing website/workers: `npm run dev:all` at <http://localhost:3000>. Stop the existing supervisor before starting another. The Docker project/volume and League1 roster violation remain untouched; its blocked draft can keep operational health at 503.

New tools: `npm run data:m5:audit`, `npm run data:ingest -- tests/fixtures/m5/player-page.json`, and `npm run data:ingestion-status`. They audit read-only data, default to write-free local dry runs and report pending staging deployment without pretending a live feed exists.

Next: evaluate approved provider samples/quotes, extend team/position/game-state/statistics/lifecycle codecs with fixtures, prepare precise crosswalk/repair manifests, implement source-aware V9 promotion and official correction semantics, then verify source-to-website freshness and authoritative competition. M5 is not complete and live authoritative competition is not ready.

Recovered data details: all seven source CSVs are immutable and Git-excluded; all four statistical archives were compared by canonical typed multisets and normalization. Derived threshold candidates, NBA provenance and canonical NHL requests are separate ignored files. The latest baseline audit counts latest appearances separately from immutable revisions. Source-aware V9 replay retains one canonical ledger and fixed role and requires an explicit source-switch review reason. See [recovery completion](docs/M5_RECOVERY_COMPLETION_REPORT.md).
