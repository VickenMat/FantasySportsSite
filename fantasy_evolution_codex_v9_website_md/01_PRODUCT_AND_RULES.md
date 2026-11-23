# Product and league rules

Fantasy Evolution supports NFL, MLB, NBA and NHL in a unified multi-sport league, as well as single-sport leagues. Dynasty is the multi-sport default; redraft is supported. Support commissioner-defined league sizes, roster configurations, sport-specific scoring versions, waivers and drafts.

## Default standard starters
- NFL (9): QB, RB, RB, WR, WR, WR, TE, FLEX, FLEX. FLEX=RB/WR/TE. No default SUPERFLEX. Optional SUPERFLEX variant is configurable.
- MLB (9 legacy baseline): SP, SP, 1B, 3B, MI, OF, OF, UTIL, UTIL. MI=2B/SS; OF=LF/CF/RF/OF; UTIL=hitter only.
- NBA (9 legacy baseline): PG, SG, G, SF, PF, F, C, C, UTIL. G=PG/SG; F=SF/PF; UTIL=any eligible player.
- NHL (9 legacy baseline): F, F, F, F, D, D, G, UTIL, UTIL. F=forward; UTIL=skater only.

These MLB/NBA/NHL baseline lineups are **not approved as balanced**. Alternative counts/slot definitions must be tested, including MLB RP and NHL second G.

## Additional league formats
Legacy 10- and 12-starter formats exist in reference documents. Store configurations as slot arrays rather than hardcoded counts. Default benches: five per sport plus five universal bench slots and five IR slots, configurable by league. Support daily lineup locking by real game start; NFL effectively weekly by games. Support waivers/FAAB, league draft types, transactions, injured reserve, offseason dynasty continuity, audit logs and commissioner permissions.

## MLB eligibility
A player starts with officially listed positions. New eligibility is earned with 10 starts OR 20 appearances at a position during the current season. Earned eligibility carries through the following season, and expires afterward unless requalified. This requires fielding starts and appearances, not just hitting or pitching box scores.

## Invariants
- A player cannot be started by multiple fantasy teams in the same league.
- No player may occupy two simultaneous slots on one fantasy roster.
- Two-way MLB scoring must not double-count the same athlete/game.
- Position eligibility must be evaluated at lock time using information then available.
- Historical data provenance, correction history and season completeness are tracked.
