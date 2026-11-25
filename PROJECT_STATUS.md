# Fantasy Evolution project status

Current implementation head descends from `6bf22fc`. The reconstructed M4 specification is authoritative and now includes the November 25 continuation decisions for salary-dynasty picks, universal cap transfers, short keeper drafts, weighted lotteries, playoff elimination rounds, over-cap cuts, self-reacquisition credit and released-player floors.

## Current verified state

- M4.3 immutable FAAB accounting, rolling priority, verified-completion mechanism and offseason acquisition gates are implemented.
- M4.4 rookie evidence and the pre-draft acquisition gate are implemented. Keeper selection now persists escalating costs, short-draft fallback and conflict resolution, and snapshots exact paid rounds for the next snake draft. Full keeper history/ownership acceptance and rookie execution remain incomplete.
- Head-to-head opponent rotations now persist immediately at draft completion as relative periods; authoritative calendar binding remains pending where source dates are unavailable.
- Ordinary trades now enforce proposer compliance and atomic post-trade compliance for both franchises; the explicitly classified corrective-trade exception remains gated.
- Authenticated brand navigation, Account, league overview, roster selection cancellation, draft access through Settings, readable scoring labels and centralized position colors are implemented. Player, waiver, roster and draft surfaces now share the position system; draft boards expose franchise ownership and verified position evidence without inventing salary or projection values.
- The Fantasy Evolution brand now always opens the public landing page. That page renders Dashboard and Account links for an existing session and Sign In and Register links for guests; navigation itself never revokes a session.
- Fresh-league creation is regression-covered across 2, 3, 4, 5, 6, 8, 10 and 12 franchises, normal and historical modes, single- and multi-sport leagues, redraft and dynasty, and H2H and cumulative competition. A forced late foreign-key failure proves the transaction leaves no league, competition or championship-cycle records behind.
- Player data was audited read-only; see `docs/PLAYER_DATA_AUDIT.md`.
- The current checkpoint passes 147 unit tests, 43 fresh-schema PostgreSQL integration tests, 11 standard Chromium workflows, TypeScript, ESLint, Prisma validation/generation and the production Turbopack build. The opt-in live-development test is separate. npm audit reports zero vulnerabilities.

## Operational dependency

The development database was backed up and upgraded from 17 to all 22 migrations after the populated-copy compatibility check passed. Existing critical counts and compatible fingerprints, all four accepted V5 file hashes and all 56 UBP V9 rules remain unchanged. The additive FAAB migration created 10 opening accounts, ledger entries and waiver priorities for existing franchises. Dedicated live QA verified two-team NFL redraft creation, odd three-team multi-sport dynasty creation, new and existing Waivers pages, existing-league access and authenticated landing navigation.

No production deployment has been performed.

## Health audit findings

The running stack starts with `npm run dev:all`. P0 remediation isolates per-pick and gameplay jobs, journals blocked states, uses execution ownership and retry backoff, and reports degraded/stale operational health with HTTP 503. League1's existing 14/5 NFL bench overflow remains an explicit draft block; no user roster was changed. Live landing/Dashboard/league stability passed for 120 seconds without refresh loops. See `docs/M4_WORKER_REMEDIATION.md`.

All 22 migrations are deployed. Prisma now describes the accepted database defaults/index name accurately; development and fresh-schema diffs report no difference. No additional migration was needed. The verified backup is secured at `/Users/vicken/Developer/PrivateBackups/FantasyEvolution/fantasy_evolution_pre_m4_22_20261125.dump` (SHA-256 `c5b3c50fcd6510bb9a16a539147ac8546788b9c470e498a39da4306565b2a04a`); the original temporary backup is retained.

The user approved fixture classification separately: exactly 3,388 legacy fixture-only players were marked synthetic, with all non-flag player fields, statistics and rosters fingerprint-identical. Accepted real archive coverage is 4,645 players. Historical V9 totals are now derived read-only where inputs are complete; no competitive ledger backfill was performed. See the corrected player audit.

Live QA added two users (including one from the first selector-failed run) and two dedicated leagues. Development now has 11 users and five leagues. Original nine user rows retain their fingerprint; 47 roster entries and 48 assignment events are preserved. There are 22 enabled append-only triggers, zero invalid foreign keys, zero duplicate active ownership groups, and no negative or ledger-inconsistent FAAB accounts.
