# Additional scoring statistics to consider

NFL: rushing/receiving first downs, 40+ yard play bonuses, fumbles lost, passing completion/attempt efficiency, sacks taken by QB. Keep defense and kicking out of default offensive-only scoring. Tight end premium is reception-based.

MLB: runs, RBI, sacrifice flies, grounded into double play, intentional walks, pitcher quality starts, blown saves, inherited runners scored, complete games. The user's provided default does not score these. Avoid adding overlapping stats without calibration; baseball counting stats can double count intentionally if documented.

NBA: offensive rebounds as a separate bonus (do not score REB twice unless intentional), double-doubles, triple-doubles, personal fouls, technical fouls, 3PT attempted, blocks against, minutes played. Avoid arbitrary double-double bonuses if they overreward a position.

NHL: power-play goals, power-play assists/points, short-handed goals/assists, faceoff wins/losses, takeaways, giveaways, penalty minutes, goalie overtime losses, goalie saves against shots by strength, goalie shutouts. Power-play goals are available in source data, but not all desired special-teams fields are available.

All additions should be optional until historical coverage and nine-starter simulations validate them. Source availability does not automatically make a statistic a good scoring category.
