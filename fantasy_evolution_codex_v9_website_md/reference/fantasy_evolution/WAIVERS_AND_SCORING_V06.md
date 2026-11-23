# Confirmed rules added in v0.6

## Universal lineup slots
- NFL FLEX: RB, WR, TE. SUPERFLEX: QB, RB, WR, TE.
- MLB UTIL: hitters only; no SP or RP.
- NHL UTIL: forwards (F) and defensemen (D) only; goalies are NOT eligible.
- NBA UTIL: any position.
- MI = MLB 2B/SS; F/C = NBA forward/center.
- Athlete has one roster identity, one active role for a game; no dual scoring for Ohtani or Travis Hunter.
- Individual game start locks players against lineup moves, cuts, and trades until the applicable unlock event (still TBD).

## Acquisition mechanisms
- Rolling: ordinarily immediate free pickup. If the player played on the preceding day OR was cut within 24 hours, player enters a one-day waiver period; then becomes a free pickup. The most recent completed game or player release determines the waiver clock; a new completed game resets the clock. Implement as a rolling 24-hour period from the later event. Timestamp and cancellation edge cases remain TBD.
- FAAB: same ordinary availability and one-day waiver triggers. All managers may submit FAAB bids during the one-day waiver period. At expiry, highest valid bid wins. If no valid bid exists, the player becomes available for immediate free pickup. Equal-bid tiebreaker TBD.
- Vickrey: any eligible free agent may be nominated at any time; bidding remains open 24 hours. Final pricing, minimum increments, tied bids, cap holds, and auction extensions are TBD. Salary-cap rolling prerequisite remains.
- All modes respect roster invalidity and player/game locks.

## UBP display and weight precision
- All **published UBP per-stat weights** must have exactly one decimal place. Do not round provisional fractional weights (such as 0.04) to one decimal and thereby erase statistics. Derive a compatible new scale, recalibrate legal nine-player lineups, then round final approved weights to 0.1 and revalidate balance.
- Game, daily, and season display scores: one decimal place. Intermediate arithmetic should use deterministic exact decimal or integer tenths where applicable. No per-sport hidden score multipliers after earning points.
- The v0.5 exploratory coefficients are **superseded as production candidates**. They remain historical research artifacts only.
