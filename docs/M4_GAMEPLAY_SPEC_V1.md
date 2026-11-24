# Fantasy Evolution M4 gameplay specification v1

Status: architecture baseline for M4. Confirmed behavior is implementable; unresolved behavior is referenced to `M4_UNRESOLVED_RULES.md` and must remain inactive.

## Invariants

- V9 is the active immutable experimental scoring baseline. V10 stays inactive and the 0.5% balance target is unverified.
- A player, game, draft pick, financial balance, or competitive result has one canonical identity. Corrections append history; they do not rewrite raw source records.
- Ownership and financial mutations are serializable and auditable. An accepted multi-asset transaction succeeds entirely or not at all.
- Automated tests use the authorized disposable test database. Development records are not fixtures.
- Missing schedules, eligibility, availability, salaries, retirement state, or rookie status remain unknown. Unknown never means zero or eligible.
- All stored deadlines are UTC instants. User-facing rendering uses an explicit league/user timezone when one exists and otherwise labels the displayed timezone.

## League formats

### Redraft

Sport rosters reset independently when that sport rolls to its next assigned season. Future-pick assets are prohibited. Optional keeper extension points remain inactive until keeper costs, limits, and duration are confirmed.

### Traditional dynasty

Players persist through the offseason subject to capacity. Each sport has an independently scheduled four-round rookie draft. Three future seasons of four-round pick assets are generated idempotently. A player is rookie-draft eligible only from verified, sport-specific evidence.

### Salary-cap dynasty

Player persistence and future picks follow traditional dynasty rules. Salary is exact integer fantasy currency. Player salary travels entirely with a traded player. FAAB and salary are separate ledgers. Dead-cap and non-auction salary assignment remain extension points until their rules are confirmed.

## Professional schedules and cycles

- A professional season is eligible only when the league can finish the applicable draft before the first authoritative regular-season start.
- If a current professional season has already started, the next season with authoritative boundaries is selected. If that boundary is unavailable, selection is `PENDING_DATA`; no date is inferred.
- Each sport season belongs to exactly one league championship cycle. The next sport season may begin while another sport finishes the preceding cycle.
- Each professional game can contribute at most once to the same league through a unique game/cycle assignment.
- Redraft reset, dynasty rookie draft, transaction deadlines, and roster lifecycle are sport-season operations rather than whole-league operations.
- A schedule preview reports selected sport, eligible season, first/last scoring instants, draft deadline, trade deadline, playoff window, cycle, rollover expectation, provenance, and warnings. Unknown fields render as unavailable.

## Rosters

Nine-starter defaults are NFL `QB RB RB WR WR WR TE FLEX SUPERFLEX`; MLB `SP SP 1B 3B MI OF OF UTIL UTIL`; NBA `PG SG G SF PF F C C UTIL`; NHL `F F F F D D G UTIL UTIL`.

Each sport defaults to five sport bench places. Five universal bench and five universal IR places are specified for M4 but require a shared-roster model before activation. Existing league-specific overrides remain authoritative. Individual games lock lineup changes. Existing position rules, MLB dated eligibility, and bidirectional swap validation remain in force. Offseason status alone does not qualify a player for IR.

## Competition

- Cumulative competition sums eligible starters through the assigned cycle, has no fantasy playoff stage, and does not reset scoring.
- H2H competition uses weekly periods and skips periods with no active assigned sport.
- Combined UBP sums eligible starters across active sports.
- Individual-sport victories evaluate only active sports. The unresolved overall tie rule prevents activation of this mode until confirmed.
- Schedule normalization is an inactive strategy extension point.
- Official corrections may revise provisional player, team, matchup, and standings values during a 24-hour window. Once a competitive result is finalized, underlying statistics continue to correct but playoff advancement and championships do not change automatically.

## Waivers and free agency

Rolling and FAAB claims use a one-day hold after play/release. Vickrey uses a 24-hour bidding window. Pending bids reserve spendable FAAB. Per-sport budgets reset with the applicable sport season. Universal FAAB rollover remains inactive until its boundary is specified. Every adjustment is represented in a currency ledger; FAAB is never salary.

## Dynasty picks

Eligible dynasty formats own four rounds for each sport across a rolling three-season future horizon. Assets record league, sport, season, round, original/current franchise, final selection, state, and ownership history. Redraft cannot create or trade them.

## Salary accounting

The default base cap is 400 integer fantasy currency units per sport and franchise. Effective cap equals base cap plus net current-season budget transfers. Available space equals effective cap minus active payroll, applicable dead cap, and reservations. Annual fixed-dollar increases are configured without an assumed default and execute once per sport-season rollover. An over-cap team may perform only confirmed corrective operations; the exact exception set remains unresolved and therefore is not activated.

## Trades and deadlines

One league-level trade may contain players across sports and later eligible picks, FAAB, or salary budget. Each asset independently passes ownership, eligibility, deadline, reservation, capacity, and compliance checks at proposal and execution. Player deadlines are 14 calendar days before the sport playoff start for H2H or scoring end for cumulative competition. Missing authoritative dates make the player asset unavailable for trading rather than inventing a deadline. Default review is 24 hours and configurable. Pending proposals expire when any included asset becomes ineligible.

## Commissioner configuration and audit

Commissioner changes are append-only audited with actor, previous/new values, effective instant, and reason. A setting cannot retroactively mutate finalized competition or an executed asset. Interfaces expose only rules that have a confirmed server implementation.
