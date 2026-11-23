# Implementation architecture and milestone plan

## Suggested baseline stack (engineering proposal, not previously mandated)
TypeScript monorepo, Next.js UI/API, PostgreSQL, Prisma or Drizzle ORM, Redis for queues/cache, background worker for ingest/scoring, shared Zod contracts, Vitest for unit/integration, Playwright for E2E, Docker Compose for local dev. Choose alternatives if the repo dictates; document reasons.

## Domain modules
- Identity, sessions, roles, commissioner permissions, leagues, seasons, sport configurations.
- Provider ingestion adapters, raw event store, canonical player/team/game IDs, roster transactions, position history, data provenance.
- Scoring rule DSL with versioned weights, stat deduplication, replayable score ledger and audit trace per stat.
- Draft room with snake/auction options, picks, keeper/dynasty rights and autodraft.
- Daily lineup builder with lock timestamps, eligibility checks, bench/IR and score previews.
- Waiver engine, FAAB budgets, bids, claims, priority, trades and immutable transaction log.
- Matchups, schedules, standings, sport subtotals, history, commissioner overrides.
- Backtesting worker and admin dashboard for coverage, fairness and calibration results.

## Suggested order
1. Scaffold monorepo, Docker Compose, database, auth, CI and seed data.
2. Implement canonical schema, scoring engine, golden statline tests, score audit API.
3. Implement leagues, commissioner scoring/roster configuration and one-sport roster flow.
4. Add drafts, transactions, waivers, locks and daily lineup optimizer.
5. Integrate four sports and multi-sport matchup/standings UI.
6. Add historical ingestion, as-of snapshots, simulation engine and optimization dashboard.
7. Perform data quality remediation, multi-season calibration and sealed holdout validation.
8. Load/security tests, backups, deployment and production operations documentation.

## Operational expectations
Provide `.env.example` with no secrets, local commands, migrations, seed script, background job runner, unit and E2E tests, fixtures, CI workflow, observability and error recovery. Prefer idempotent imports and event-sourced score correction with reproducible replays.
