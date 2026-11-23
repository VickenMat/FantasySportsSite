# Acceptance criteria and test plan

## Scoring
- Verify every stat coefficient in `02_SCORING_AND_BALANCE.md` with golden single-game examples.
- NFL passing first downs never award points; rushing/receiving first downs each +0.3.
- Tight end premium is +0.7 per reception in experimental V5 and is applied exactly once.
- No double counting fumbles lost or MLB two-way same-game points.
- MLB hits and extra-base-hit bonuses stack as specified; innings pitched uses outs / 3.
- NBA offensive rebound bonus stacks with total rebounds; steal weight exceeds block weight.
- NHL missing faceoff/SH data produces coverage warnings, not fabricated zeros.

## Rosters
- Default NFL has exactly one QB slot and no SUPERFLEX; optional SUPERFLEX leagues can enable it.
- All positions/UTIL/FLEX are eligible only under configured rules.
- MLB position requalification tests at 9/10 starts and 19/20 appearances, with next-season carryover and expiry.
- Distinct athlete IDs, game locks, IR eligibility and draft ownership constraints are enforced.

## Simulation
- Verify no feature timestamp exceeds pregame lock timestamp.
- Verify trade/team change does not erase eligible starts.
- Verify SP/RP/goalie lineup availability uses only pregame information.
- Verify legal lineup matching and calendar-based waiver windows.
- Replay with identical data, seed and version yields identical scores.
- Test 4/8/12/16 teams and 9/10/12 starters plus candidate sport-specific configurations.
- Track all unfilled slots and explain why.

## Fairness
- Target <=0.5% maximum four-sport spread on independently held-out complete seasons across multiple seeds. If not achieved, show measured failures, not an artificial success.
- QB share, pitcher/goalie share, replacement-level distribution, waiver churn, outliers and season stability must be reported.
- Never optimize scoring coefficients using holdout results after declaring them holdouts.
