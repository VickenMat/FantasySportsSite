# M4 master implementation checklist

This checklist implements the reconstructed November 25, 2026 M4 master specification. A checked item means implemented and verified; a partial item is labeled rather than implied complete. External evidence and intentionally inactive features are recorded separately; a verified mechanism does not claim that production evidence exists.

Current continuation: **60 checked / 0 unchecked / 60 total**. A checked mechanism can retain an explicit production-data gate; pending implementation and acceptance remain unchecked.

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
- [x] Championship point ledger and overall championship, with source-backed H2H/cumulative finalization, frozen totals and idempotent awards
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
- [x] Players, picks, FAAB, salary-following ownership and same-sport/current-cycle universal cap assets, verified through mixed-asset website and integration workflows
- [x] Material revisions invalidate acceptances
- [x] Default 24-hour review, veto, cancellation, expiry, reservation release and idempotent worker execution
- [x] Atomic validation/execution and conflicting-offer invalidation
- [x] Per-asset deadlines, review-window guard, dynasty/redraft offseason restrictions and standalone universal cap exception

## M4.7 lifecycle and commissioner controls

- [x] Idempotent independent redraft/dynasty competitive rollover after verified finalization, next-season assignment and rollover boundary
- [x] Budget resets, pick generation, salary increases and obligation expiry
- [x] Sport and overall championship finalization after verified completion/publication and the correction window
- [x] Versioned future-cycle settings without retroactive finalized-result mutation
- [x] Append-only commissioner action audit, reversible score adjustments, paused initial-snake last-pick undo/correction, immutable original recaps and timer recovery; irreversible downstream/rookie/auction reversals explain their guard
- [x] Abandoned-team ownership transfer, source-verified all-sport offseason franchise archival with assets resolved and history preserved, and midseason expansion rejection

## Draft and website continuation

- [x] Upcoming/following season offsets with independent sport labels and explicit pending dates
- [x] Horizontal responsive Overview, private invitation creation/copy and member-visible draft scheduling
- [x] Comprehensive Waivers browser and compatibility redirects, global filters/sorting before pagination, ownership protection, known zero versus unknown scores
- [x] Permanent Draft center with persisted random/custom initial order, UTC scheduling, one-hour preparation, queues, server activation and gated testing shortcut
- [x] Immutable new-selection recap labels, acquisition prices and original/transferred rookie ownership
- [x] Traditional and salary auctions, sport/universal accounts, universal snake, scheduled rookie, keeper and all six requested website gameplay journeys

## M4.8 acceptance

- [x] Unit and fixture-backed data-unavailable coverage (155 unit tests)
- [x] PostgreSQL constraints, idempotency and concurrency coverage (87 tests; normal and shuffled fresh-schema runs)
- [x] Chromium workflows and representative screenshots (17 standard workflows plus two actual restart workflows; one development-writing opt-in skipped)
- [x] Full regression, typecheck, lint, Prisma, build and audit gates; normal/shuffled 87-test integration runs, production build and zero audit vulnerabilities
- [x] Development database and append-only trigger integrity
- [x] Final completion report and manual acceptance guide, with explicit M5 data dependencies and administrative safety boundaries

See the checkpoint reports for [competition](M4_2_REPORT.md), [rosters and recovery](M4_3_REPORT.md), [dynasty picks](M4_4_REPORT.md), and [commissioner administration](M4_7_REPORT.md).

Final acceptance is complete for all unblocked mechanisms. The restarted development stack passed a 120-second read-only stability check; its existing noncompliant draft remains explicitly blocked. All development fingerprints except the expected worker journal are preserved. No additional migration or backfill approval is pending. See [completion and M5 handoff](M4_COMPLETION_REPORT.md) and [manual acceptance](M4_ACCEPTANCE_GUIDE.md).
