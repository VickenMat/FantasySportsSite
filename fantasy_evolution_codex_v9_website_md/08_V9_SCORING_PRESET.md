# UBP V9 provisional scoring preset

**Status: experimental, not proven 0.5%-balanced.** NFL uses V5 single-QB-friendly weights, other sports V4. No sport-wide postgame multipliers. Every value is per listed action and additive unless stated.

## NFL

| Stat key | Points |
|---|---:|
| `passing_yards` | +0.1 |
| `passing_tds` | +16.0 |
| `passing_interceptions` | -8.0 |
| `passing_2pt_conversions` | +6.0 |
| `rushing_yards` | +0.6 |
| `rushing_tds` | +36.0 |
| `rushing_2pt_conversions` | +10.3 |
| `receiving_yards` | +0.6 |
| `receiving_tds` | +36.0 |
| `receiving_2pt_conversions` | +10.3 |
| `receptions` | +3.2 |
| `rushing_first_downs` | +0.3 |
| `receiving_first_downs` | +0.3 |
| `fumbles_lost_total` | -10.3 |
| `tight_end_reception_bonus` | +0.7 |

## MLB

| Stat key | Points |
|---|---:|
| `atBats` | -1.2 |
| `hits` | +7.0 |
| `doubles` | +3.6 |
| `triples` | +7.1 |
| `homeRuns` | +11.8 |
| `baseOnBalls` | +3.7 |
| `hitByPitch` | +3.7 |
| `stolenBases` | +2.4 |
| `caughtStealing` | -3.5 |
| `pitching_innings` | +9.3 |
| `pitching_strikeOuts` | +2.5 |
| `pitching_hits` | -3.2 |
| `pitching_baseOnBalls` | -3.7 |
| `pitching_hitBatsmen` | -3.7 |
| `pitching_homeRuns` | -15.4 |
| `saves` | +6.2 |
| `holds` | +5.0 |
| `blownSaves` | -6.2 |

## NBA

| Stat key | Points |
|---|---:|
| `PTS` | +0.5 |
| `REB` | +0.6 |
| `AST` | +0.7 |
| `STL` | +1.5 |
| `BLK` | +1.3 |
| `TOV` | -0.5 |
| `FGM` | +0.9 |
| `FGA` | -0.5 |
| `FTM` | +0.5 |
| `FTA` | -0.5 |
| `FG3M` | +0.5 |
| `OREB` | +0.2 |

## NHL

| Stat key | Points |
|---|---:|
| `goals` | +12.4 |
| `assists` | +6.2 |
| `sog` | +0.7 |
| `blockedShots` | +3.2 |
| `hits` | +0.7 |
| `goalie_win` | +25.0 |
| `saves` | +1.2 |
| `goalsAgainst` | -6.2 |
| `shutout` | +18.7 |
| `faceoff_wins` | +0.2 |
| `shorthanded_points_bonus` | +6.2 |


## Interpretation and data requirements
- NFL passing first downs score **0.0**, and are not present as a scored event. Only rushing and receiving first downs earn +0.3 each. Tight end reception bonus stacks only when player is TE-eligible by the approved rule, not simply occupying a FLEX slot.
- MLB hitting `hits` stacks with extra-base hit bonuses. Pitching `innings` = recorded outs / 3; never interpret 5.2 as 5.2 decimal innings. Pitching hits, walks and HR allowed must come from **pitching** records, not hitting rows. One athlete may not score as both pitcher and batter in one game.
- NBA FGM/FGA and FTM/FTA are additive to points; offensive rebounds stack with all rebounds. Steals (+1.5) > blocks (+1.3).
- NHL `faceoff_wins` and `shorthanded_points_bonus` are **not available in current historical CSV**. Do not silently score missing values as zero in calibration. Goalies and skaters must use position-specific categories; goalie wins only for a confirmed winning decision, shutout only when qualifying.
- All weights configurable and versioned per league. Scores rounded only at presentation or at a documented final precision boundary; do not round intermediate calculations.
