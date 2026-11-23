# Fantasy Evolution | Decision log (draft v0.4)

## Confirmed
- Architecture: core platform, single-sport, multi-sport layers; data-driven settings and immutable league scoring snapshots.
- Four sports NFL, MLB, NBA, NHL; any selected combination. 4–16 fantasy franchises, default 12.
- Single sport default redraft with ESPN-inspired points scoring, multi sport default dynasty with UBP and cumulative competition.
- Multi-sport Balanced roster presets 9/10/12; exact positions in SETTINGS_SCHEMA.json; single-sport defaults in same file.
- MLB MI=2B/SS; NBA F/C=SF/PF/C. NFL IR=IR, OUT, SUSPENDED.
- Five sport-specific bench spots per selected sport, five universal bench, five universal IR for multi sport.
- One athlete identity and one roster spot for two-way athletes; one chosen scoring role per overlapping appearance; no combined role points.
- Official scheduled game start triggers lock; cannot move, bench, cut or trade locked player.
- Dynasty roster invalidity blocks adds and outgoing proposals, allows accepting incoming trade even if invalidity worsens, and allows releasing unlocked players. Starters stay and score.
- Redraft completed-sport roster locked until league rollover; dynasty offseason trading subject to rules, IR occupants return to regular capacity.
- Season labeled by start year of each selected professional sport; no separate calendar-year season option.
- Scoring rules immutable once active; commissioner roster edits before draft or for future season after relevant sport finishes.
- Draft choices, free agency types, keepers and salary cap constraints as in SETTINGS_SCHEMA.json.
- UBP dataset gathering is paused at user request; do not fabricate weights.

## Pending and not to assume
- Exact UBP weights and categories, open-universe guardrails, ESPN preset verification, category scoring for multi sport.
- Postgame lock release, postponed games, two-way simultaneous appearance semantics, sport role-specific scoring for all stat feeds.
- NFL single-sport IR count, exact MLB IL slot allocation, waivers processing, FAAB, Vickrey mechanics, dynasty rookie drafts, contract economics.
- League renewal timing, player statuses, game correction deadlines, trade review, keeper rules, salary cap and data provider licensing.

## Clarification on trade language
'Cannot send an outgoing trade' means cannot **initiate/propose** a trade. Acceptance of an already-received incoming offer is permitted even if it adds assets and increases invalidity. All independent player-lock restrictions still apply.

## v0.5 analysis decisions
- Historical uploads are accepted as candidate source material for UBP; exploratory proxy computed and included. NOT a locked scoring version.
- The 9/10/12 multi-sport roster arrays and single-sport scoring presets are unchanged.
- UBP weights remain **TBD** pending position-eligible lineup simulations.
- Raw source CSVs excluded from ZIP because of size; keep original files separately.

## v0.6 confirmations
- UBP published stat weights and displayed scores use one decimal place. Recalibration is required; older exploratory multipliers are not final scoring rules.
- NFL FLEX RB/WR/TE; SUPERFLEX QB/RB/WR/TE. MLB UTIL hitters only. NHL and NBA UTIL any position (NHL includes G).
- Rolling and FAAB ordinarily allow immediate pickups; players who played the previous day or were cut within a day go on one-day waivers, then free pickup. Precise time interpretation and waiver claim settlement TBD.
- Vickrey permits any-time nomination and a 24-hour open bidding window, with settlement mechanics TBD.
- Position index produced from raw game logs; MLB field positions and NBA positions are unresolved pending authoritative source. No invented assignments.

## v0.7 confirmed
- NHL UTIL restricted to F/D.
- FAAB restricted players collect bids during 24-hour waiver, highest valid bid wins at expiration; otherwise free pickup.
- Waiver clock resets after each more recent completed game or release.
- UBP remains unapproved pending legal lineup calibration.
