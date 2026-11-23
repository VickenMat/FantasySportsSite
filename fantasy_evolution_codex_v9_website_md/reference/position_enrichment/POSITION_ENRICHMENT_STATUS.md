# Position enrichment status (V0.8)

The original MLB and NBA game logs have no verified player position field. This package adds empty position columns and an explicit unverified status to every row, and includes one season/player lookup template per sport. MLB batting/pitching stat_role is determined from the original category field, but is NOT fielding eligibility. No positions have been fabricated.

To finish, provide historical position tables keyed by MLB player_id + season and NBA PLAYER_ID + SEASON_YEAR. Fill primary_position and eligible_positions (pipe-delimited e.g. PG|SG or 2B|SS), position_source, and verification_status. Do not equate batting vs pitching appearances with eligible fielding positions. Historical position policy (primary/secondary qualification thresholds) still needs definition.

UBP calibration must not use unverified position rows as legal positional eligibility.
