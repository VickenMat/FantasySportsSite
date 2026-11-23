# V8 optimization diagnostics: completed November 2026

This analysis uses actual V7 backtest output, **not a new rerun of the daily simulation**. It evaluates the 81 possible combinations of already-tested 9/10/12-starter formats in 2023 (12 teams, seed 11) and post-hoc coefficient scaling diagnostics. These are *not* final production coefficients.

## Best tested starter count combination (2023)
- NFL **12**, MLB **12**, NBA **9**, NHL **10**.
- Points: NFL **10,490.8**, MLB **10,245.9**, NBA **13,063.5**, NHL **12,628.3**.
- Spread `(max-min)/mean` = **24.27%**. Fails the 0.5% target.
- 2024 has no 10/12-starter V7 backtests; therefore this combination has **no valid 2024 holdout result**.

## Nine-starter calibration stress test
2023 medians: NFL 9,196.5, MLB 8,897.0, NBA 13,063.5, NHL 11,004.2.
2024 medians: NFL 9,155.9, MLB 8,126.9, NBA 12,648.8, NHL 10,498.2.

An **illustrative post-hoc** equalization of the four 2023 totals requires sport-wide multipliers: NFL **1.1461**, MLB **1.1847**, NBA **0.8069**, NHL **0.9578**. This fits 2023 at zero spread but produces **8.58%** in 2024. These multipliers are **diagnostics only, forbidden as hidden production equalizers**.

With each sport-level factor bounded to 0.85-1.15, a numerical diagnostic achieves about **8.12%** 2023 spread and **13.64%** in 2024. This is not a search over individual stat coefficients and is not a proof of the global optimum.

## Conclusion
- Removing default SUPERFLEX and improving MLB roster coverage are worthwhile.
- Available starter count changes alone do not meet 0.5%.
- Even perfectly matching one observed year does not generalize to the next.
- Next engineering task is a corrected full daily simulator, followed by joint search over individual weights and slot configurations on training seasons, then frozen evaluation on untouched seasons and seeds.
- Do not claim V8 meets the target.
