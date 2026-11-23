# UBP V7: roster-construction diagnostic

## Completed tests
36 backtests, 2023 and 2024, 4 sports. 2023 tests: 12-team 9/10/12 starter, 4/8/16-team 9 starter, 12-team 9 starter seed 23. 2024 tests: 12-team 9 starter seeds 11 and 23.

## Changes
- NFL default 9 starters: QB, RB, RB, WR, WR, WR, TE, FLEX, FLEX. SUPERFLEX is removed from the default and remains an optional format for future work.
- Experimental MLB draft construction caps SP-listed players at three on a 15-player roster for all tested starter configurations. This is a diagnostic constraint, not a production rule. Waiver swaps are restricted to the same SP-versus-non-SP category. MLB is no longer starved of hitter starts.
- All other scoring weights remain V5 NFL / V4 other sports. No cross-sport calibration has been claimed.
- Simulated drafts use previous-season performance only, rolling pregame projections, team fixture availability, and weekly waivers. Source games are scored only after lineups are selected.

## Standard 12-team nine-starter seed 11
| Sport | 2023 | 2024 |
|---|---:|---:|
| NFL | 9196.5 | 9155.9 |
| MLB | 8897.0 | 8126.9 |
| NBA | 13063.5 | 12648.8 |
| NHL | 11004.2 | 10498.2 |

Spread (max-min)/mean: 2023 39.53%; 2024 44.74%. Seed 23: 2023 39.50%; 2024 43.94%. Target <=0.5% NOT achieved.

2023 best among tested 12-team starter-count combinations (9,10,12 per sport): NFL 12, MLB 12, NBA 9, NHL 10; 24.27% spread. This is NOT the best possible combination of arbitrary roster sizes or weight changes.

## Key limitations
- The MLB SP cap is applied to 10- and 12-starter formats as well and is not suited to their RP/SP requirements. Those results are sensitivity diagnostics only.
- Player-team mappings are based on prior season and updated after observed games; trades and first appearances may be incorrectly treated as inactive.
- Historical MLB probable pitchers and NHL confirmed goalies are not available pregame. Fixture presence is not proof of a start.
- NHL faceoff-win and shorthanded-point data are absent. NBA/MLB historical position data are incomplete.
- Rookies absent from prior-season data are not draftable; some can join waiver pool after appearances.
- 2023 is not an independent holdout after this diagnostic design iteration; 2024 was examined as a second diagnostic, not a sealed prospective holdout.
- Simulated drafting is a heuristic with no real ADP or manager behavior and the roster model is not a full production dynasty/FAAB model.
- The 0.5% cross-sport spread should be validated across seasons and seeds with frozen rules, not guaranteed by retrospective per-sport scaling.

## Next steps
1. Improve per-position roster minimum/maximum rules by format; implement accurate SP/RP start probability based solely on prior games, transactions, and pregame information.
2. Test expanded candidate starter combinations beyond 9/10/12, particularly fewer NBA slots.
3. Optimize *individual* scoring actions under sensible coefficient ranges and position share constraints, jointly with roster configurations, on training years.
4. Freeze settings before validation on unseen seasons and draft seeds; report pass/fail for the 0.5% criterion.

Run: `OPENBLAS_NUM_THREADS=1 python run_v7.py`. The script expects the source CSVs and previous V4/V5 weight JSON files at `/mnt/data`.
