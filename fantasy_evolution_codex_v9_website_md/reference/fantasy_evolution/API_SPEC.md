# Fantasy Evolution | API contract outline (draft v0.4)

No endpoints are production-ready; these are candidate versioned REST paths. Authn/authz, idempotency, transaction isolation, and errors must be specified before implementation.

- `GET /v1/sports` and `/v1/players?season_id=&sport=&position=`: supported sports and eligible athlete pool.
- `POST /v1/leagues` and `GET /v1/leagues/{league_id}`: create/read league.
- `GET /v1/leagues/{id}/settings` and `PATCH /v1/leagues/{id}/settings`: schema-driven settings, commissioner role and change-window validation.
- `GET /v1/leagues/{id}/rules`: immutable active rules snapshot and explanatory descriptions.
- `GET /v1/leagues/{id}/rosters/{franchise_id}`: ownership, slot assignments, validity violations, locks.
- `POST /v1/leagues/{id}/lineup/moves`: role-specific assignment; reject game-locked players.
- `POST /v1/leagues/{id}/drafts` and `/drafts/{id}/picks`: draft setup and transactional picks.
- `POST /v1/leagues/{id}/trades` and `/trades/{id}/accept`: distinguish outgoing proposal from accepting incoming trade, especially when roster-invalid.
- `POST /v1/leagues/{id}/waiver-claims` and `/releases`: validate waiver rules, lock and roster validity.
- `GET /v1/leagues/{id}/scoring` and `/standings`: computed from locked scoring version and raw events.
- `GET /v1/analytics/adp` and `/auction-values`: cohorts of completed real drafts; minimum sample thresholds TBD.
- `GET /v1/leagues/{id}/audit-events`: authorized immutable history.

All writes require server-side authorization, request idempotency keys, and conflict-safe state transitions. All time comparisons use timezone-aware instants; official game start time is the lock trigger. Do not trust client clocks.
