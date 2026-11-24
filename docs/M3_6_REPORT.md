# M3.6 Multi-Sport League Architecture and Gameplay Acceptance

Completed November 23, 2026. M3.6 preserves the Better Auth configuration, UBP V9 coefficients, historical raw statistics, scoring ledgers, and all prior migrations.

Finalization note: the authorized synthetic cleanup stopped safely before any mutation because one candidate player had become part of a completed League0 draft, active roster and transaction. No trigger was disabled and no cleanup record was deleted. See the [cleanup audit](M3_6_CLEANUP_AUDIT.md). Automated PostgreSQL suites now run only through the fail-closed [test environment](TEST_ENVIRONMENTS.md), and the owner acceptance sequence is in the [M3.7 guide](M3_7_MANUAL_ACCEPTANCE.md).

## Data protection and migrations

Before schema work, PostgreSQL was backed up to `/private/tmp/fantasy-evolution-pre-m3-6-2026-11-23.dump`. Its SHA-256 is `da788a69ccdaf70329fac016059b894da59e4cd4c733de1d83a1451ca4b7856a`; `pg_restore -l` validated the archive.

Three additive migrations implement M3.6:

- `20261124011800_multi_sport_leagues_m3_6` adds public/private visibility, per-sport league configuration, franchise sport rosters, keeper selections, sport-scoped drafts, periods, matchups, waivers, trades and transactions, active-ownership constraints, and legacy backfills.
- `20261124021500_draft_season_identity_m3_6` permanently associates every draft with its season and prevents a second startup draft for the same league sport and season.
- `20261124022000_sport_draft_configuration_m3_6` persists independent draft order for every included sport.

The migrations were first deployed to a database restored from the backup. After integration tests passed, the same migrations were deployed to the working database. Protected before/after counts were unchanged: 7 users, 7 accounts, 2 leagues, 3 memberships, 3,396 players, 167 games, 3,509 player-game statistics, 22 score ledgers, 33 ledger entries, and one scoring preset. Teams increased from 2 to 3 because the M0 demo membership had never received a franchise. Six new sport-roster containers represent the existing four-sport demo and single-sport League0. No raw historical or ledger row was updated or removed.

## Implemented behavior

- League capacity is 2 through 16, defaults to 12, and can be reduced during setup when every existing franchise still fits. Odd leagues receive one bye per round; two-team schedules and playoffs are supported.
- A league accepts all 15 nonempty NFL, MLB, NBA and NHL combinations. One stable franchise owns a separate roster, FAAB balance, player ownership domain, draft, waiver flow, trade flow, matchup schedule and standings table for each included sport.
- Dynasty and Redraft remain the only primary formats. Redraft defaults to zero keepers and supports independent per-sport limits and deadlines. Rollover releases non-keepers, retains selected eligible players with new tenure rows, resets sport FAAB, and keeps prior roster history. Dynasty retains active ownership.
- Private leagues remain invitation-only. Authenticated users can discover and join setup-state Public leagues without seeing sensitive member fields. A human joining a computer-filled league replaces the first computer franchise.
- Normal creation automatically selects current season metadata. NBA and NHL labels span calendar years. Explicit season year remains confined to historical replay configuration.
- Drafts use separate sport pools, boards, queues, clocks, rounds, orders and season identities. Commissioners can configure rounds, timers and order, pause/resume, reconnect, use timer-driven automatic picks, and fill vacant capacity with computer franchises. Automatic choices deterministically prefer unfilled positional needs.
- Computer franchises have no fake user account. The idempotent fantasy worker makes expired picks and fills legal lineups from eligibility known at decision time. Database uniqueness and serializable transactions protect draft, free-agent, trade and waiver contention.
- Navigation and pages are sport-aware for roster, players, draft, matchups, standings, waivers, trades and settings. The overview shows all sport rosters while explicitly declining to invent an aggregate championship formula.
- V9 remains the immutable 56-weight experimental preset. No multiplier, normalization, coefficient change or V10 activation was introduced. The 0.5% cross-sport balance target remains unverified.

## Verification

- Clean `npm ci`: passed.
- Prisma generation and nine migration deployment: passed on restored and working databases.
- TypeScript: passed.
- ESLint: passed.
- Unit tests: 118 passed across 14 files.
- PostgreSQL integration tests: 14 passed across 5 files.
- Chromium tests: 8 passed, including exact trusted origins, untrusted-origin rejection, existing-account sign-in, password recovery, private authorization, historical replay and a two-team four-sport draft flow.
- Production build: passed.
- Full and production `npm audit`: zero findings.

Acceptance coverage includes every capacity from 2 through 16, all 15 sport combinations, both formats, zero/nonzero keepers, Public/Private behavior, legacy single-sport compatibility, 2-of-12 resizing, two-team snake drafts, 12 teams with two humans and ten computers, odd-team byes, independent player ownership, cross-sport draft rejection, keeper retention, season rollover, authorization and concurrent selection conflicts.

## Load measurements

The reproducible report is [`reports/load-m3-6.json`](../reports/load-m3-6.json). It used Node 24.8.0, an explicit IPv4 loopback URL, a warmed 20-connection application pool, and a 120-second request ceiling. All read/auth scenarios at 100, 500 and 1,000 isolated users returned zero errors.

| Scenario | 100-user p95 | 500-user p95 | 1,000-user p95 |
| --- | ---: | ---: | ---: |
| Authentication | 4.27 s | 25.31 s | 39.19 s |
| Dashboard | 0.93 s | 2.11 s | 6.80 s |
| Player search | 0.42 s | 2.03 s | 3.31 s |
| Matchups | 1.93 s | 1.73 s | 4.61 s |
| Standings | 1.29 s | 1.42 s | 3.44 s |

Read scenarios peaked at 24 PostgreSQL client connections including the load runner and sampler. Authentication hashing is the dominant bottleneck. In the 16-manager mutation run, one of 16 competing draft selections succeeded and 15 received expected 409 responses; the same occurred for direct acquisition. All 16 waiver submissions succeeded and processing completed. Mutation tests peaked at 26 PostgreSQL clients. These local measurements do not establish production capacity.

The recorded harness did not measure pool checkout wait, PostgreSQL statement timing, server CPU/RSS or event-loop delay. These remain unknown. Source review found no application-loop N+1 on the dashboard, but exact Prisma SQL statement count was not captured. The [performance investigation](M3_6_PERFORMANCE_INVESTIGATION.md) distinguishes simultaneous bursts from sustained use and defines M3.9 instrumentation recommendations without weakening password hashing.

## Manual acceptance

To resize the existing League0 from 12 to 2, sign in as its commissioner, open **Settings**, enter `2` under **League capacity**, and save while the league is still in setup. Then open **Draft**, choose NFL, review the two franchises, and start the NFL snake draft.

To create a four-sport league, open **Create league**, leave NFL, MLB, NBA and NHL checked, choose 2–16 teams, Dynasty or Redraft, and Private or Public. For a complete local 12-team test with two humans, create a 12-team league with computer franchises enabled, then have the second authenticated user join by invitation or Public discovery. Each real manager replaces one computer slot.

## Remaining limitations

- No authoritative live schedule, injury, availability, rotation or transaction feed is connected. Normal season metadata is real configuration metadata, not evidence of live game coverage.
- Cross-sport trades and an aggregate championship remain intentionally undefined because calendars, offseason periods, scoring-period alignment and transaction semantics require product rules and calibration evidence.
- Rookie/supplemental drafts and explicit keeper draft-cost configuration are not exposed. One startup/redraft draft per sport-season is enforced.
- Historical reconstruction remains distinct from verified pregame evidence. The archived datasets still need independently timestamped preseason ranks, injury/availability reports, pitching rotations, position lists, schedules and waiver knowledge for defensible calibration.
- The 0.5% balance target is unverified, and V10 remains inactive.
- M4 has not begun. Manual owner acceptance of M3.6 is the next gate.
