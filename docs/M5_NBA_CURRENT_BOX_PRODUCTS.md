# Current NBA redistribution box and schedule evidence

A bounded follow-up to the approved SportsDataverse data strategy found useful current-season NBA products without revisiting accepted V5 acquisition. This work made no canonical database change and added no restricted direct API. The publisher's reviewed CC BY 4.0 data grant/attribution requirements remain distinct from software licensing.

| Licensed release | Physical size / SHA-256 | Actual inspected coverage |
| --- | --- | --- |
| `nba_stats_player_boxscores/player_boxscores_2027.csv` | 1,327,106 bytes; `e57f6308f7f4a8184c5ccab14bab1f906f667e80715414fae9c582d147d7f5f1` | 7,518 rows, 270 regular-season games, 534 distinct athletes; stable NBA `game_id`, `person_id`, `team_id`; no duplicate game/player keys |
| `nba_stats_schedules/nba_schedule_2027.csv.gz` | 18,215 bytes; `99feef0864811e04077aee99fdd91ed4a87b60367cc85fd27d9352c5e52d516c` | 1,274 rows: 67 preseason, 1,206 regular-season, one NBA Cup; 337 rows have explicit W/L outcomes |

All 270 box games match schedule home/away team IDs and both final team point totals exactly, summing player points without inference. All required NBA V9 counting fields—points, rebounds, assists, steals, blocks and turnovers—are populated. One sample is game `0022600001`, including NBA athlete 1641709, 33:15 minutes, 11 points, 11 rebounds and five assists. Source row positions remain game observations and cannot replace the separate approved current-roster eligibility target.

The box source includes 1,485 missing-minute rows with explicit DNP/inactive comments. Preserve `minutes` and `comment` in raw evidence; do not manufacture participation from a listed athlete or all-zero counting row. No missing minutes are silently zeroed. Game-specific inactive/injury comments are not a current healthy/IR classification. Existing participation normalization must consume the documented source fields explicitly.

The schedule has calendar dates, team IDs, scores and W/L outcomes; it supplies **no exact actual start, completion or official publication fields**. A dated result is not midnight UTC. The approved observed-final/complete-box policy can operate only after canonical mapping, trusted final-result semantics, complete-role/V9 validation, preserved provenance and contradiction checks. The local file fetch or asset modified timestamp alone does not establish those facts. Observed first-final and first-validated-complete-box remain separate clocks.

Metadata inspection used three bounded GitHub release requests; downloading the two products used four HTTP requests including redirects. Actual first observations were `2026-11-27T00:40:14.958Z` (boxes) and `2026-11-27T00:40:15.619Z` (schedule). GitHub SHA-256 asset digests matched preserved immutable objects. The third inspected product, `nba_stats_player_game_logs/player_game_logs_2027.csv`, exists but was not downloaded because its overlap was unnecessary for this bounded review.

Ignored review files are under `data/provider_previews/capability_review/nba_products/`, with exact release metadata, field lists, sample records and `nba_current_products_review.json`. Immutable bytes also live under the existing SHA-addressed object directory. These are proposed source adapter/processing inputs, not an automatically approved eligibility/statistical backfill or evidence of a live one-minute service. No accepted V5/Parquet/recovered CSV, current eligibility, ownership or competitive record was modified.
