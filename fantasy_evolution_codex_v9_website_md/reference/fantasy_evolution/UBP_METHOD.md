# Universal Balanced Points: exploratory calibration v0.5

## Status
**Exploratory only. NOT APPROVED for production league scoring.** Uploaded 2016–2026/27 game logs were inspected. The current run is a sport-level proxy, **not** a legal nine-starter lineup calibration. Do not copy these weights into production scoring defaults.

## Inputs
- NFL 2016–2025 (2026 incomplete excluded); half-PPR skill positions QB/RB/WR/TE only.
- MLB 2016–2025, excluding shortened 2020 season; batting and pitching rows.
- NBA 2016–17 to 2025–26, excluding shortened/disrupted 2019–20 and 2020–21.
- NHL 2016–17 to 2025–26, excluding 2019–20 and 2020–21; 2026–27 incomplete excluded.

The exclusion policy is a **methodological choice**, not a finding that the excluded seasons are invalid. Revisit it during validation. For NBA and NHL, 2025–26 is included because the uploaded files contain a complete-looking season; verify provider coverage.

## Calculation performed
For each player-game row, apply the uploaded single-sport point formula (with explicitly documented omissions below). Sum player-game scores by player and season. Rank all athletes by season total, regardless of position. Take mean of top 108 per sport-season, then median of these means across eligible seasons. Use NFL as arbitrary reference scale and set multiplier_s = median_NFL / median_s. The reference scale is arbitrary; relative ratios are what matter. `UBP_PROVISIONAL_WEIGHTS.json` shows existing point weights times these factors.

## Observed exploratory results
- NFL: median top-108 player total 210.514, multiplier 1.000000
- MLB: median top-108 player total 418.037, multiplier 0.503578
- NBA: median top-108 player total 2339.347, multiplier 0.089988
- NHL: median top-108 player total 194.490, multiplier 1.082390

## Critical gaps
1. **MLB player position eligibility missing** (1B, 3B, MI, OF, SP, RP, UTIL); cannot form legal lineups. `category` identifies batting vs pitching but not SP/RP or hitter field position.
2. **NBA position eligibility missing** (PG, SG, G, SF, PF, F, C, UTIL); cannot form legal lineups.
3. MLB pitching `hits_allowed` and `walks_allowed` missing; cannot reproduce the uploaded full pitching scoring preset. Current pitching proxy omits these penalties. Verify `outs` is pitching outs, and check duplicate player-game/category records before using in production.
4. NHL `powerPlayPoints`, `shortHandedPoints`, `overtimeLosses` missing. Current proxy omits these; shutouts are approximated from goalie wins with zero goals against and positive saves.
5. A true lineup simulation must respect dual-role players, role-specific scoring, daily game locks, and actual games missed. All players in the eligible pool must remain available for drafts, not just top-108.
6. Per-sport **position-specific** replacement value and league-size sensitivity must be checked for 4–16 teams and for 9/10/12 starter formats.
7. Real calendar and overlapping seasons need explicit league-year alignment; do not treat these medians as concurrent actual fantasy-season totals.

## Next scoring calculation (required before launch)
1. Import complete position-eligibility history for MLB and NBA, plus pitching and NHL missing statistics or formally define new UBP stats that avoid them.
2. Define initial candidate scoring categories and weights. Keep raw event data independent of weights.
3. For each season and league size (4, 8, 12, 16), construct 9-player legal lineups per franchise using eligibility and no duplicated athlete identity. Include two-way players as one roster entity with selected scoring role.
4. Compare total starting-lineup fantasy points by sport for competitive, median, and replacement-level teams. Optimize sport-specific weights under sensible stat-level constraints. Do not flatten natural position hierarchy.
5. Evaluate out-of-sample seasons and bootstrap uncertainty; set objective tolerance (proposal ±5% for representative lineup output) only after examining results.
6. Publish immutable scoring version and lock it for each league. Store input dataset fingerprints, code version, and calibration reports.

## Reproduction
Run `python calibrate_ubp.py /mnt/data` with pandas and numpy. This script expects the original four uploaded CSV filenames at the supplied directory and writes exploratory results. Large raw CSV files are **not** bundled into the ZIP.
