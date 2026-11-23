# UBP V5 daily-simulation prototype

## Executed
`python ubp_v5_daily_sim.py 2023`

Inputs: four user-provided final CSV files. 2022 used for draft rankings; 2023 scored. Seed 11. One draft seed. Tests 4/8/12/16 teams with 9 starters, and 12 teams with 10/12 starters. NFL weekly lineups; MLB/NBA/NHL calendar-date lineups. Rolling last-ten-game average after three appearances; otherwise prior-year average. Weekly waiver substitutions (simplified). One athlete per game-date, one owned roster per sport. Uses V5 experimental NFL and V4 other-sport weights.

## Results and limitations
See V5_DAILY_SIMULATION_RESULTS.csv. This is a functioning *prototype*, not a valid final calibration. No claim of 0.5% spread is made. Primary 2023 12-team nine-starter medians: NFL 8187.8, MLB 3200.3, NBA 10046.2, NHL 8610.6. The primary spread is approximately 91.6% of the four-sport mean. This is NOT interpretable as true UBP imbalance because the simulation is structurally incomplete.

Critical issues:
1. No historical pregame team schedules/expected player starts. Players are assigned to lineups on off-days, especially damaging to MLB. Daily date selections do not account for doubleheaders, lineup locking, or scheduled off-days. NHL goalie expected starts absent.
2. Draft ranks use previous-year scoring only, but the draft has no proper offseason transactions, rookies, injuries, auction values or realistic multi-sport shared ownership. Drafts are sport-separated.
3. Waivers run every seventh *game date* rather than exact seven calendar days, and no sealed bids/rolling 24h waivers. The naive replacement heuristic can reduce roster coverage.
4. Position eligibility is previous-season official field, with no MLB 10-start/20-appearance progression or next-year carryover. NBA/NHL historical positions may change.
5. The NHL source lacks shorthanded points and faceoff wins. MLB pitching data integrity needs verification. MLB two-way daily role currently uses maximum realized role score, which leaks the day's outcome and must be replaced by a pregame role decision.
6. NFL QB share in output is QB points earned in QB and SUPERFLEX slots only, not total QB-produced points across other slots (QB only legal in these two slots). SUPERFLEX percentages measure starts, not distinct players.
7. One holdout season and one seed. No training/holdout calibration, uncertainty bounds, opponent adjustment, real injury feeds, roster locks, IR, or 0.5% generalization validation.
8. Season coverage differs: NFL 2023 regular season, MLB calendar 2023, NBA/NHL 2023-24. This is intended league-year alignment, but season date consistency must be verified.

## Recommended next engineering steps
- Build official game schedule by team and date and a pregame player-availability table; starter projections use only earlier records.
- Use schedule-aware lineup assignment with one player per game, all starts/locks, and expected goalie/pitcher start probability.
- Rebuild unified draft with shared athlete ownership and sport-specific bench rules; implement rolling 24-hour waivers and FAAB.
- Obtain NHL missing stats, MLB fielding starts/appearances, and verify MLB pitcher hits/HR/BB.
- Run 2017-2022 training seasons and 2023-2025 untouched holdouts across 20+ seeds, then optimize one-decimal action weights with positional and QB-share constraints.
- Do not rescale sports based on this prototype's incomplete totals.
