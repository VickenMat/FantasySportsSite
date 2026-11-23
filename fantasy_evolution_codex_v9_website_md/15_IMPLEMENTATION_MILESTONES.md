# Build milestones and definition of done

1. **M0** Repository scaffolding, Docker PostgreSQL, CI, auth, seeded demo, landing/dashboard. Verify dev/build/tests.
2. **M1** Canonical player/game schema, import validators, sport scoring library, score ledger, unit tests for every scoring action and negative/stacking case.
3. **M2** League creation, commissioner settings, league membership, dynamic starter arrays, positions and dynasty/redraft season models.
4. **M3** Draft engine, live room, roster ownership, bench/IR, lineup eligibility, per-game locks and no double starts.
5. **M4** Matchups, standings, transactions, waivers/FAAB, trades, audit and correction replays.
6. **M5** Four-sport import adapters, fixture ingestion, as-of data and observability; report missing columns and season completeness.
7. **M6** Multi-season time-safe draft/waiver/daily lineup simulator, 2016–2025 validation, cross-sport optimizer, admin charts and reproducibility.
8. **M7** Security, accessibility, responsive UI, performance, recovery/backups, deployment and release notes.

At each milestone: implement end-to-end working features, run typecheck/lint/unit/integration/e2e as appropriate, update docs, commit coherent changes, explain next milestone. No fake APIs or hardcoded score cards in production routes. Do not wait until M6 to implement deterministic scoring tests.
