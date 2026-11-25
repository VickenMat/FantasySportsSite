# Player data UI audit

Read-only development audit on November 25, 2026. No dataset was imported or modified.

| Sport | Canonical players | Demo | Synthetic | Real players with normalized historical stats | Real players with observed positions | Players with persisted V9 ledger scores |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NFL | 1,863 | 2 | 1 | 1,860 / 1,860 (100%) | 1,860 / 1,860 (100%) | 12 |
| MLB | 1,507 | 2 | 0 | 1,505 / 1,505 (100%) | 33 / 1,505 (2.2%) | 11 |
| NBA | 3,787 | 2 | 0 | 3,785 / 3,785 (100%) | 0 / 3,785 (0%) | 0 |
| NHL | 885 | 2 | 0 | 883 / 883 (100%) | 883 / 883 (100%) | 0 |

My Team, Players and Draft all query the canonical `Player` identity and exclude synthetic players from acquisition pools. They use season-scoped imported historical box scores, observed positions or explicit eligibility evidence, and persisted UBP V9 ledgers. Totals and averages are historical actuals through the selected replay boundary; they are not projections. `PROJ` remains `N/A` because no verified projection source exists. Missing positions and scores remain `N/A` rather than inferred.

The accepted archive has complete normalized historical-stat presence for non-demo players, but trusted position coverage is incomplete for MLB and absent for NBA. Persisted V9 score ledgers cover only the current scored fixture/sample subset. Demo identities remain explicitly flagged and are not counted as authoritative production records.
