# Scoring engine and historical simulation

## Deterministic scoring
Represent each rule as `{sport, stat_key, coefficient, applicability, version}`. Use pure functions with test vectors, immutable raw events, correction ledger and full explanation of each player score. Avoid double-counting MLB two-way athletes or NFL fumble subtypes. Validate stat column provenance and negative values. Separate goalie/skater and pitcher/hitter roles. Handle late corrections by replaying affected ledger entries.

## Actual pregame simulation
For each complete season, create **as-of snapshots** of knowledge available before draft/waiver/lock. Use prior seasons only for draft rankings; use prior games only for rolling player projections. Do not use actual same-day score to choose a lineup. Load published historical fixtures when available and clearly mark inferred fixtures from game logs as an optimistic schedule proxy. For MLB starting pitchers, require historically knowable announced probable starters or flag uncertainty; do not assume every SP starts whenever his team plays. Use historical team transactions and injuries when available, otherwise mark roster assumptions. Lock individual games at scheduled start; solve eligible lineup via bipartite matching, including bench/IR constraints. Simulate weekly FAAB claims without future data. Repeat seeded snake drafts and compare realistic outcomes.

## Historical coverage and validation
Train on complete 2016–2022 seasons, quarantine 2020 MLB and 2019–20 / 2020–21 NBA/NHL COVID disruptions for separate stress tests. Use 2023–2024 as development validation and 2025 as **sealed holdout**. NBA/NHL season label is starting year. Exclude incomplete 2026/2026–27. Run 4, 8, 12, 16 teams and 9/10/12 starters plus custom sport-specific slot arrays. Preserve fixed draft seeds and report sensitivity. Optimize scoring weights jointly with slot counts only against training years. After each coefficient change, **rerun drafting, lineup decisions and waiver choices**. Never treat fixed-pool rescaling as an actual simulated result.

## Objectives and guardrails
Primary: cross-sport max-minus-min median team-season total / four-sport mean <= 0.5% on sealed holdout. Secondary: stable year-by-year spreads, realistic role shares, high fill rates, minimal roster complexity, low sensitivity to seeds and player injuries. No hidden sport multipliers at scoring time. If no configuration passes, report failure honestly and offer closest feasible candidates, not a manufactured success.

## Data gaps
Current NHL CSV lacks historical shorthanded point and faceoff win counts. MLB historical position-eligibility starts/appearances and announced starters are not fully supplied. Some NBA/MLB position fields are missing. Quarantine or enrich; never silently assume complete coverage.
