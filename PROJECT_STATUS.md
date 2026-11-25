# Fantasy Evolution project status

Current implementation head descends from `6bf22fc`. The reconstructed M4 specification is authoritative and now includes the November 25 continuation decisions for salary-dynasty picks, universal cap transfers, short keeper drafts and weighted-lottery gating.

## Current verified state

- M4.3 immutable FAAB accounting, rolling priority, verified-completion mechanism and offseason acquisition gates are implemented.
- M4.4 append-only rookie evidence and the pre-draft acquisition gate are implemented; rookie draft execution and keepers remain incomplete.
- Head-to-head opponent rotations now persist immediately at draft completion as relative periods; authoritative calendar binding remains pending where source dates are unavailable.
- Ordinary trades now enforce proposer compliance and atomic post-trade compliance for both franchises; the explicitly classified corrective-trade exception remains gated.
- Authenticated brand navigation, Account, league overview, roster selection cancellation, draft access through Settings, readable scoring labels and centralized position colors are implemented. Player, waiver, roster and draft surfaces now share the position system; draft boards expose franchise ownership and verified position evidence without inventing salary or projection values.
- Player data was audited read-only; see `docs/PLAYER_DATA_AUDIT.md`.
- Unit, type, lint, production build and the targeted authenticated browser flow pass. Full milestone regression remains required after the remaining website and gameplay work.

## Operational dependency

The development database intentionally remains on 17 migrations. Waivers now requires the validated `20261125190000_waiver_accounting_m4_3` migration (and its prerequisite pending migrations) plus an application restart with the regenerated Prisma client. Do not deploy those development migrations without explicit approval. Disposable schemas have applied all 21 migrations successfully.

No production deployment has been performed.
