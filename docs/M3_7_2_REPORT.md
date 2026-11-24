# M3.7.2 gameplay UX, cross-sport trades, and development reliability

## Protected development database operations

Before cleanup, the database was backed up to `/private/tmp/fantasy-evolution-pre-m372-cleanup-2026-11-24.dump` (SHA-256 `9aaa9dbb63547a1b9da84fa1ea7f01984f81f4c52a641e717b9a66294db4ac0c`, 1,670,555 bytes) and its table-of-contents was validated with `pg_restore -l`. Exact-ID validation retained one synthetic player, two import batches, two raw stat revisions, one game, one score ledger, two ledger entries, two active roster entries, and two draft picks. The atomic cleanup deleted 12 batches, 317 stats, 307 players, 15 games, one ledger, one ledger entry, ten position-evidence rows, six browser-test users, and two browser-test leagues. No foreign-key constraint was disabled. Only the specifically required append-only triggers were disabled inside the transaction, restored before commit, verified enabled afterward, and verified to reject a test update.

The working counts changed from 13 users, 5 leagues, 3,704 players, 182 games, 3,828 stats, 24 ledgers, 36 ledger entries, and 168 batches to 7 users, 3 leagues, 3,397 players, 167 games, 3,511 stats, 23 ledgers, 35 ledger entries, and 156 batches. Existing accounts, hashes, manual leagues, rosters, and drafts were retained.

## Current-season archive synchronization

The Parquet importer now accepts an explicit season start year and a repeatable, versioned game quarantine list. These options participate in the idempotency key. Four imports were applied to the development database and repeat runs returned `alreadyImported: true`:

| Sport season | Source rows | Valid/imported stat rows | Rejected/quarantined | Archive notes |
| --- | ---: | ---: | ---: | --- |
| NFL 2026 | 10,992 | 10,981 | 11 | Missing player IDs; NFL source has no game dates |
| MLB 2026 | 72,510 | 72,510 | 0 | Position is not present on these box-score rows |
| NBA 2026–27 | 5,414 | 5,390 | 24 | Entire game `0022600189` quarantined because its rows contradict home/away identity |
| NHL 2026–27 | 14,920 | 14,920 | 0 | Some goalie and skater scored fields remain missing and are not fabricated |

The previously measured distinct archive populations remain NFL 1,827, MLB 1,472, NBA 474, and NHL 872. The source row counts above are box-score rows, not player counts. Website pool reconciliation and exact empty-league availability counts are recorded during final verification rather than inferred from validation totals. Imported records are partial archived development data, not authoritative live rosters.

Read-only PostgreSQL reconciliation found exactly 1,827 NFL, 1,472 MLB, 474 NBA, and 872 NHL distinct nonsynthetic players in the configured 2026 season records. A theoretical empty league using the same website season predicate exposes the same count for each sport. NFL and NHL have recorded position observations for all of those players. The MLB archive has no position observations on these rows and its professional-team identifiers are retained as team display names rather than abbreviations. The NBA rows retain team identity but do not contain position observations. Those missing fields remain `N/A`; they were not inferred or fabricated. The one retained synthetic dependency player is marked and excluded from new pools without removing it from its existing rosters or drafts.

## Gameplay and interface changes

- The draft room defaults to Player Pool. My Team and the private queue are in the left sidebar; Draft Board and Draft Results are independent tabs. The persisted header, clock, pause state, and queue survive tab changes and reconnects.
- Queue rows support HTML drag-and-drop plus accessible up/down/remove buttons. Arbitrary order is committed serializably after verifying the manager's exact private queue set. Automatic picks still skip unavailable entries and use the first eligible saved priority.
- The roster page uses two clicks: select a player's position, then select a highlighted destination. Reverse-ineligible and locked swaps are disabled in the interface, and the backend revalidates the exact destination atomically.
- One trade can contain NFL, NBA, MLB, and NHL assets. Each asset stores its sport, source roster, source franchise, and destination franchise. Old single-sport history is backfilled and preserved. Proposer and recipient cuts are explicitly manager-authorized, stored with the coherent trade, revalidated per sport, and processed in the same serializable transaction as every asset.
- Draft, pool, waiver, and queue statistics use one ledger-backed GP/AVG/PTS service. Historical leagues apply an as-of cutoff to games and source-knowledge timestamps. Missing ledger scores and all unavailable projections display `N/A`.
- Application notices persist through redirects and announce confirmed gameplay actions through an accessible live region. Submitted buttons are disabled to reduce accidental duplicate actions.
- `npm run dev:all` starts the web app, draft worker, and idempotent gameplay tick with process-specific logs and clean signal handling. `/health` reports database state and the most recent worker records.

The working-database startup smoke test reported the draft timer as `RUNNING`, the gameplay tick as `COMPLETE`, and then shut down cleanly on `SIGINT`. That operational tick processed one legitimately overdue active-draft automatic pick and deleted 20,064 expired rate-limit buckets. It did not insert automated fixtures. This expected gameplay action is disclosed because the smoke test was connected to the interactive development database.

UBP V9 and all 56 weights remain unchanged. V10 remains inactive. No cross-sport value equality is imposed, and the 0.5% balance target remains unverified. Defensible calibration still needs independently timestamped preseason ranks, injury/availability reports, rotations, verified schedules, and waiver knowledge.

## Verification evidence

- Clean `npm ci`: 671 packages installed; both full and production `npm audit` reported zero findings.
- TypeScript and ESLint passed.
- 123 unit tests passed across 16 files.
- 16 isolated PostgreSQL integration tests passed across five files after deploying all 11 migrations to the disposable test database.
- The Next.js 16.4.6 production build passed.
- Eight Chromium tests passed, including exact trusted/untrusted origins, password recovery, draft tab persistence, queue/player-pool placement, the actual two-click roster selection state, and four-sport trade-builder rendering.
- The season importer integration tests prove season scoping, transparent game quarantine, raw-cell retention, and idempotency. All four working-database season imports independently returned `alreadyImported: true` on replay.
- The local migration history is fully applied without reset. Prisma validation and client generation pass.

Actual browser captures:

- [Draft room](../reports/screenshots/m3-7-2-draft-room.png)
- [Roster position selection](../reports/screenshots/m3-7-2-roster-position-selection.png)
- [Four-sport trade builder](../reports/screenshots/m3-7-2-cross-sport-trade-builder.png)

Remaining limits are explicit: the archives contain no verified projections or current availability feed; MLB and NBA position coverage is insufficient in the 2026 rows; the screenshot fixture has no authoritative season scoring ledgers, so it correctly displays `N/A`; and the local concurrency and browser evidence does not establish production scalability. Live feeds and production deployment remain out of scope.
