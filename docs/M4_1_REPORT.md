# M4.1 authoritative season scheduling report

## Completed

- Added append-only professional schedule revisions with provider, source name/version, retrieval time, SHA-256 content identity, raw source record, availability state, and UTC regular/postseason boundaries.
- Added league competition choice (`HEAD_TO_HEAD` or `CUMULATIVE`), championship cycles, per-sport season assignments, lifecycle states, derived deadline snapshots, and explicit pending reasons.
- Added unique league/game attribution so one professional game cannot score in two championship cycles for the same league.
- Reworked competitive league creation to select the earliest source-backed season beginning after the expected draft-completion instant. Historical replay retains its explicit season behavior. When data is absent, the assignment remains `PENDING_DATA`; the compatibility season pointer is not represented as authoritative.
- Added authenticated, rate-limited schedule preview UI and API. The February 2027 acceptance case selects MLB 2027, NFL 2027, NBA 2027-28, and NHL 2027-28 when those source records are supplied; NBA 2026-27 is excluded because it already started.
- Added an idempotent JSON schedule importer. Identical records are no-ops and changed source facts append revisions.
- Added independent next-season assignment that always chooses the immediate next available professional season. Head-to-head cross-cycle overlap is deliberately `PENDING_CONFIGURATION`; no unresolved pairing behavior was invented.
- Backfilled every existing league with Cycle 1 and per-sport `PENDING_DATA` assignments without changing its current season pointer, rosters, accounts, credentials, scores, or history.

## Deadline behavior

- Draft and first-scoring times use the authoritative regular-season start.
- Cumulative trade deadlines are 14 days before the supplied regular-season end.
- Head-to-head trade deadlines are 14 days before the supplied playoff start. If the source has no playoff start, the deadline stays null with a warning.
- Rollover eligibility uses the supplied postseason end, or regular-season end when no postseason end is supplied.

## Evidence and limitations

The repository does not contain a complete authoritative future schedule feed. The importer and lifecycle model are ready, but production schedule availability remains pending operator-supplied, reviewed sources. Existing historical statistics do not establish future professional season boundaries. Overlapping head-to-head championship-cycle pairing remains unresolved and inactive.

The UBP V9 coefficients and scoring engine were not changed. V10 remains inactive. The 0.5% cross-sport balance target remains unverified.

## Verification

- Prisma schema validation and additive migration deployment passed on the isolated test database and the preserved development database.
- 128 unit tests passed, including February 2027 eligibility, latest-revision precedence, missing-date behavior, derived deadlines, source validation, and no-skipped-season selection.
- 17 PostgreSQL integration tests passed, including schedule import idempotency, append-only enforcement, persisted multi-sport assignment, and duplicate game-attribution rejection.

- TypeScript and ESLint passed.
- The supported Next.js webpack production build compiled, typechecked, and generated all routes successfully. The default Turbopack builder could not bind its internal CSS worker port in the managed execution environment (`EPERM`), including after an approved elevated retry; no application compile error was reported.
- All 8 Chromium acceptance tests passed, including authenticated schedule preview with explicit per-sport availability states.
- Full and production-only npm audits reported zero known vulnerabilities.
