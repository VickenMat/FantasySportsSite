# Database and API contracts

## Tables and constraints
`User`, `Session`, `League`, `LeagueMember`, `LeagueSport`, `Season`, `ScoringPreset`, `ScoringRule`, `RosterSlotDefinition`, `Player`, `PlayerExternalId`, `ProTeam`, `Game`, `PlayerGameStat`, `PlayerPositionEligibility`, `FantasyTeam`, `FantasyRosterEntry`, `LineupAssignment`, `Draft`, `DraftPick`, `AuctionBid`, `WaiverClaim`, `WaiverRun`, `Trade`, `TradeAsset`, `Matchup`, `MatchupScore`, `ScoreLedgerEntry`, `StatCorrection`, `ImportBatch`, `SimulationRun`, `SimulationResult`, `AuditEvent`.

Use UUID PKs; unique provider/external IDs; unique (league, player, active ownership), unique (team, slot, date or game lock), and unique (game, player, stat source revision) as appropriate. Store UTC instants, canonical team/player IDs, event timestamps, as-of knowledge times and provenance. Index league/team/date and game/player. Implement transactions for drafts, claims, trades and roster moves.

## API endpoints
`POST /api/leagues`, `GET /api/leagues/:id`, `PATCH /api/leagues/:id/settings` (commissioner only), `POST /api/leagues/:id/join`, `GET /api/leagues/:id/players`, `POST /api/drafts/:id/pick`, `POST /api/lineups/:teamId/assign`, `POST /api/waivers/:leagueId/claims`, `POST /api/waivers/:leagueId/process`, `POST /api/trades`, `POST /api/trades/:id/respond`, `GET /api/matchups/:id`, `GET /api/scoring/:playerId/ledger`, `POST /api/admin/imports`, `POST /api/admin/simulations`.

Every mutation: authenticated session, league membership, role/ownership checks, Zod validation, idempotency key for retry-sensitive actions, transactional persistence, structured audit. Paginate/filter player queries. Commissioner controls require authorization even when UI hides buttons. Provide OpenAPI docs or generated typed clients.
