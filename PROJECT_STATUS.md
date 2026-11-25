# Fantasy Evolution project status

Current implementation head descends from `6bf22fc`. The reconstructed M4 specification is authoritative and now includes the November 25 continuation decisions for salary-dynasty picks, universal cap transfers, short keeper drafts and weighted-lottery gating.

## Current verified state

- M4.3 immutable FAAB accounting, rolling priority, verified-completion mechanism and offseason acquisition gates are implemented.
- M4.4 append-only rookie evidence and the pre-draft acquisition gate are implemented; rookie draft execution and keepers remain incomplete.
- Head-to-head opponent rotations now persist immediately at draft completion as relative periods; authoritative calendar binding remains pending where source dates are unavailable.
- Ordinary trades now enforce proposer compliance and atomic post-trade compliance for both franchises; the explicitly classified corrective-trade exception remains gated.
- Authenticated brand navigation, Account, league overview, roster selection cancellation, draft access through Settings, readable scoring labels and centralized position colors are implemented. Player, waiver, roster and draft surfaces now share the position system; draft boards expose franchise ownership and verified position evidence without inventing salary or projection values.
- The Fantasy Evolution brand now always opens the public landing page. That page renders Dashboard and Account links for an existing session and Sign In and Register links for guests; navigation itself never revokes a session.
- Fresh-league creation is regression-covered across 2, 3, 4, 5, 6, 8, 10 and 12 franchises, normal and historical modes, single- and multi-sport leagues, redraft and dynasty, and H2H and cumulative competition. A forced late foreign-key failure proves the transaction leaves no league, competition or championship-cycle records behind.
- Player data was audited read-only; see `docs/PLAYER_DATA_AUDIT.md`.
- The current checkpoint passes 138 unit tests, 31 fresh-schema PostgreSQL integration tests, TypeScript, ESLint and the production Turbopack build. The authenticated browser flow passed at the preceding website checkpoint; full browser regression remains required after the remaining website and gameplay work.

## Operational dependency

The development database intentionally remains on 17 migrations pending explicit deployment approval. The league-creation exception is confirmed: generated Prisma Client writes `League.faabScope` and `League.universalStartingFaab`, while those development columns do not exist until `20261125190000_waiver_accounting_m4_3`. Waivers requires tables from that same pending migration. Fresh disposable schemas apply all 22 migrations and both paths pass. Apply the five pending migrations together, then restart the application; do not reset, seed or truncate development.

No production deployment has been performed.
