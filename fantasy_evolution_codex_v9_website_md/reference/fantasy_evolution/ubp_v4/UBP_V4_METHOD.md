# UBP V4, historical position-constrained calibration

Status: CANDIDATE, NOT PRODUCTION APPROVED.

## Confirmed scoring rule changes
- Passing first downs award zero points, including passing first downs by a quarterback.
- Rushing and receiving first downs each award +0.3 UBP. Quarterbacks can earn rushing first downs.
- Tight ends receive an extra +0.5 per reception based on player position, regardless of lineup slot.
- NHL UTIL only accepts forwards and defensemen, never goaltenders.
- All published scoring weights and displayed game scores use one decimal place.

## Method
Source data: the four user-provided historical game-log CSVs with position columns. Game statistics are scored using UBP_V4_CANDIDATE.json. Player-game values are summed by season, then a Hungarian assignment finds the highest-scoring legal lineup pool without reusing a row. MLB two-way player identity duplicates are detected and the lower-valued role excluded before rerunning the assignment. Historical eligibility and data gaps remain. The baseline compares medians of eligible season-optimal 12-team nine-starter pools, not actual franchise results.

Additional tests: 4, 8, 12, 16 teams using nine starters, plus 12-team 10- and 12-starter formats. The format tests are independently optimized with season-long hindsight, not live daily management.

## Outstanding tests and limitations
- DAILY LINEUP SIMULATION NOT COMPLETED. The position-constrained season totals cannot be called a daily streaming, injury, bench, draft, or waiver simulation.
- NBA position missing for 725 player-season records; MLB position missing for 4327 player-role-season records. These figures include nonstarter/low-value players and require targeted audits.
- NHL historical shorthanded points and faceoff wins absent; their point values are provisional and the NHL historical total is understated relative to the complete scoring rules.
- MLB pitching 'hits' and 'walks' fields are not pitching hits/walks allowed in the supplied game logs; the previous code reuses those ambiguous columns, and this must be reconciled with provider schema before production. Do not interpret the pitcher baseline as independently audited.
- NHL shutouts are inferred from goalie zero goals against with saves and can include partial appearances; need verified shutout field.
- Yearly historical medians differ by sport and exclude disrupted seasons, with small and non-identical year samples.
- No tests yet for real draft allocation, injury absences, waiver streaming, daily lineups, or player ownership.
- NFL 2025 data completeness and NHL/NBA 2025-26 season coverage require audit before claims about fully complete seasons.

## Interpretation
V4 improves rule alignment and runs 4/8/12/16 team plus 9/10/12-starter historical pool checks. It does not establish cross-sport parity in actual play. Treat candidate weights as experimental and keep calibration reproducible.
