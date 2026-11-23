# UBP V0.9: Position-constrained baseline and candidate weights

Status: EXPERIMENTAL. Do not enable as production defaults.

- Target: equal full regular-season totals for nine-starter standard lineups across NFL, MLB, NBA, NHL.
- Historical baseline: maximize total player-season points across 12 sets of nine position-constrained slots, using linear assignment. This is an idealized 12-team starter pool, NOT realistic daily lineup optimization, drafting, bench, substitutions, or waiver streaming.
- Each sport uses the existing scoring preset to establish its baseline. NFL baseline is multiplied by 5 so passing yards are worth 0.2 points, preserving the one-decimal stat-weight constraint. The other sports are scaled toward that NFL target, then stat weights rounded to one decimal.
- NFL QBs are not normalized individually; position hierarchy is preserved.
- MLB Ohtani two-way duplication occurred once (2022). This means that result must be corrected with a unique-athlete constraint before final calibration.
- MLB fielding position eligibility: official listed positions, plus 10 starts or 20 games played at a new position during the season; newly qualified eligibility carries into the next season, then expires unless requalified. Game-level fielding records are still needed to implement this.
- MLB UTIL includes hitters only. NHL UTIL accepts forwards and defensemen, never goalies.
- Shortened pandemic seasons must be separately normalized or excluded from calibration training; the current medians include them.
- Missing source scoring fields: MLB pitching hits and walks allowed, NHL power-play points and shorthanded points.
- The proposed one-decimal weights are a first approximation, not yet verified against lineup results after rounding.
- Next: correct missing positions and duplicate athlete constraint; run per-day legal starting lineups and streaming/bench simulations; test 4-16 team sizes, then 10- and 12-starter templates; train/test split across seasons.
