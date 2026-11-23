# Schedule-aware historical simulation specification

## Data sources
User-provided NFL weekly regular-season game logs, MLB game batting/pitching logs, NBA game logs and NHL skater/goalie logs. Keep source versions and audit completeness. Seasons with shortened schedules require explicit inclusion/exclusion policy. Source CSVs are not bundled in this Markdown ZIP.

## No-lookahead algorithm
1. At season start, derive preseason rankings from information strictly before the season (prior season plus permitted earlier history); treat rookies and new teams explicitly.
2. Simulate seeded snake drafts of legal roster sizes and position coverage. Use roster feasibility checks, not artificial global SP caps. Include legal bench composition and pitcher/goalie supply.
3. Build fixture calendar with actual pregame schedule, including team identity, game ID and start timestamp. Maintain as-of team assignments and transactions, not future-game-derived mappings.
4. At each daily lock, compute projected player value from **past** games, schedule, injuries and pregame availability. Probable MLB SP and NHL goalie start probabilities must come from pregame data or be explicitly modeled as uncertain. No hindsight starts.
5. Solve maximum projected-value matching between available players and legal lineup slots. Respect locks and distinct player identities.
6. Score only after real games end; then update rolling histories. Never use same-day outcome to choose the same day's starters.
7. Run weekly waiver periods with legal FAAB/budget, player ownership, position constraints and no future information; log each transaction.
8. Aggregate by fantasy team, sport, season, slot and role. Report team distribution, median, mean, utilization, QB share, goalie share, pitcher share, negative scores, waiver churn, and missing-source coverage.

## Specific simulator defects to fix from V7
- V7 used a provisional cap of 3 SP on every MLB roster, even formats requiring RP or 3 SP. Replace with position-feasible roster construction.
- Historical player-team membership used last-seen team and updated after appearance, potentially excluding traded or newly activated players.
- Missing pregame probable pitchers and confirmed NHL goalies; scheduled team game is not a guaranteed player start.
- No robust treatment of missing MLB/NBA positions or unavailable NHL statistics.
- Previous seasons' final rankings were used as a proxy for pre-draft forecasts, which is acceptable only for the following season and not the same season.
- A weekly waiver clock based on every seventh distinct game date is not equivalent to actual league waiver deadlines; use calendar-driven waiver processing.
- Prior prototype used per-date MLB athlete role collapse by maximum **actual** score before lineup selection; ensure scoring-role selection is determined before the game, not by whichever role later scores more.

## Calibration
Training set should include multiple older complete seasons; holdout at least two later complete seasons where available. Reserve draft seeds for validation. Optimize starter counts and action weights together, then rerun complete simulation for each candidate. Avoid choosing 2023/2024 as sealed holdouts after examining their V7 results; use them as diagnostics, and define fresh held-out periods before next tuning.

## Required output
`simulation_runs`, `simulation_lineups`, `simulation_transactions`, `simulation_scores`, `simulation_metrics`, `source_coverage`, `scoring_versions`, `roster_configs` with version IDs, random seed, timestamps, code commit and data hash. Provide repeatable CLI commands and tests.
