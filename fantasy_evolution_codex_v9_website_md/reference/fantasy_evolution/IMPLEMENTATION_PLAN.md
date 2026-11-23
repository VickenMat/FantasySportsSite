# Fantasy Evolution | Implementation plan (draft v0.4)

## Phase 0: rules and tests
- Validate all 9/10/12 templates have exact requested slot counts; validate single-sport templates.
- Write machine-checkable constraints from SETTINGS_SCHEMA.json; treat current file as planning data, not a full JSON Schema.
- Implement tests for MI and F/C slot eligibility, two-way identity and exclusive scoring role, official-start locks, and invalid dynasty trade acceptance.

## Phase 1: platform foundation
- TypeScript monorepo, Next.js frontend, server-side API, PostgreSQL, migrations, authentication, permissions, immutable event/audit trail, league rule snapshots.
- Distinct SportSeason and LeagueSeason identities; provider-ID mapping; time-zone-aware game schedule and locking service.

## Phase 2: playable league
- League creation, commissioner settings validation, rosters and lineups, universal snake draft, transactions, cumulative standings, single-sport preset scoring.
- Build idempotent writes, race-safe draft picks, conflict-safe roster moves, tests and admin diagnostics.

## Phase 3: multi-sport
- UBP scoring engine and historical calibration tooling **only after data arrives**; multi-sport cumulative competition; balanced rosters, universal bench, season lifecycle, two-way roles.

## Phase 4: advanced mechanics
- Auctions, sport rotation, progressive/protected dynasty drafts, waivers/FAAB/Vickrey, contracts, keeper systems, open universe, trades and pick assets.

## Phase 5: professional operations
- Licensed data feeds, stat correction pipeline, real-time delivery, observability, backup/restore, security review, public documentation, analytics ADP and auction values, mobile-ready API.

## Quality gates
- Scoring reproducible from raw stat events and locked version.
- No game-locked athlete is movable/cut/tradable.
- Invalid dynasty roster can accept incoming trade, even if more invalid, but cannot propose or add; existing starters score.
- One two-way athlete consumes one roster spot and never double-scores overlapping roles.
- Every authoritative change has actor, timestamp, rule version, idempotency key and audit event.
