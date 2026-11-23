# V9 evidence: multi-season historical baseline, not final optimized daily UBP

**Source:** existing `UBP_V4_BASELINE.csv` (2016–2025 where complete), `UBP_V4_SLOT_DIAGNOSTICS.csv`. These use an *optimal full-season 108-player selection*, not a draft-and-daily-lineup simulation. NFL source uses V4 SUPERFLEX and weights, not V5 single-QB rules. Do not describe the numbers below as V9 simulated scores.

## Multi-season calibration diagnostic
Using each sport's 2016–2022 median, calculate a single multiplicative factor to align **training medians**. These factors are **analytical only** and are NOT applied to fantasy game scoring. On 2023–2025 holdout seasons the resulting cross-sport spread is **7.01%**, far from the requested 0.5%. Thus multi-season normalization alone fails.

| period   | sport   |   seasons |   baseline_median |   diagnostic_factor |   rescaled_median |
|:---------|:--------|----------:|------------------:|--------------------:|------------------:|
| train    | NFL     |         7 |            9819   |             1.037   |           10182.3 |
| train    | MLB     |         6 |           10550.3 |             0.96512 |           10182.3 |
| train    | NBA     |         5 |           10226.5 |             0.99568 |           10182.3 |
| train    | NHL     |         5 |           10133.4 |             1.00483 |           10182.3 |
| holdout  | NFL     |         3 |            9991.2 |             1.037   |           10360.9 |
| holdout  | MLB     |         3 |           10066.3 |             0.96512 |            9715.2 |
| holdout  | NBA     |         3 |           10468.9 |             0.99568 |           10423.7 |
| holdout  | NHL     |         3 |            9876.9 |             1.00483 |            9924.6 |

## Historical points by starting position (V4 legacy lineup)
These are median **individual starter season points**, pooled over historical selected 12-team position-constrained starter slots, not expected daily fantasy-team totals.

| sport   | slot      |   n |   median |
|:--------|:----------|----:|---------:|
| MLB     | 1B        | 108 |   1118.3 |
| MLB     | 3B        | 108 |   1099.7 |
| MLB     | MI        | 108 |   1104.8 |
| MLB     | OF        | 216 |   1092   |
| MLB     | SP        | 216 |   1237   |
| MLB     | UTIL      | 216 |   1017.8 |
| NBA     | C         | 192 |   1136.4 |
| NBA     | F         |  96 |   1091   |
| NBA     | G         |  96 |   1057.6 |
| NBA     | PF        |  96 |   1071.2 |
| NBA     | PG        |  96 |   1203.6 |
| NBA     | SF        |  96 |   1095   |
| NBA     | SG        |  96 |   1102.6 |
| NBA     | UTIL      |  96 |   1000.8 |
| NFL     | FLEX      | 120 |    860.8 |
| NFL     | QB        | 120 |   1484.2 |
| NFL     | RB        | 240 |    997.8 |
| NFL     | SUPERFLEX | 120 |   1398.3 |
| NFL     | TE        | 120 |    792.2 |
| NFL     | WR        | 360 |    949.8 |
| NHL     | D         | 192 |    982.8 |
| NHL     | F         | 384 |    991.3 |
| NHL     | G         |  96 |   1853   |
| NHL     | UTIL      | 192 |    950.6 |

## Conclusion
No defensible optimized final UBP meeting 0.5% can be reported yet. The latest usable action-by-action candidate is in `08_V9_SCORING_PRESET.md`. The website should ship with this **experimental** preset and configurable starter counts while the corrected simulator performs genuine multi-season optimization.
