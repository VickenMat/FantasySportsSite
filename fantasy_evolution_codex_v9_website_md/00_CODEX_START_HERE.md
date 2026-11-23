# Fantasy Evolution V9: start here (empty repository)

This directory is the **source of truth** for building a new working fantasy sports website from an empty Git repository. Read `01`–`08`, then `11`–`15` before coding. Older documents under `reference/` are historical and may conflict. In conflicts use this document and the highest numbered V9 documents. Never claim the 0.5% cross-sport target is achieved without sealed holdout evidence.

## Execution order
1. Verify current directory is a Git repository; initialize only if needed. Do not delete user files.
2. Follow `11_EMPTY_REPO_BOOTSTRAP.md` exactly to create an operational local website, PostgreSQL database, tests and CI.
3. Implement `12_DATABASE_AND_API.md`, `13_FRONTEND_PAGES.md`, `14_SCORING_AND_SIMULATION_ENGINE.md`, `15_IMPLEMENTATION_MILESTONES.md` in order.
4. Load `08_V9_SCORING_PRESET.md` as **experimental** scoring configuration, not proven balanced. Preserve one-decimal scoring precision.
5. Write tests before completing each milestone. Start app, run migrations and tests, provide commands and screenshots when available.
6. Implement and run real 2016–2025 historical backtests with time-aware drafts, projected starts, waivers and no future leakage. The 2026–27 seasons are incomplete and excluded from complete-season comparisons. Quarantine 2020 COVID-disrupted data.
7. Track unimplemented functionality as explicit issues, not mocked production features.

## Nonnegotiable product decisions
NFL default nine starters: QB, RB, RB, WR, WR, WR, TE, FLEX, FLEX. No default SUPERFLEX; allow as commissioner option. NFL passing first downs earn zero; rushing and receiving first downs +0.3. Slight TE reception premium. Steals > blocks in NBA. MLB two-way player cannot double-score. MLB eligibility 10 starts or 20 appearances, carry forward one year. Sport-specific configurable starter arrays; multi-sport dynasty default and single-sport redraft available.

## User-facing deliverable
A real, usable responsive website with sign-up/sign-in, league creation, league dashboard, commissioner settings, draft room, rosters, lineups, scoring, matchups, standings, waivers, trades and player pages, plus tested ingestion and simulation jobs. Do not stop after creating documentation or a landing page.
