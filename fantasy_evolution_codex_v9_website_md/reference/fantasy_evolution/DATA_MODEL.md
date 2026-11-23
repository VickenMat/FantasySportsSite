# Fantasy Evolution | Data model (draft v0.4)

## Identifiers
Use immutable UUID/UUIDv7 primary keys for User, League, LeagueSeason, SportSeason, Franchise, FranchiseMembership, Athlete, AthleteSportRole, ProfessionalTeam, Game, Appearance, StatEvent, ScoringPresetVersion, LeagueRuleSnapshot, Draft, DraftPick, AuctionBid, RosterAssignment, LineupAssignment, Trade, TradeAsset, WaiverClaim, Transaction, and AuditEvent. Store external provider IDs in separate unique mapping records keyed by provider and entity type.

## Relationships
- League -> many LeagueSeasons -> many participating SportSeasons; each SportSeason has start-year identity, dates, games, and official status.
- Athlete -> many eligible sport roles and professional-team affiliations, each effective-dated. **One Athlete per real person** even if two-way; one roster ownership record per league season, with role-specific scoring eligibility.
- LeagueSeason -> immutable scoring snapshot and immutable league-rule snapshot for that competitive season.
- Franchise -> roster assignments and lineups, with effective times, sport allocations and universal bench capacity.
- Game -> appearances -> raw stat events with provider provenance and correction versions; derived fantasy points link to the exact scoring snapshot and selected lineup role.
- Drafts, claims, trades and releases append audit events; event history must be append-only with compensating corrections rather than destructive edits.

## Transactional invariants
Unique league-season ownership for each athlete; no simultaneous incompatible active lineup assignments; locked players cannot move, be cut, or traded; roster-invalid franchise cannot initiate trades or add free agents but may accept incoming offers and release unlocked athletes. Accepting a trade can increase invalidity. Existing starters still score.

## Data analytics
Store completed-vs-mock draft flag, draft type, pick order, bids, projected points at draft time, scoring version, roster preset, team count, sport combination, transactions, roster percentage snapshots, and anonymized aggregated metrics. Track data lineage, privacy and retention policies.

## Pending
Sport-specific stat schemas, provider licensing, corrections finality, games-played rules, role assignment overlap, contracts and cap ledger, exact lineup-slot assignment history.
