# Fantasy Evolution | Product requirements (draft v0.4)

## Vision
A professional-grade fantasy platform for NFL, MLB, NBA and NHL, supporting any nonempty subset of sports, redraft and dynasty, unified drafts, and a shared franchise. No claim of affiliation with ESPN or any sports league.

## Three layers
1. Core platform: identities, leagues, franchises, sports, seasons, drafts, waivers, trades, player statistics, audit trail, analytics, permissions, documentation.
2. Single-sport: sport-specific starter and bench templates, ESPN-inspired configurable points presets, cumulative or H2H or H2H-category competition. Default redraft.
3. Multi-sport: UBP default, categories as an alternative scoring model pending definition, cumulative competition only, balanced or open universe roster. Default dynasty.

## Defaults
4–16 teams, default 12. NFL is default sport. Universal snake is default draft. Rolling free agency default. No salary cap by default. Redraft keeper toggle off by default. See SETTINGS_SCHEMA.json for complete current selections.

## Acceptance principles
- Same player is never duplicated across the fantasy player pool by external data provider IDs.
- League-specific scoring is immutable after scoring activation.
- Incompatible options are blocked server-side, not merely hidden in UI.
- All authoritative fantasy actions are transactionally validated and audited.
- UI is responsive and accessible; live scoring must be reconcilable to raw official stats.

## Out of scope until specified
UBP numeric weights, Vickrey contract economics, Open Universe position caps, final category scoring mechanics, monetization, and live provider integration.
