# Unresolved decisions (v0.5)

## Scoring and data (blockers)
- Full MLB/NBA player position eligibility and MLB pitching / NHL special-teams data acquisition; game-log quality checks.
- UBP candidate stat categories, calibration target (9-starter lineup distribution), allowable variance, and positional weighting constraints.
- Two-way athlete lock timing when pitcher and hitter appearances differ; role switch and single-player one-slot validation.
- Eligibility for UTIL across MLB pitchers/hitters and NHL goalies/skaters; how multiple game appearances on one day affect lineup locks.

## Core fantasy engine (blockers)
- Postgame unlock and postponement/suspension/cancellation behavior; official scheduled start changes.
- Whether locked starters can be traded with transaction effective next game; current rule prohibits trades while locked.
- Waiver processing timing, priority, FAAB tiebreaks, bid limits, pending claims, Vickrey cap mechanics.
- Open Universe positional caps and per-sport minimums; lineup capacity and sport-offseason handling.
- Single-sport NFL IR slot count; MLB IL status mapping and grace periods.
- Multi-sport scoring option Categories vs cumulative-only matchup rule: define category aggregation or restrict categories until supported.
- Redraft rollover date, dynasty rollover, rookie drafts, keeper rules, trade deadlines and veto governance.
- League creation timing relative to the earliest selected sport's season and initial draft.

## Product and infrastructure
- Sports-data licensing and provenance, ingestion schedules, missing-game reconciliation, stat correction window.
- ADP cohort definitions, auction values, ownership, trade-value models, minimum sample sizes.
- Account roles, commissioner permissions, moderation, audit retention, privacy and security.
- UI flows, accessibility, mobile app roadmap, deployment and reliability targets.

## v0.6 targeted questions
1. Does 'played yesterday' mean the previous calendar day in the league's timezone, or a rolling 24-hour period after game start/end? Do consecutive games extend waivers?
2. For FAAB, when do bids resolve, and can managers submit free pickup claims during the waiver window?
3. For NHL UTIL, should goalies be unrestricted, or should an active goalie maximum apply? Current rule says unrestricted.
4. What official historical MLB/NBA position eligibility provider will be used, and how are changes during a season applied?
5. When does a game-locked athlete unlock, especially in postponements and doubleheaders?

## v0.7 still unresolved
- FAAB equal-bid tiebreakers, funds reservation, bid cancellation, minimum bid and waiver processing at simultaneous deadlines.
- Rolling waiver claim priority while restricted.
- Verified historical MLB/NBA positions and missing statistics.
- Exact sport-season eligibility changes and late stat corrections.
