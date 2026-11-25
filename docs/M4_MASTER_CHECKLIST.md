# M4 master implementation checklist

This checklist implements the reconstructed November 25, 2026 M4 master specification. A checked item means implemented and verified; a partial item is labeled rather than implied complete. Explicit data and product gates remain unchecked even when the safe pending behavior exists.

## M4.2 competition and championships

- [x] Immutable cycle configuration snapshots
- [x] Independent sport H2H periods and balanced schedules
- [x] Draft-completion relative opponent schedules with deterministic round-robin rotation, odd-team byes and pending calendar binding
- [x] Cumulative sport and combined UBP standings without playoffs
- [x] Fixed H2H playoffs, byes, third-place and consolation placement
- [ ] Championship point ledger and overall championship (sport award components and cycle projections persist; final cumulative placement and evidence-backed live finalization remain)
- [x] Configurable deterministic tiebreakers and recorded random draws
- [x] Provisional correction revisions and the source-backed 24-hour competitive finalization window
- [x] Source-backed fantasy playoff scheduling; missing data remains pending

## M4.3 rosters and traditional waivers

- [x] Immutable game-start lineup snapshots and append-only roster assignment history foundation
- [x] Five sport benches, five universal benches and five universal IR slots
- [x] Atomic cross-sport slot movement and immutable individual-game lineup locks
- [x] Verified IR eligibility and acquisition restriction when noncompliant across free agency, draft, traditional waivers and ordinary trades; explicitly classified corrective trades remain gated
- [ ] Rolling waiver priority and 24-hour holds (reverse-snake priority, winner-to-bottom, release and synthetic verified-completion mechanisms verified; auction initial draw and production completion evidence remain gated)
- [ ] Per-sport $100 and optional cycle-scoped universal $500 FAAB accounts (accounts verified; independent rollover resets remain M4.7)
- [x] Sealed $0+ bids, reservations, immutable ledger, priority tie resolution and concurrent-spend protection
- [x] Dynasty offseason acquisition enabled, redraft disabled until applicable draft, and source-verified-rookie pre-draft acquisition block

## M4.4 dynasty and keepers

- [x] Append-only verified rookie evidence model and pre-draft acquisition block (production evidence remains `PENDING_DATA`; synthetic fixture verified)
- [ ] Configurable four-round linear traditional rookie drafts, reverse-placement/manual/weighted-lottery infrastructure, overflow and pick consumption (lottery formula remains gated)
- [x] Three-season future-pick inventory and initial ownership history
- [ ] Snake-only redraft keeper cost/history/escalation/conflict validation, three-year maximum and last-round fallback for drafts shorter than ten rounds
- [ ] Redraft prohibition on future picks and auction keepers (future picks prohibited in service and PostgreSQL; auction keeper gate pending)

## M4.5 salary cap, Vickrey and dead cap

- [ ] Per-sport $400 and optional universal $500 salary accounts with exact integer ledger
- [ ] Auction-only salary acquisition and persistent player salary history
- [ ] $2 per-retained-player idempotent sport-rollover increases
- [ ] Sealed 24-hour Vickrey auctions, maximum-bid reservations, deterministic ties and settlement provenance
- [ ] Recoverable ceil(50%) dead cap, acquisition clearing/replacement and seven-day releasing-manager restriction
- [ ] Exact compliance calculation and corrective action gates
- [ ] Sport-season and universal current-cycle conserved cap transfers and expiry (universal trade deadline remains gated)
- [x] Contract automation remains inactive

## M4.6 advanced trading

- [ ] Two-or-more-team proposal and acceptance model
- [ ] Players, picks, FAAB and same-sport salary-cap assets
- [ ] Material revisions invalidate acceptances
- [ ] Default 24-hour review, veto, expiry and worker execution
- [ ] Atomic validation/execution and conflicting-offer invalidation
- [ ] Per-asset deadlines, review-window deadline guard and dynasty/redraft offseason restrictions

## M4.7 lifecycle and commissioner controls

- [ ] Idempotent independent redraft and dynasty rollover (idempotent source-backed next-season assignment verified; competitive activation and rollover pending)
- [ ] Budget resets, pick generation, salary increases and obligation expiry
- [ ] Sport and overall championship finalization
- [ ] Versioned future-cycle settings without retroactive finalized-result mutation
- [ ] Append-only commissioner action audit (settings, draft order, capacity, assignment, and historical transitions verified; further administration pending)
- [ ] Abandoned-team ownership transfer, offseason-only team removal and midseason expansion rejection

## M4.8 acceptance

- [ ] Unit and fixture-backed data-unavailable coverage
- [ ] PostgreSQL constraints, idempotency and concurrency coverage (implemented checkpoints covered)
- [ ] Chromium workflows and representative screenshots (implemented checkpoints covered)
- [ ] Full regression, typecheck, lint, Prisma, build and audit gates (current checkpoint passed; repeat after remaining milestones)
- [ ] Development database and append-only trigger integrity
- [ ] Final completion report and manual acceptance checklist

See the checkpoint reports for [competition](M4_2_REPORT.md), [rosters and recovery](M4_3_REPORT.md), [dynasty picks](M4_4_REPORT.md), and [commissioner administration](M4_7_REPORT.md).
