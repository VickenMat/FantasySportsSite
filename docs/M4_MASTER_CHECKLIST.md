# M4 master implementation checklist

This checklist implements the reconstructed November 25, 2026 M4 master specification. A checked item means implemented and verified; a partial item is labeled rather than implied complete. Explicit data and product gates remain unchecked even when the safe pending behavior exists.

Current continuation: **46 checked / 14 unchecked / 60 total**. A checked mechanism can retain an explicit production-data gate; pending implementation and acceptance remain unchecked.

The checked contract-automation safeguard records intentional inactivity, not a gameplay feature. Thus the former 48-row checklist had 17 checked rows comprising 16 implemented mechanisms and one intentional-disable safeguard. M4.1 below restores requirements already documented in the M4.1 report; it adds no new product rules.

## M4.1 authoritative scheduling foundation

- [x] Append-only professional schedule revisions with provenance and immutable source records
- [x] Earliest eligible not-started professional-season selection and explicit missing-data states
- [x] Championship cycles and independent sport-season assignment snapshots
- [x] Unique league/game attribution across championship cycles
- [x] Idempotent schedule import and independent next-season assignment
- [x] Fantasy-specific scoring windows, configurable matchup length and deadlines reconciled within verified professional bounds

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
- [x] Rolling waiver priority, recorded auction priority and 24-hour release/completion hold mechanisms (production completion instants remain pending data)
- [x] Per-sport $100 and cycle-scoped universal $500 FAAB accounts with independent resets and preserved overlapping-cycle balances
- [x] Sealed $0+ bids, reservations, immutable ledger, priority tie resolution and concurrent-spend protection
- [x] Dynasty offseason acquisition enabled, redraft disabled until applicable draft, and source-verified-rookie pre-draft acquisition block

## M4.4 dynasty and keepers

- [x] Append-only verified rookie evidence model and pre-draft acquisition block (production evidence remains `PENDING_DATA`; synthetic fixture verified)
- [x] Configurable linear traditional rookie drafts (four rounds by default; extended inventory supported) using reverse finalized sport placement only, overflow and pick consumption (lottery/custom ordering revoked; historical provenance retained; production rookie evidence remains pending)
- [x] Three-season future-pick inventory and initial ownership history
- [x] Snake-only redraft keeper cost/history/escalation/conflict validation, three-year maximum and last-round fallback (trade, drop/reacquire, ownership reselection and exact paid-round acceptance verified; auction keeper prohibition is tracked separately below)
- [x] Redraft prohibition on future picks and auction keepers, enforced in service/database and regression-tested

## M4.5 salary cap, Vickrey and dead cap

- [x] Per-sport $400 and optional universal $500 salary accounts with exact integer ledger
- [x] Auction-only salary acquisition and persistent player salary history
- [x] $2 per-retained-player idempotent sport-rollover increases
- [x] Sealed 24-hour Vickrey auctions, maximum-bid reservations, deterministic ties and settlement provenance
- [x] Recoverable ceil(50%) dead cap, seven-day cooldown, single-use self-reacquisition credit, independent obligations and decreasing player floors
- [x] Exact compliance calculation and corrective action gates
- [x] Conserved current sport-season/universal-cycle cap transfers and idempotent expiry without future-cycle transfers
- [x] Contract automation remains inactive

## M4.6 advanced trading

- [x] Two-or-more-team proposal and acceptance model
- [ ] Players, picks, FAAB and same-sport salary-cap assets
- [x] Material revisions invalidate acceptances
- [ ] Default 24-hour review, veto, expiry and worker execution
- [x] Atomic validation/execution and conflicting-offer invalidation
- [ ] Per-asset deadlines, review-window deadline guard and dynasty/redraft offseason restrictions

## M4.7 lifecycle and commissioner controls

- [x] Idempotent independent redraft/dynasty competitive rollover after verified finalization, next-season assignment and rollover boundary
- [x] Budget resets, pick generation, salary increases and obligation expiry
- [ ] Sport and overall championship finalization
- [x] Versioned future-cycle settings without retroactive finalized-result mutation
- [ ] Append-only commissioner action audit (settings, draft order, capacity, assignment, and historical transitions verified; further administration pending)
- [ ] Abandoned-team ownership transfer, offseason-only team removal and midseason expansion rejection

## Draft and website continuation

- [x] Upcoming/following season offsets with independent sport labels and explicit pending dates
- [x] Horizontal responsive Overview, private invitation creation/copy and member-visible draft scheduling
- [ ] Comprehensive Waivers browser and compatibility redirects (implemented; additional filter, ownership and missing-score acceptance remains)
- [x] Permanent Draft center with persisted random/custom initial order, UTC scheduling, one-hour preparation, queues, server activation and gated testing shortcut
- [x] Immutable new-selection recap labels, acquisition prices and original/transferred rookie ownership
- [ ] Complete traditional, salary, sport and universal draft acceptance matrix

## M4.8 acceptance

- [ ] Unit and fixture-backed data-unavailable coverage
- [ ] PostgreSQL constraints, idempotency and concurrency coverage (implemented checkpoints covered)
- [ ] Chromium workflows and representative screenshots (implemented checkpoints covered)
- [ ] Full regression, typecheck, lint, Prisma, build and audit gates (current checkpoint passed; repeat after remaining milestones)
- [x] Development database and append-only trigger integrity
- [ ] Final completion report and manual acceptance checklist

See the checkpoint reports for [competition](M4_2_REPORT.md), [rosters and recovery](M4_3_REPORT.md), [dynasty picks](M4_4_REPORT.md), and [commissioner administration](M4_7_REPORT.md).
