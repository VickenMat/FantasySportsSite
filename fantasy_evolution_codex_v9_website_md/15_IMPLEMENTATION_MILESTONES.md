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

## M3.5 completion record

Completed November 23, 2026. M3.5 adds persistent configurable draft clocks, queue-first automatic picks, commissioner pause and resume, reconnect recovery, trades, playoff seeding, route and service authorization, rate limiting, paginated player reads, batched matchup queries, connection-pool controls, and an idempotent gameplay worker. Serializable transactions and uniqueness constraints protect draft picks, direct acquisitions, trade acceptance, and waiver awards.

Verification passed with 108 unit tests, 10 PostgreSQL integration tests, 6 Chromium workflows, TypeScript, ESLint, the production build, and a zero-finding npm audit. A local 100, 500, and 1,000-user report is tracked at `reports/load-m3-5.json`. It demonstrates zero unexpected read errors on the tested machine, while authentication reached 18.69 seconds p95 at 1,000 concurrent users and remains the measured bottleneck. Sixteen-manager mutation tests confirmed one winner for contested draft and direct-acquisition operations. These results do not establish production scale.

UBP V9 and all 56 coefficients remain unchanged. V10 is inactive. The 0.5% cross-sport target remains unverified pending independently timestamped pregame and availability evidence plus a sealed holdout.
