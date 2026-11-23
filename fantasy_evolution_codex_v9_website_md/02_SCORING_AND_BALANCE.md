# Universal Balanced Points (UBP): experimental coefficients and optimization

## Current experimental coefficients
The following are **candidate**, not production-validated. All published coefficients have one decimal place; displayed fantasy scores have one decimal place.

### NFL V5 experimental, default single QB
| Action | Points |
|---|---:|
| Passing yard | +0.1 |
| Passing TD | +16.0 |
| Interception thrown | -8.0 |
| Passing 2-point conversion | +6.0 |
| Rushing yard | +0.6 |
| Rushing TD | +36.0 |
| Rushing 2-point conversion | +10.3 |
| Receiving yard | +0.6 |
| Receiving TD | +36.0 |
| Receiving 2-point conversion | +10.3 |
| Reception | +3.2 |
| Tight end reception bonus | +0.7 |
| Rushing first down | +0.3 |
| Receiving first down | +0.3 |
| Passing first down | 0.0 (excluded) |
| Fumble lost, once per fumble | -10.3 |

TE bonus is applied only to TE-eligible real players under the agreed position rule, independent of fantasy lineup slot. Do not double-count aggregate and subtype fumbles.

### MLB hitters (V4)
| Action | Points |
|---|---:|
| At-bat | -1.2 |
| Hit | +7.0 |
| Double bonus | +3.6 |
| Triple bonus | +7.1 |
| Home run bonus | +11.8 |
| Walk | +3.7 |
| Hit by pitch | +3.7 |
| Stolen base | +2.4 |
| Caught stealing | -3.5 |

A double earns hit points PLUS double bonus. A home run earns hit points PLUS home-run bonus.

### MLB pitchers (V4)
| Action | Points |
|---|---:|
| Inning pitched (3 outs) | +9.3 |
| Strikeout | +2.5 |
| Hit allowed | -3.2 |
| Walk allowed | -3.7 |
| Hit batter | -3.7 |
| Home run allowed | -15.4 |
| Save | +6.2 |
| Hold | +5.0 |
| Blown save | -6.2 |

Convert innings from recorded outs, not floating decimal baseball notation.

### NBA (V4)
| Action | Points |
|---|---:|
| Point | +0.5 |
| Rebound | +0.6 |
| Offensive rebound bonus | +0.2 |
| Assist | +0.7 |
| Steal | +1.5 |
| Block | +1.3 |
| Turnover | -0.5 |
| Field goal made | +0.9 |
| Field goal attempted | -0.5 |
| Free throw made | +0.5 |
| Free throw attempted | -0.5 |
| Three-point field goal made bonus | +0.5 |

### NHL (V4)
| Action | Points |
|---|---:|
| Goal | +12.4 |
| Assist | +6.2 |
| Shot on goal | +0.7 |
| Blocked shot | +3.2 |
| Hit | +0.7 |
| Shorthanded point bonus | +6.2 |
| Faceoff win | +0.2 |
| Goalie win | +25.0 |
| Save | +1.2 |
| Goal against | -6.2 |
| Shutout bonus | +18.7 |

Historical source lacks NHL shorthanded points and faceoff wins. Mark those metrics missing, not observed zero.

## Optimization objective
Primary: for 12-team standard leagues, `(max(sport_median_points)-min(sport_median_points))/mean(sport_median_points) <= 0.005` on sealed holdout years and multiple seeds. This is an **acceptance target**, not an achieved fact. Also constrain QB contribution, starter utilization, player scarcity, reasonable coefficients and robustness at 4/8/16 teams and alternative 10/12 starter formats. Do not hide per-sport post-processing multipliers.

Search integer-tenth coefficients and slot configurations with bounded, meaningful per-action ranges. Re-run drafts, waivers and pregame lineup decisions after changes to scoring, because scoring changes alter draft order and roster choices. Optimize training years only; freeze rules before holdout. If the target cannot be achieved robustly, report the minimum spread and the tradeoffs instead of claiming success.
