# UBP V5: Daily lineup simulation and acceptance tests

## Status
The accompanying NFL test recalculates V4's selected season-long player pool using experimental NFL weights. It is **not** a daily lineup simulation. No claim of 0.5% cross-sport balance is supported yet.

## Data available
NFL game logs include season, week, game ID and player ID. MLB, NBA and NHL game logs include game dates and IDs. Position fields exist. Actual historical first-down and other stat coverage must be audited; NHL shorthanded points and faceoff wins are absent, and MLB pitching source fields need verification.

## How to run a valid daily backtest
1. Choose a league year and a 12-team, nine-starter roster per sport. Include bench/IR slots and one shared ownership ledger across all sports.
2. Establish preseason rankings using **only prior-season information**, with a rookie fallback. Draft teams using a seeded snake draft. Run many draft seeds; don't select the best full-season players using hindsight.
3. For each real calendar date, use the actual historical professional game schedule. Select only eligible, owned, healthy, unlocked players before first pitch/tipoff/kickoff/puck drop. For NFL use week-level lineups and kickoff locks. Record a valid lineup even if a player does not play.
4. For daily lineup choices, use a pregame expected-points estimator fitted only to earlier dates. A simple initial estimator is trailing 14/30-game average adjusted for expected starts, workload and opponent. Do not use actual same-day stats to choose starters.
5. Apply the configured MLB official position and 10-start/20-appearance eligibility rules with next-year carryover, using historical fielding data. Enforce one MLB athlete identity even if a two-way player has separate batting and pitching records.
6. Apply league roster constraints, bench, IR, waiver windows, injuries, byes, MLB doubleheaders and postponed games. Track empty slots and replacement-level performance.
7. Score only actual game logs for starters after lock. Treat missing stat columns as unverified rather than zero without disclosure.
8. Sum daily starter points by sport/team/season, including the effect of roster selection and bench decisions. Repeat for 4, 8, 12 and 16 teams and 9, 10 and 12 starters.
9. Calibrate only on training seasons; validate untouched holdout seasons and multiple draft seeds.

## Fairness definition
For sport medians S_s over 12-team nine-starter lineups, use max(S_s)-min(S_s) divided by mean(S_s). Target <=0.005 on held-out seasons. Also report per-year dispersion and seed-to-seed confidence intervals; hitting 0.5% on a training sample is insufficient. One-decimal action weights are mandatory, with no hidden post-score sport multiplier.

## NFL positional constraint
Track (QB + SUPERFLEX) points / total NFL starting-lineup points. Report separately the fraction of SUPERFLEX starts that are QBs, and compare QB, RB, WR and TE points per required slot and replacement value. The current experimental weights are a diagnostic, not approved scoring.

## Outstanding prerequisites
- Verify historical MLB pitching hits/walks/HR allowed and blown saves.
- Obtain NHL shorthanded point and faceoff-win counts.
- Historical MLB fielding starts and appearances to compute rolling eligibility.
- Game availability, injury status, projected starters, and preseason-only rankings or reproducible proxies.
- Full draft/waiver/IR and daily lineup simulation implementation.
