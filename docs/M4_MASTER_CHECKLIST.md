# M4 master implementation checklist

This checklist implements the November 24, 2026 M4 master specification. A checked item means implemented and verified; a partial item is labeled rather than implied complete.

## M4.2 competition and championships

- [x] Immutable cycle configuration snapshots
- [x] Independent sport H2H periods and balanced schedules
- [x] Cumulative sport and combined UBP standings without playoffs
- [x] Fixed H2H playoffs, byes, third-place and consolation placement
- [ ] Championship point ledger and overall championship (sport awards and cycle projections persisted; final live cycle acceptance awaits official publication evidence)
- [x] Configurable deterministic tiebreakers and recorded random draws
- [x] Provisional correction revisions and the source-backed 24-hour competitive finalization window
- [x] Source-backed fantasy playoff scheduling; missing data remains pending

## M4.3 rosters and traditional waivers

- [x] Immutable game-start lineup snapshots and append-only roster assignment history foundation
- [ ] Five sport benches, five universal benches and five universal IR slots
- [ ] Atomic cross-sport slot movement and individual-game locks
- [ ] Verified IR eligibility and acquisition restriction when noncompliant
- [ ] Rolling waiver priority and 24-hour holds
- [ ] Per-sport and cycle-scoped universal FAAB accounts
- [ ] Sealed bids, reservations, ledger and concurrent-spend protection
- [ ] Offseason redraft/dynasty acquisition rules

## M4.4 dynasty and keepers

- [ ] Verified rookie evidence and pre-draft acquisition block
- [ ] Four-round linear sport rookie drafts and order provenance
- [ ] Three-season future-pick inventory and ownership history
- [ ] Redraft keeper cost/history/conflict validation
- [ ] Redraft prohibition on future picks and auction keepers

## M4.5 salary cap, Vickrey and dead cap

- [ ] Per-sport $400 and universal $500 salary accounts
- [ ] Auction-only salary acquisition and persistent player salary history
- [ ] $2 idempotent sport-rollover increases
- [ ] Sealed 24-hour Vickrey auctions and reservations
- [ ] Recoverable 50% ceiling dead cap and seven-day reacquisition restriction
- [ ] Exact compliance calculation and corrective action gates
- [ ] Same-sport conserved cap transfers and rollover expiry
- [ ] Contract automation remains inactive

## M4.6 advanced trading

- [ ] Two-or-more-team proposal and acceptance model
- [ ] Players, picks, FAAB and same-sport salary-cap assets
- [ ] Material revisions invalidate acceptances
- [ ] Default 24-hour review, veto, expiry and worker execution
- [ ] Atomic validation/execution and conflicting-offer invalidation
- [ ] Cross-sport deadlines and offseason restrictions

## M4.7 lifecycle and commissioner controls

- [ ] Idempotent independent redraft and dynasty rollover
- [ ] Budget resets, pick generation, salary increases and obligation expiry
- [ ] Sport and overall championship finalization
- [ ] Versioned future-cycle settings
- [ ] Append-only commissioner action audit
- [ ] Ownership transfer and offseason-only team removal

## M4.8 acceptance

- [ ] Unit and fixture-backed data-unavailable coverage
- [ ] PostgreSQL constraints, idempotency and concurrency coverage
- [ ] Chromium workflows and representative screenshots
- [ ] Full regression, typecheck, lint, Prisma, build and audit gates
- [ ] Development database and append-only trigger integrity
- [ ] Final completion report and manual acceptance checklist

See the [M4.3 recovery checkpoint](M4_3_REPORT.md) for the fixture isolation and database integrity results.
