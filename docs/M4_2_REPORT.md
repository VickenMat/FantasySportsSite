# M4.2 competition checkpoint

M4.2 now has immutable per-cycle configuration snapshots, independent sport competition records, exact game-to-period attribution, provisional matchup revisions with a 24-hour finalization worker, recorded idempotent random draws, approved H2H standings logic, exact rational championship-point calculations, fixed six-team playoff/bracket planning, and cumulative configuration that creates neither matchups nor playoffs.

NFL source-backed provisioning includes Week 18 only for cumulative competition. H2H uses Weeks 1–17 and schedules three playoff weeks backward from Week 17. Other sports require authoritative UTC games. Normal competitive leagues can no longer invoke the legacy calendar-guessing schedule generator; missing schedules remain `PENDING_DATA`. Historical replay retains its explicitly labeled legacy path.

## Continuation after the roster recovery

- Cumulative standings expose sport and combined UBP. They sum the latest exact V9 ledger revision for each eligible captured starter and report missing schedules, game snapshots, and scores. A correction can change provisional rankings. Cumulative competition creates no fantasy playoff matchups or championship-point awards.
- Fixed playoff brackets use the provisioned playoff periods, finalized regular-season results, recorded seeds, byes, and the configured playoff tiebreakers. Progression persists championship and consolation games, third place, all final sport placements, and exact rational championship-point awards.
- The overall championship persists reported sport awards, finish counts, and starter UBP from the settled periods. Overall results remain provisional until every sport is final and the period scores can be reproduced at their official correction deadlines.
- Competitive matchup finalization requires final game evidence and a source publication timestamp. The archive has zero populated official publication timestamps across 107,312 stat rows, so archive matchups remain provisional. The fixture suite verifies that publication evidence opens the window and that an official correction published after its deadline changes cumulative stats without revising the deadline-bound score.
- Fixture coverage exercises a 12-team bracket from seeding through all 12 placements, verifies repeat calls, and checks the champion's exact 21-point award and overall projection.
- The regression run passed 136 unit tests, 22 PostgreSQL integration tests and eight Chromium tests, along with TypeScript, ESLint and the Turbopack production build.

Live overall acceptance, final cumulative cycle placement, and persistent standings snapshots remain open. Accepted V5 files and the four unresolved NBA crosswalk rows were preserved.
