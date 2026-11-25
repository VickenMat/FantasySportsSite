# M4.3 roster and lineup recovery checkpoint

The recovered foundation adds indexed sport and universal slots, append-only roster assignment and availability history, roster compliance snapshots, and immutable game-start lineup snapshots. All three recovered migrations were preserved. PostgreSQL coverage verifies that repeat capture is idempotent, that a later roster move leaves the snapshot unchanged, and that a direct snapshot update is rejected. Roster and acquisition coverage is still tracked in the master checklist.

## Disposable test isolation

The failing dashboard assertion found all eight seeded players plus 63 synthetic players left in the disposable database. Using a fresh schema exposed another fixture leak within a run. The lineup test marked its player as a demo and suppressed deletion errors even though immutable evidence retained that player. This fixture now uses a regular player, and its league teardown reports failures. The dashboard keeps its eight-player and four-sport assertions.

Each integration run deploys and seeds a unique schema inside `fantasy_evolution_test`. Both model queries and raw SQL use that schema. The temporary schemas were removed after success and failure. Existing rows in the disposable database's public schema were preserved.

## Verification

- Two consecutive PostgreSQL runs passed all 20 tests. A shuffled run also passed all 20, and the dashboard passed on its own.
- All 136 unit tests and eight Chromium tests passed. TypeScript, ESLint, Prisma validation, Turbopack, Git integrity and diff checks passed. The npm audit found zero vulnerabilities.
- All eight Parquet files were present. The five accepted V5 schedule artifact hashes matched the schedule integration report.

## Development data

Automated database tests used `fantasy_evolution_test`. Development inspection used read-only PostgreSQL transactions. All 17 development migrations were present and all 17 append-only triggers were enabled. The fingerprints of the historical schedules, crosswalks, player statistics, scoring ledgers, users and leagues matched before and after testing.

Development already had 45 roster entries and 45 roster assignment events before testing, compared with 40 of each in the handoff. The running development draft timer recorded automatic NBA picks 9 and 10 in the existing League1 during verification, bringing both counts to 47. Its periodic jobs and live application session activity also changed the all-table fingerprint. The recovery run left the development services and their records in place.
