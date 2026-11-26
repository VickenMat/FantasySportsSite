# Fantasy Evolution | M4 Master Specification

**Final correction authority:** The latest Final M4 Implementation and Draft Experience Redesign request supersedes older proposals. Rookie lotteries and ordinary custom rookie order are revoked; historical audit records remain preserved. Standalone universal cap transfers are allowed throughout their current cycle, same-round eliminated teams use original seed, and player floors only decrease.

**Status:** Reconstructed approved requirements, November 25, 2026. Not a verbatim recovery of the November 24 master prompt.

## 1. Authority and scope

This document consolidates retained approved gameplay decisions, the supplied `M4_GAMEPLAY_SPEC_V1.md` (internally v2), `M4_IMPLEMENTATION_PLAN.md`, and the latest implementation checklist at commit `0bcefd6`. It supersedes older proposals where a confirmed decision is recorded here. The implementation plan remains the technical companion; the checklist tracks implementation, not product authority. The original 185 acceptance scenarios could not be recovered verbatim; the acceptance matrix below is a reconstructed minimum, not a claim of equivalence. Where a decision is explicitly gated, do not invent a default. Continue unrelated work.

M4 covers competition, roster management, transactions, dynasty, salary, trading, lifecycle and acceptance. M5 supplies authoritative professional data; M6 optimizes UBP V10; M7 covers production deployment. V9's 56 weights remain unchanged; V10 inactive; the 0.5% cross-sport balance target is not verified.

## 2. Architecture and invariants

- Independent dimensions: HEAD_TO_HEAD or CUMULATIVE; REDRAFT or DYNASTY; traditional or salary-cap format; snake or auction initial draft; linear traditional rookie draft; rolling or FAAB traditional waivers; Vickrey salary acquisition.
- One canonical identity per player, game, asset, balance and result. Raw observations and ownership/financial history are append-only. Corrections create revisions.
- Use exact integer currency, exact rational championship awards (including split ties), and one-decimal displayed fantasy scores. Do not round intermediate championship calculations.
- Mutations are authorized, serializable, idempotent where retried, and atomic across all assets. Use database constraints and deterministic locking; no negative available balances or duplicate ownership.
- Store UTC instants, render explicit user/league timezone. Unknown is not zero, eligible, retired or complete.
- Preserve historical records and existing league overrides. Additive migrations until replacement paths are verified. Never rewrite finalized competition automatically.

## 3. Scheduling and championship cycles

League creation offers only the upcoming eligible professional season (default) or immediately following season. Apply the selected offset independently to each sport. Draft completion never changes that selection. Unknown boundaries retain the chosen season label and explicit schedule-pending state. If no verified boundary exists, use PENDING_DATA. Historical replay is explicitly labeled and separate from normal scheduling. Each sport season belongs to exactly one league championship cycle; independent sport seasons can overlap different cycles. A game contributes at most once per league. Preserve LeagueSport current pointer for compatibility, not authority.

Schedule preview exposes sport, season, scoring bounds, draft deadline, trade deadline, playoff window, cycle, rollover expectation, provenance and warnings. Use source-backed dates, not guessed constants. V5 is accepted: 57,352 schedule observations, 52,862 matched of 52,866 historical game IDs, four unresolved NBA IDs (0021900888, 0021900894, 0021900886, 0021900848), five future NBA starts pending, independently unverified season boundaries. Preserve unmatched statistics; do not force crosswalks or restart acquisition. Accepted scheduled starts are not necessarily actual starts or completion instants.

## 4. Competition modes

H2H: each sport has independent weekly W-L-T, standings, playoffs and champion. Never combine weekly W-L-T or normalize win percentages across sports. Skip periods without active assigned games. Overall multi-sport H2H championship is the sum of sport championship awards for assigned seasons; no overall playoff bracket. Cumulative: raw eligible starter UBP summed by sport and across the cycle, no fantasy playoffs, no championship placement awards. No unapproved schedule normalization multiplier.

NFL H2H defaults to weeks 1–17: regular season 1–14, quarterfinals 15, semifinals 16, final/third place 17. Week 18 excluded from H2H and included in cumulative. Other sports use authoritative schedules and work backward from fantasy championship date. Default matchup length one week; commissioner-configurable. Do not use professional playoff start as fantasy trade deadline.

## 5. H2H playoffs and placement

Default top six regular-season teams qualify; fixed single-elimination bracket, no reseeding. Seeds 1 and 2 receive byes; 3 vs 6 and 4 vs 5; seed 1 faces 4/5 winner, seed 2 faces 3/6 winner. Semifinal losers play for third. Consolation games matter and determine highest remaining final placements. Eliminated playoff teams rank primarily by elimination round; same-round teams rank by their original regular-season seed. Regular-season records determine qualification and initial seeds; final postseason placement determines base awards. Commissioner chooses playoff format. Handle odd sizes, byes and non-power-of-two brackets deterministically; do not fabricate matches. Without consolation, rank eliminated teams first by elimination round and then original regular-season seed.

## 6. Championship points and tiebreakers

For league size N and final postseason rank r: base N − r + 1; +1 playoff qualification; +5 champion OR +2 runner-up OR +1 actual third-place winner; +3 highest regular-season points for; −3 lowest regular-season points for. PF ties split the relevant bonus/penalty equally. Qualification and PF awards stack with placement bonuses; negative totals permitted. Defaults configurable. Twelve-team maximum 21, minimum −2; four sports maximum 84, minimum −8. Persist award components, final placements and cycle totals. Single-sport H2H champion is the playoff winner (retained interpretation; flag if conflicting configuration). No shared overall championship.

Default ordered tiebreakers, commissioner configurable:

1. H2H standings: W-L-T, PF, head-to-head record, lowest PA, recorded random draw.
2. Playoff matchup: matchup UBP, regular-season H2H series, regular-season PF, higher original seed.
3. Overall H2H: championship points, combined UBP, most sport champions, most runner-ups, most third places, recorded random draw.
4. Overall cumulative: combined UBP, most first-place sport finishes, most second places, most third places, recorded random draw.

Random draws are permanent, auditable, idempotent, and never rerolled on refresh. Combined UBP uses applicable cycle scoring; exact scope in unusual configurations must be explicit.

## 7. Scoring and corrections

Score only eligible starters from immutable individual-game lineup snapshots, using latest applicable score ledger revision and unique game attribution. Bench and IR never score. Persist provisional matchup/standings revisions, bracket advancement and award projections. Official corrections may revise provisional outcomes during the source-backed 24-hour finalization window; after finalization underlying statistics may still correct but competitive advancement and awards do not automatically change. Official publication timestamps are missing from the archive; do not substitute import time or game start. Keep affected outcomes provisional. Commissioner corrections are explicit and audited, not silent rewrites.

## 8. Rosters and eligibility

| Sport | Default nine starters |
|---|---|
| NFL | QB, RB, RB, WR, WR, WR, TE, FLEX, SUPERFLEX |
| MLB | SP, SP, 1B, 3B, MI, OF, OF, UTIL, UTIL |
| NBA | PG, SG, G, SF, PF, F, C, C, UTIL |
| NHL | F, F, F, F, D, D, G, UTIL, UTIL |

Five sport-specific bench slots per sport plus five shared universal bench and five shared universal IR slots per franchise. Four-sport capacity 66 (36 starters, 20 sport bench, 5 universal bench, 5 IR). Existing configurable overrides remain authoritative. NFL FLEX RB/WR/TE; SUPERFLEX also QB. MLB UTIL nonpitchers; NBA UTIL any position; NHL UTIL F/D (latest explicit roster configuration). MLB position eligibility gained at 10 starts OR 20 games, valid current and next year. Do not infer unavailable positions. Unlimited legal bench movement subject to individual game locks; swaps validate both directions atomically. Shared slots are not duplicated per sport.

## 9. Lineup locks and IR

Lock at individual game start; preserve immutable lineup snapshots and append-only assignment events. No retroactive starter substitution. Use verified sport-specific availability evidence for IR; NFL includes IR, suspended and out designations. Offseason inactivity and retirement alone do not qualify. Loss of IR eligibility causes noncompliance and blocks acquisitions until corrected. An ineligible team may accept incoming compliant proposals but cannot initiate ordinary outgoing proposals. Corrective releases and explicitly classified payroll-reducing trades are exceptions only where applicable; validate final state and do not bypass ordinary gates. No offseason IR. Missing evidence stays pending.

## 10. Traditional waivers and free agency

Rolling or FAAB, not Vickrey. Default hold 24 hours after playing or release; use verified completion instant for game-based hold, never scheduled start. Release clock can operate independently. Initial rolling priority reverse snake draft order or recorded random order for auction; successful claimant moves to bottom. FAAB equal bids resolved by rolling priority. $0 bids permitted. Default unlimited acquisitions, configurable. Waivers remain active during playoffs and consolation. Dynasty offseason acquisition enabled; redraft disabled until applicable draft. Verified rookies cannot be acquired before rookie draft. Unavailable evidence must not be silently interpreted as eligibility.

## 11. FAAB accounting

Default $100 per sport; optional universal $500 instead of sport budgets. No carryover. Sport reset at respective sport rollover; universal reset at overall championship cycle completion. Separate cycle balances during overlap. Sealed bids, reserve maximum pending spend, release reservations on cancellation/loss/expiry, settle atomically. Dedicated append-only ledger for opening balances, awards, transfers, reservations, settlement and resets; prevent concurrent overspend. FAAB trades allowed subject to asset deadline and conservation. FAAB is never salary; no conversion.

## 12. Dynasty and rookie drafts

Implementation note, November 25 continuation: linear rookie execution, immutable entitlement consumption and keeper ownership-history mechanisms are implemented and fixture-verified. The rookie UI defaults to four rounds and supports longer persisted configurations through the approved lifecycle migration. Expanding inventory preserves previously transferred original entitlements. Negotiated revisioned pick trades and source-gated independent competitive rollover are implemented. See M4_DRAFT_FINANCE_TRADE_REPORT.md.

Retain players/assets across independent sport offseasons within capacity. Official sport-specific rookie evidence required; no inference from age, draft year or missing statistics. Eligible unrostered rookies only; pre-draft acquisition block. Default four rounds configurable, linear order (worst team picks first each round), before sport season. Rookie order is exclusively reverse finalized sport standings, after applicable H2H playoffs/consolation or finalized cumulative standings and approved competition tiebreakers. The same original franchise order applies every round; transferred ownership changes the recipient, not the slot. No lottery, probabilities, random rookie order or ordinary custom order is allowed. Preserve historical lottery audit records; administrative corrections require evidence and an audit. Temporary rookie-draft overflow permitted, correct before season. Undrafted eligible rookies become free agents or salary auction candidates. Salary leagues auction rookies with no fixed rookie salary scale and have no future rookie picks.

## 13. Future picks

Traditional dynasty: rolling three future seasons of pick inventory per sport, generated idempotently at rollover; default four rounds. Record league, sport, season, round, original and current franchise, selection, state and append-only ownership history. Trade before/during draft and year-round subject to ownership and execution constraints. Redraft and salary dynasty cannot create, display or trade future picks, enforced in service and database. Preserve any historical assets without activating them.

## 14. Redraft keepers

Disabled by default; optional snake-only keepers, default one per sport configurable. No auction keepers. Drafted player cost previous round minus one, floor round 1; undrafted waiver acquisition costs round 10 or the last available round when the draft is shorter. Maximum three years including original draft/acquisition year. Escalation each retained year. Traded players retain cost and history; dropping/reacquiring does not erase history. Resolve conflicting costs using next earlier available round; reject if none. Persist selection, cost, retention and ownership history. Release nonkeepers at independent redraft rollover.

## 15. Salary cap accounts

Salary dynasty initial acquisition auction-only. Default $400 per sport or optional universal $500. Integer fantasy currency. Persistent salary assignment/history; full salary follows traded player, no retention. Injured players count at full salary. Effective cap = base plus net eligible current-season transfers; available = effective cap minus active payroll, dead cap and reservations. Annual fixed $2 per retained player at respective sport rollover, exactly once. Universal cap cycle resets at championship boundary; overlapping obligations must remain attributable. No FAAB conversion. Contracts, extensions, tags, restricted free agency and automatic expiry remain inactive; future contract duration discussion is not activation authority.

## 16. Vickrey acquisition

Salary leagues only. Sealed 24-hour nomination; nominator automatically bids minimum $1 or applicable released-player floor. Reserve maximum bid; enforce cap compliance. Sole bidder pays minimum; multiple bids pay max(floor, min(highest bid, second highest + $1)). Example $19 vs $7 settles $8. Equal bids: lower sport standings priority; before standings, recorded random order. Atomic settlement, release losing reservations, persist bid/settlement provenance. No early disclosure of competing bids.

## 17. Dead cap and corrective actions

Release penalty = ceil(50% of salary); remainder recovered immediately. Example $27 salary yields $14 dead cap and $13 recovered. Penalty remains until another manager acquires player or applicable rollover. The released-player acquisition floor persists until lowered by a subsequent cut and is removed when the player is a free agent during the applicable offseason. Minimum reacquisition bid equals the applicable penalty floor. Releasing manager cannot reacquire for seven days. For an otherwise eligible self-reacquisition, existing player-specific dead cap is credited toward the acquisition; settlement must still avoid double counting. If reacquired at $14 then released at the same or lower salary, the new penalty replaces the old penalty rather than stacking; each franchise-specific obligation is recalculated from that franchise's release salary without stacking prior obligations. The player-specific acquisition floor is separate: new floor = min(existing floor, newly calculated release penalty), so it can never rise. Atomic clearing/replacement of obligations and new salary; no double counting. $1 release yields $1 penalty. Over-cap franchises must cut players until compliance is restored; they cannot make ordinary acquisitions, draft picks, lineup changes or outgoing proposals. Permit corrective releases, incoming cap and explicitly classified payroll-reducing trades consistent with roster rules. Validate corrective classification and resulting compliance or permitted improvement.

## 18. Cap transfers

Sport-cap transfers are same sport and current season only. Universal-cap leagues may transfer universal current-cycle cap between franchises. Both conserve total cap; future cap transfers and cross-scope conversion are forbidden. Transfers, reservations, settlement and expiry are recorded in the financial ledger and expire only at their applicable sport rollover or championship-cycle boundary without disturbing overlapping obligations. Standalone universal cap transfers remain available throughout the applicable current championship cycle. Mixed-asset trades must also satisfy every player and sport-specific asset deadline.

## 19. Advanced trades

Two or more teams within same fantasy league; no arbitrary two-team maximum. Assets: cross-sport players, eligible dynasty future picks, FAAB, same-sport eligible cap space. Unequal player counts allowed with explicit required cuts. All participants accept identical immutable proposal revision; material changes invalidate all acceptances. Cancellation before acceptance; default 24-hour review configurable, starts at final acceptance; commissioner veto; automatic worker execution if valid. Pending offers expire when any asset deadline or eligibility fails; review cannot cross deadline. Assets may appear in multiple offers; successful execution invalidates conflicts. Atomic execution validates ownership, capacity, position/IR, locks, financial reservations, dead cap, compliance and deadlines; no partial transfer. Deterministic lock ordering and idempotent worker execution. Ineligible teams cannot initiate ordinary outgoing proposals; incoming compliant proposals and explicitly approved corrective exceptions only.

## 20. Trade deadlines

H2H player deadline 14 calendar days before fantasy sport playoff start; cumulative 14 days before sport scoring end. FAAB follows respective sport player deadline; cap transfers same sport deadline. Future picks year-round. Each asset independently validated at proposal and execution. Dynasty offseason trades allowed; redraft offseason trades prohibited. Missing authoritative deadline stays pending; do not guess.

## 21. Independent lifecycle

Sport rollover independent of other sports and overall cycle. Redraft releases nonkeepers; dynasty retains players/assets; retired players remain until released, never infer retirement from missing statistics. No offseason IR. Reset applicable budgets, generate future picks, apply salary increases, expire applicable obligations exactly once; never reset another sport or overlapping cycle. Finalize sport and overall championships only with required evidence. Preserve history and current pointers. Future settings versioned for next applicable cycle, no retroactive changes to finalized outcomes.

## 22. Commissioner administration

Append-only audit actor, previous/new values, effective instant, reason. Commissioner roster and score corrections, draft pause/resume/undo/correct, future settings, abandoned team ownership transfer, visible activity log. No midseason expansion; team removal offseason only. Preserve ownership and historical results. Expose only supported controls; unavailable actions explain why. Removal archives future participation and preserves historical franchise identity; outstanding assets and financial obligations must be resolved. Score adjustments preserve source ledgers and lineup snapshots through compensating audit entries. Reversible draft correction preserves the original selection snapshot and records replacement labels independently; locked/downstream selections and consumed or settled assets cannot be silently unwound.

## 23. Data and decision gates

| Dependency | Required safe behavior |
|---|---|
| Official rookie evidence | PENDING_DATA; no inferred rookie eligibility |
| Official availability | Only verified IR evidence |
| Retirement | Retain player; no inference |
| Schedule boundaries and future starts | Pending where unverified; accepted V5 unchanged |
| Official correction publication | Provisional outcomes |
| Verified game completion | Pending game-based hold; release hold works |
| Schedule normalization | Inactive extension only |
| Rookie order | Reverse finalized sport standings only; lottery and ordinary custom ordering revoked |
| Contracts | Inactive |
| Corrective trade classification | Explicit classification; ordinary gate remains |
| Universal cap transfers | Standalone current-cycle transfers remain available throughout that cycle; no future-cycle transfers |

Use labeled synthetic fixtures only in isolated tests. Missing production evidence is not a reason to stop implementation of mechanisms. Do not fabricate production data.

## 24. Engineering and delivery

Use existing implementation plan service boundaries: professional schedule, season eligibility, championship cycles, competition, finalization, currency ledger, draft assets and lifecycle. Add indexed compound uniqueness, serializable transactions and advisory locks where appropriate. Historical analytics separate from live gameplay. UI should expose pending states, transaction history, clear validation, accessible controls and persistent draft queue. Maintain draft timer, queue-first autopick, pause remainder, player pool as primary view, separate board/results, and cross-sport roster identity.

The recovered 17-migration baseline was upgraded to 22 with explicit approval after backup and populated-copy validation. Remediation verification now passes 147 unit, 43 PostgreSQL and 11 standard Chromium tests. Verify actual state before changing. Stop development workers during integrity checks. Fresh authorized disposable schemas only for automated tests. Never reset/reseed/truncate/reimport development. Compare exact counts and fingerprints before/after; validate append-only triggers. Future development migrations and substantial backfills require separate approval. The user separately approved classifying 3,388 provenance-confirmed fixture players as synthetic; no other backfill is implied. Preserve V5 fingerprints and V9 weights. Standing AGENTS.md authorization permits automatic verified commits and pushes without force-pushing.

### Final draft and website requirements

Creation uses season offsets 0/1. Overview is responsive and horizontally organized, with secure invitation creation/copy and shared draft schedules. Draft is permanent navigation; Players redirects to comprehensive Waivers browsing with shared canonical statistics. Initial draft configuration persists sport/universal coverage, snake/auction restrictions, UTC schedule, timezone, timer and audited random/custom order. The room opens exactly one hour before start for queues and preparation only; server workers activate the draft atomically at its saved start. Start Now is restricted to development/authorized tests. Selection labels, actual winner ownership, original rookie slots and auction prices are immutable for new selections. Preserve older provenance without manufacturing missing historical labels.

## 25. Reconstructed acceptance matrix

Each semicolon-separated scenario is an independent verification target; expand into positive, negative, boundary and concurrency tests as appropriate. This matrix is not the original 185-scenario list.

| Area | Required scenarios |
|---|---|
| Scheduling | Draft before/after season start; missing boundary pending; overlapping cycles; unique game attribution; historical replay labeled; unmatched NBA preserved; future placeholders cannot lock |
| Competition | Independent sport WLT; no inactive-period match; cumulative starter-only totals; NFL week 18 exclusion/inclusion; balanced schedules; no normalization; fixed six-team bracket; byes; third place; consolation; odd-size configuration; persistent progression |
| Awards | Final placement base; qualification bonus; mutually exclusive podium bonuses; PF tie split; negative awards; 12-team extrema; exact rational arithmetic; all four tiebreaker chains; random draw retry; overall cycle aggregation |
| Corrections | Provisional revision; verified 24-hour window; missing publication pending; post-final stat correction without automatic advancement change; audited commissioner correction |
| Rosters | Four default slot sets; shared capacity; legal cross-sport bench move; invalid position; two-way swap; game-start boundary; immutable snapshot; bench/IR excluded; MLB eligibility thresholds; verified IR; lost eligibility; offseason IR rejection |
| Waivers | Reverse snake priority; auction random priority; winner moves bottom; release hold boundary; completion hold pending; zero bid; equal FAAB bid; sealed bids; concurrent reservations; losing reservation release; sport reset; universal cycle reset; no carryover; offseason restrictions; playoff claims |
| Dynasty | Verified rookie accepted; unknown rookie pending; pre-draft acquisition blocked; linear reverse finalized order; rejected lottery/custom order; four rounds; temporary overflow; undrafted acquisition; three-season picks; rollover retry; traded ownership history; redraft pick rejection |
| Keepers | Disabled default; one per sport; snake only; round escalation; round-one floor; round-ten waiver cost; short draft rejection; three-year limit; traded history; drop/reacquire history; conflict earlier round; impossible conflict rejection |
| Salary | Sport/universal cap; integer balances; auction-only acquisition; salary follows trade; injured full salary; $2 rollover once; reservations; over-cap restrictions; corrective release; corrective trade gate; no contract expiry |
| Vickrey | 24-hour boundary; nominator minimum; sole bidder; $19/$7 settlement; tied bid priority; pre-standings draw; concurrent cap reservation; sealed visibility; losing reservation release; floor enforcement |
| Dead cap | $27→$14 penalty; $1 rounding; seven-day cooldown; other-manager acquisition clears; self-reacquisition replacement; repeated release; rollover expiry; no double counting |
| Cap transfer | Same-sport conservation; cross-sport rejection; future transfer rejection; deadline rejection; expiry; universal attribution gate |
| Trades | Two-team and multi-team; cross-sport players; picks; FAAB; cap; required cuts; all accept same revision; revision invalidates; cancellation; 24-hour review; veto; worker retry; deadline crossing; conflicting offers; concurrent ownership; rollback on invalid asset; offseason restrictions |
| Lifecycle | Independent redraft release; keeper retention; dynasty retention; retired player remains; budget reset; pick generation; salary increase; obligation expiry; overlapping cycles unaffected; idempotent rollover; future settings; ownership transfer; offseason removal; midseason expansion rejection |
| Security and UI | Member-only access; commissioner authorization; draft duplicate prevention; timer pause/resume; queue reorder and autopick; persistent roster changes; accessible navigation; mobile layout; visible pending reasons; audit history; no secret leakage |
| Integrity | Fresh isolated schema; repeated/shuffled integration tests; migration validation; exact development fingerprints; append-only triggers; V5 hashes; V9 weights; TypeScript; ESLint; Prisma; production build; npm audits; worker smoke; Chromium screenshots |

## 26. Completion protocol

Continue through unblocked M4.3–M4.7 and remaining M4.2, then M4.8. Update `M4_MASTER_CHECKLIST.md`, `M4_UNRESOLVED_RULES.md`, `PROJECT_STATUS.md` and `M4_COMPLETION_REPORT.md`. Mark checked only when implemented and verified. Record local commits, tests, pending migrations, data/decision gates, development integrity and manual acceptance instructions. Read relevant modules only, inspect datasets programmatically, keep reports concise. Do not equate passing tests with full specification coverage. Stop only for genuine unresolved decisions preventing correct work; continue unrelated tasks.
