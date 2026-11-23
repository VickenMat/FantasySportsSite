# Position data audit v0.6

Processed all four user-supplied player-game CSVs into `PLAYER_SEASON_POSITION_INDEX.csv.gz` (53,769 athlete-season entries). Rebuild with `python build_position_index.py` from the extracted directory with the four original CSVs in its parent folder.

## Reliability and limitations
- NFL: observed `position` is present. Preserve raw values, including defense and special teams, even if those are not eligible for default fantasy starting slots. Multiple observed positions are retained for each player-season.
- NHL: observed `position` is present (C/L/R/D/G). Map C/L/R to F; goalie is eligible for NHL UTIL, per user. This can permit multiple goalies and needs lineup calibration.
- MLB: `category` provides batting/pitching role, but does not provide field position. Pitcher `gamesStarted` and pitching appearances support *candidates* for SP and RP, not authoritative position eligibility. A player with both batting and pitching rows retains both roles and one athlete ID. All hitter field positions are explicitly unresolved.
- NBA: box scores have no position field. Positions are unresolved, not guessed from rebounds, height, points, or names.
- The index is a clean, conservative enrichment, NOT a complete verified eligibility dataset. Unknown values must not be treated as ineligible or replaced with guesses.
- To complete MLB and NBA, obtain licensed or permissioned season-specific player-position/roster data with athlete IDs; join by provider ID where possible. Manual exception mapping needs audit provenance and effective dates.

## Fields
`observed_positions` = positions directly observed in uploaded game logs; `scoring_roles` = roles evidenced by rows; `eligible_slots` = directly supported fantasy slots or explicit unresolved/candidate tokens; `confidence` and `source` = provenance; `game_count` counts unique source game IDs.

## Production data model
Use `athlete_id` distinct from `athlete_position_eligibility` and `athlete_scoring_role`; season-specific, date-effective eligibility rules; never merge two-way athletes into separate roster identities.
