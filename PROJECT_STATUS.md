# Fantasy Evolution project status

M4 remains **60/60**. M5 remains **12 checked / 20 unchecked / 32 total**, with actual real-data improvements beyond the prior fixture-backed checkpoint. This delivery continues synchronized `00fd706`; the final delivery message records its verified descendant. See [real-data completion report](docs/M5_REAL_DATA_COMPLETION_REPORT.md), [master checklist](docs/M5_MASTER_CHECKLIST.md) and [exact data review](docs/M5_REAL_DATA_REVIEW.md).

## Real-data results

Eleven permitted current-season release products were fetched using 22 HTTP attempts including redirects. NFL real canonical staging accepted 586 identities, 32 teams and 3,577 statistical observations. SportsDataverse staging accepted MLB 1,470 identities, NBA 469 and NHL 786, plus 11,808 NHL statistical observations. Complete 100-score NFL/NHL samples used the existing V9 engine/ledger. Replays added zero observations, statistics or score entries. These operations were validated in populated disposable copies; continuous live feeds remain disabled.

The separately approved NHL development target appended **11,808 historical revisions for 785 players**. Missing-input players fell **831 → 678**: 153 became statistically complete. Positions, publication timestamps and existing ledgers remain unchanged. Forty goalie-win gaps and 40 evidence gaps for shutouts remain unresolved (38 source nulls plus two preserved unsupported positive credits). The importer no longer infers positive shutouts from elapsed time/zero goals against; analytics and V9 scoring withhold unsupported legacy credit without rewriting source rows. The source reconciler withheld 48 games with conflicting evidence.

The user confirmed MLB single-role selection: starting pitcher takes PITCHER; otherwise HITTER when batting. Complete-game exclusive activity and positive starter/batting evidence validate **197/215 appearances across 128 players**. All 197 scored completely and replayed without additions in a populated copy. The separately approved development batch added **197 historical ledgers and 197 entries**, preserving all source statistics and existing ledgers. Unresolved appearances/players fell **215/135 → 18/18**; raw archive ambiguity is retained separately by the read-only audit.

The earlier MLB historical position application remains **66,825 revisions / 935 players**, with 537 imported player-seasons withheld. Current NBA roster evidence matches **469/474 imported players**, but coarse position codes and missing effective/publication instants grant zero current eligibility. Estimated historical positions retain their provenance. No unknown becomes zero, eligible, retired, rookie or officially published.

## Development preservation

Development has **28 applied migrations and none pending**. Exact migration 28 was separately approved/deployed, preserving all 89 application tables with empty Prisma drift. Each later approved backfill used paused workers and a fresh private backup verified by listing and full decode; all **90 original tables**, including migration history, preserved their original records. Replay changes were zero. See [deployment review](docs/M5_PENDING_MIGRATION_REVIEW.md) and [data application review](docs/M5_REAL_DATA_REVIEW.md).

Current preserved records include 11 users, seven leagues, 8,042 players, 47 roster entries, four drafts, 48 assignment events, 57,352 schedule observations and 52,866 crosswalks. Approved append-only changes produce **185,945 stat revisions and 232 global score entries**. Existing ownership, immutable lineups, financial/competitive results and account data were preserved. Private backups and large source/enrichment datasets remain ignored.

All seven recovered CSV hashes, all four accepted historical Parquet hashes, all five V5 fingerprints and all 56 V9 weights are preserved. The three user screenshot modifications remain unstaged. iCloud and the damaged recovery workspace were not accessed. V10, contract automation, unapproved normalization, M6 and M7 remain inactive.

## Verification and operation

177 unit tests and 117 PostgreSQL integration tests pass; the same 117 pass shuffled in a separate fresh schema (seed 261128). One concurrent shuffled run hit an existing five-second deadline during heavy compilation/database load; the exact seed passed serially with unchanged assertions/deadlines. Standard Chromium, actual server/worker restart and additional real-population browser acceptance passed. TypeScript, ESLint, Prisma validation, whitespace and npm audit pass with zero vulnerabilities. The production Webpack build passes; Turbopack's subprocess port binding fails with EPERM in this environment. Exact browser totals and preservation evidence are in the real-data report.

The existing managed stack runs with `npm run dev:all` at <http://localhost:3000>; stop its owner before starting another. It was restored after the approved applications and reports complete gameplay ticks. The real-feed registry remains empty, so no official live-source or publication SLA is claimed. The known League1 roster violation remains untouched.

`npm run data:open:fetch` verifies ignored source snapshots; `-- --refresh` performs bounded conditional requests. `data:open:prepare`, `data:open:mlb-roles`, `data:open:nba-positions` and `data:open:validate` reproduce reconciliation and disposable acceptance. `npm run data:scoring-completeness` now distinguishes fixed canonical scoring roles from unchanged raw archive ambiguities. No requests are issued separately per fantasy league.

## Remaining M5 dependencies

Authoritative live competition remains gated on actual start/completion, original/corrected publication, independently verified boundaries, dated eligibility and lifecycle evidence. Eighteen MLB appearances, remaining NHL/goalie inputs, withheld positions and all-sport live source acceptance remain unresolved. Direct restricted league/ESPN feeds stay disabled; published licensed releases do not confer separate direct-API or image rights. No subscription is required or purchased. All currently reviewed migration/backfill approvals are completed; further substantive targets require their own concrete review.
