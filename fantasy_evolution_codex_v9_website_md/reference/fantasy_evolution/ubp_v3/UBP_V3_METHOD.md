# UBP V3 calibration report

Status: provisional, not production approved.

The four source files are the user-supplied final CSVs. The model scores actual game rows with the proposed V3 weights, aggregates by player and season, then solves a 108-slot maximum-weight matching problem for 12 teams using the confirmed 9-starter templates. Each selected player-season role can occupy at most one slot. Historical years 2016-2025 are considered, excluding MLB 2020 and NBA/NHL seasons starting 2019 and 2020 because of shortened/disrupted schedules; current partial 2026/27 excluded. The selected 108 players are pooled and divided by 12; this is not 12 independent drafted teams and not daily lineup optimization.

The weights are one-decimal values. MLB IP is scored using outs/3, so a single innings-pitched event can yield a repeating-decimal intermediate. Only final presentation is rounded.

NHL shorthanded points and faceoff wins are missing from the uploaded NHL dataset, so their candidate weights are specified but their contributions were zero in historical calibration. Historical results understate NHL points if these metrics are enabled in production. No faceoff-win counts can be derived reliably from faceoff win percentage without attempts. Shorthanded goal/assist points likewise cannot be recovered from overall goals/assists. Do not treat current NHL balance as final.

NBA OREB is an extra bonus on top of REB, not a replacement. NFL first downs include passing/rushing/receiving events separately. NFL fumbles_lost_total is applied once; do not sum subtypes again. MLB blown saves are penalties and can stack with other relief outcomes. TE premium applies to TE receptions independent of lineup slot.

Important: season-optimal selected players are an upper-bound proxy; actual teams draft and set daily lineups without knowing future performance. MLB player identity must be de-duplicated across batting and pitching roles when implementing final Ohtani rules. Positional data has missing records in MLB and NBA.

## Median 12-team position-constrained lineup totals

- MLB: 10,209.2 points/team (n=9, range 9,861.3 to 10,968.9)
- NBA: 10,362.6 points/team (n=8, range 9,992.8 to 10,857.4)
- NFL: 10,057.0 points/team (n=10, range 9,215.1 to 10,378.9)
- NHL: 10,105.0 points/team (n=8, range 9,564.0 to 10,467.3)

Spread between sport medians: 3.0% of mean median (10,183.5). This does NOT include NHL new categories.

## Illustrative examples (hypothetical, not historical player records)

- NFL QB: 139.5 points for a sample game; 2,371.5 points if repeated over 17 games.
- NFL RB: 113.0 points for a sample game; 1,921.0 points if repeated over 17 games.
- NFL TE: 96.0 points for a sample game; 1,632.0 points if repeated over 17 games.
- MLB hitter: 28.3 points for a sample game; 4,103.5 points if repeated over 145 games.
- MLB SP: 37.0 points for a sample game; 1,110.0 points if repeated over 30 games.
- MLB RP: 17.3 points for a sample game; 1,124.5 points if repeated over 65 games.
- NBA guard: 25.8 points for a sample game; 1,935.0 points if repeated over 75 games.
- NBA center: 26.7 points for a sample game; 2,002.5 points if repeated over 75 games.
- NHL forward: 27.8 points for a sample game; 2,224.0 points if repeated over 80 games.
- NHL defenseman: 27.3 points for a sample game; 2,184.0 points if repeated over 80 games.
- NHL goalie: 48.6 points for a sample game; 2,673.0 points if repeated over 55 games.
