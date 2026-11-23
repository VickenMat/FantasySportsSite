# UBP V6 schedule-aware daily backtest: 2023 diagnostic

This is an implemented diagnostic, NOT a production-validated 0.5% UBP calibration.

## Implemented changes versus V5
- Daily fixture eligibility inferred from historical team/game dates, instead of blindly starting players on non-game days.
- Maximum-weight bipartite lineup matching (`scipy.optimize.linear_sum_assignment`) for legal position allocation, instead of greedy scarce-slot ordering.
- Prior-season-only draft rankings, 15-round snake drafts, and no current-season participant intersection in the draft pool.
- Pregame projections from prior-season per-game scoring and prior completed appearances. Outcomes are ingested only after the corresponding date is scored.
- Weekly waiver replacement conditional on an observed projection improvement. Unseen rookies become eligible only after accumulating prior appearances.
- 4/8/12/16 team and 9/10/12 starter sensitivity cases for each of four sports, seed 11.

## Observed 2023 results
The primary 12-team, nine-starter median totals are NFL 8,996.6; MLB 3,040.2; NBA 13,063.5; NHL 11,004.2. Cross-sport max-minus-min over mean = 111.05%, far outside the requested 0.5% tolerance. These numbers cannot be used as a reliable calibration target yet.

## Remaining limitations that materially invalidate final calibration
1. Schedule is reconstructed from observed box scores. This is a game fixture proxy, not an authoritative pregame schedule and does not encode MLB probable starters, goalie confirmations, scratch status, or known roster transactions.
2. Player-to-team mappings are carried forward from prior-season games until the player appears in the new season. Trades and team changes can therefore cause false inactive starts.
3. The simulator has no true bench strategy, IR transactions, dynasty retention, waiver bidding, or position-specific waiver priorities. The draft pool excludes first-year rookies; these can be added only after prior games.
4. Daily historical MLB box scores contain pitcher appearance information but not a complete *pregame probable-starter* feed. Starting pitching selection is therefore particularly inaccurate.
5. NHL shorthanded points and faceoff-win counts are absent. Missing stat contributions must not be assumed to be zero in a final calibration.
6. NBA/NHL league season-year interpretation must be reconciled with the fantasy cross-sport league-year. NFL uses weekly aggregation, not exact kickoff dates.
7. Current player positional eligibility is approximated by previous listed positions and newly observed positions; MLB 10-start/20-appearance carryover cannot be verified from these inputs alone.
8. A single year (2023) and one random seed were run. No multi-year, multi-seed holdout validation has been completed.
9. Drafts are sport-separated diagnostics; they are not a unified four-sport player auction/snake draft and do not capture cross-sport opportunity cost.
10. The score model uses existing experimental V5 NFL and V4 other-sport weights; it does not claim newly fitted V6 scoring coefficients.

## Engineering next steps
- Obtain verified fixture schedules, probable SP and goalie starts, transactions, and official eligible positions as of each game date.
- Add realistic preseason rookie projections and roster construction constraints, bench depth and IR, and a coherent waiver priority/FAAB model.
- Audit baseball pitching/hitting point distributions against source box scores and missing starting slots before changing sport coefficients.
- Simulate 2017–2022 for training and 2023–2025 as unseen holdout, using many draft seeds, multiple league sizes and formats.
- Only then fit one-decimal scoring coefficients to training seasons and measure held-out 0.5% cross-sport spread; report failures rather than claiming forced balance.

Run: `OPENBLAS_NUM_THREADS=1 python run_v6.py` from a directory with the companion script and four source CSVs in `/mnt/data`.
