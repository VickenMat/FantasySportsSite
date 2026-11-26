# Fantasy Evolution project status

Continuation from `16b9940`: the final draft-experience and gameplay corrections are implemented across scheduling, Overview, Draft, Waivers, auctions, salary accounting, revisioned trading and independent lifecycle mechanisms. M4 remains in progress: **46 checked / 14 unchecked / 60 checklist rows**. See [the current continuation report](docs/M4_DRAFT_FINANCE_TRADE_REPORT.md) and [master checklist](docs/M4_MASTER_CHECKLIST.md).

Rookie lotteries and ordinary custom rookie ordering are revoked. Reverse finalized sport placements determine the same original linear slots each round; transferred ownership remains separate. Historical audit records are preserved. V9's 56 weights remain unchanged; V10, contract automation and schedule normalization remain inactive.

## Current verification

- 155 unit tests pass.
- The full PostgreSQL suite passed 67 tests, followed by a fresh shuffled run of 70 tests with seed `20261125`. The latest six salary tests, including incremental over-cap cuts, also pass independently.
- 13 standard Chromium workflows and two actual restart workflows pass. Browser fixtures now always use isolated disposable schemas.
- TypeScript, ESLint, Prisma validation and production Turbopack builds pass at the current implementation checkpoint; repeat final acceptance after remaining work.
- Shuffled execution exposed and fixed an import-order regression: incoming historical coverage now reconciles previously unverified schedule-only season metadata, preserving stronger existing coverage. No development import was run.

## Database and runtime

The user approved and deployed the four reviewed migrations from 22 to 26 after a fresh verified private backup and populated-copy validation. All 70 original application-table fingerprints were identical immediately before/after deployment. The copy validated 195 foreign keys and an empty Prisma schema diff. Development has 27 enabled append-only triggers. Subsequent preservation checks differ only in the expected running worker journal.

Development retains 11 users, seven leagues, 8,042 players, 107,312 player-stat revisions, 47 roster entries, 48 assignment events, 35 score entries, 57,352 schedule observations and 52,866 historical crosswalks. No existing league was converted to salary mode and no competitive evidence was fabricated or backfilled.

The private pre-26 backup and its checksum are documented in [the reviewed migration record](docs/M4_PENDING_MIGRATION_REVIEW.md). The prior pre-22 backup is retained. All five accepted V5 fingerprints and the protected screenshots match. The earlier approved classification of 3,388 fixture players remains the only player-classification backfill.

Start with `npm run dev:all` at `http://localhost:3000`. Webpack remains the default development bundler; production uses Turbopack. The restarted web and worker processes use the migrated schema. Existing League1 roster noncompliance remains an explicit block; operational health may report 503 while unrelated jobs continue. No production deployment has occurred.

## Remaining work

The unchecked rows track additional acceptance and real implementation: H2H overall-finalization evidence acceptance, complete mixed-asset salary trading and deadline coverage, offseason franchise removal with preserved history, broader audited commissioner corrections, comprehensive universal draft/auction workflows, Waivers filter acceptance and the full requested format matrix. These are not mislabeled as external data dependencies.

M5 must supply official rookie/availability/retirement evidence, independent professional boundaries, verified game-completion instants, correction-publication times, MLB scoring-role disambiguation, NHL scoring inputs and verified MLB/NBA positions. Details remain in [the player audit](docs/PLAYER_DATA_AUDIT.md). Existing mechanisms use isolated synthetic evidence for acceptance; unknown values remain pending rather than zero.
