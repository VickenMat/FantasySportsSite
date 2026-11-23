# UBP V2 scoring candidate, 2026-11-23

Status: **experimental; not approved for production**.

The candidate uses one-decimal coefficients. NFL weights largely retain V0.9, with a TE reception premium of +0.5 (3.0 total reception points for TE). NBA steal is 1.6 versus block 1.4; FT made/attempted and 3PT made are scored. The MLB model adopts the user's first table, scaled uniformly by 1.2 and rounded to one decimal, preserving the relative incentives. The alternative SABR/FIP model is **not** the active default.

Baseball hitting H + 2B/3B/HR bonuses stack. Pitching H/BB/HR are *allowed* events and are scored separately from batter H/BB/HR. IP is computed from outs / 3, never from decimal notation as a decimal fraction.

V2 quick diagnostic: sum actual historical player-game stats to player-season totals; select top 108 player-seasons by points (unconstrained), divide by 12; take median over all supplied seasons. This diagnostic is NOT a legal lineup simulation, does not handle schedule/bench/roster limits, does not exclude shortened/partial years, and does not balance the sports by itself. The top-108 diagnostic is only a smoke test of rough scale.

Before final calibration: construct nine-position legal rosters by season, exclude shortened/partial seasons or normalize properly, avoid duplicate two-way athlete assignment, model daily game locks and actual player availability, optimize weights against median lineup totals and seasonal variability, validate 4-16 teams and 10/12 starters. Preserve within-sport position hierarchy. Some source data may contain duplicated player games and should be audited. The 2026-27 NBA/NHL seasons are incomplete as of this version.

Data mapping and code are in `build_ubp_v2_diagnostic.py`; the input CSVs are user supplied and not included in this ZIP.
