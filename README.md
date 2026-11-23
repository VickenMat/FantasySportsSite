# Fantasy Evolution

Fantasy Evolution is a fantasy sports website for NFL, MLB, NBA, and NHL. M0 provides account registration, sign-in, sign-out, email-based password recovery, and a dashboard backed by PostgreSQL. The seeded Founders Dynasty league lets its demo manager inspect the experimental UBP V9 coefficients and a sample player pool.

## Run locally

Requirements are Node.js 24, npm, Docker Compose, and OpenSSL.

```bash
cp .env.example .env
printf 'AUTH_SECRET=%s\nDEMO_PASSWORD=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 24)" >> .env
docker compose up -d --wait
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open [Fantasy Evolution](http://127.0.0.1:3000) and sign in with the `DEMO_EMAIL` and generated `DEMO_PASSWORD` in your local `.env`. New accounts start with an empty dashboard. The seed is repeatable and preserves the existing demo account credentials. Change the account password through the recovery flow if needed. SMTP is optional outside the provided setup. Local reset messages arrive in [Mailpit](http://127.0.0.1:8025).

Use the exact scheme, hostname, and port configured in `AUTH_URL` so the application and session cookies share the same origin. Keep the local database and Mailpit bound to loopback. The app reports PostgreSQL readiness at [`/health`](http://127.0.0.1:3000/health).

## Verify

With PostgreSQL and Mailpit up and the database migrated and seeded:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run worker
npm run build
npx playwright install chromium
npm run test:e2e
```

The workflow in `.github/workflows/ci.yml` applies committed migrations with `npm run db:deploy` and runs browser tests against the production build. Local Playwright starts the development server or reuses it if already running. When editing the Prisma schema, rerun `npm run db:generate` to refresh the client.

Better Auth manages scrypt password hashes and PostgreSQL-backed sessions. Prisma 7 is pinned for compatibility with the Better Auth adapter.

## M1 historical imports and scoring

Apply the additive migration with `npm run db:deploy` and run `npm run db:seed` to ensure the experimental V9 preset is available. Restart any development server that was running before the Prisma client was regenerated. Keep provider CSVs in an external directory or the ignored local `Datasets/` folder.

```bash
npm run db:import -- --sport NFL --file /path/to/nfl.csv --validate-only
npm run db:import -- --sport NFL --file /path/to/nfl.csv
npm run score:recalculate -- --sport NFL --game 2016_01_MIN_TEN --player 00-0024389
```

Use `NFL`, `MLB`, `NBA`, or `NHL` with its source CSV format. Validation reports missing statistics and positions, season coverage, and sample row errors. Exit code 2 in validation mode means some rows failed. Imports are atomic by file, with bounded in-memory batches. A file with invalid rows rolls back unless an operator reviews the report and supplies `--allow-rejected`. CSV structure and canonical identity conflicts abort the file. The importer records the source SHA-256 and line, retains decoded raw cells, and deduplicates files and identical rows even if the columns are reordered.

To append a changed box score, import a corrected CSV with `--correction-reason "Provider correction details"`. The importer retains the prior raw revision and replays any existing ledger for the affected role in the same transaction. Importing a previously seen revision leaves the active revision in place. PostgreSQL rejects edits and deletes to raw stat revisions, trusted position evidence, and ledger history.

Omit `--sport` to pass canonical game and player UUIDs. Add `--role HITTER` or `--role PITCHER` when both MLB box scores exist. M1 stores a single selected role per player, game, and scoring preset. The scoring engine uses exact tenths, converts pitching innings from outs, and preserves missing values in the score explanation. NFL historical scores use the published position observation for TE eligibility by default. Supply `--te-eligible true|false` to use an independently determined eligibility decision.

League members can read scores at `GET /api/scoring/{playerId}/ledger?leagueId={leagueId}`. Both IDs are canonical UUIDs. Optional `gameId`, `limit`, and `offset` parameters filter and paginate the game ledgers. Entries include normalized counts, applied weights, missing stats, raw revision references, and recalculation history.

Use the game and player IDs from your CSV when requesting a score. The box scores leave game start times unset. NFL source rows also lack game dates. MLB and NBA position enrichment and other observed positions are kept as provenance. The eligibility service uses separately recorded evidence with effective and knowledge timestamps. MLB fielding evidence qualifies a position at 10 starts or 20 distinct appearances and carries the qualification through the following season. NHL faceoff wins and shorthanded points require direct counts. Goalie wins require a winning decision or an explicit flag, and unresolved shutouts remain missing.

### M1 verification

Validated all 1,746,957 rows from the four archived aggregate CSVs. NFL rejected 186 rows without player IDs. MLB, NBA, and NHL had zero rejected rows. MLB had 60 rows without position enrichment, NBA had 17,701, and 455,497 NHL skater rows lacked both scored faceoff and shorthanded counts. A separate PostgreSQL run imported 1,268 real rows across eight games per sport and confirmed repeat imports were no-ops.

The migration was tested on an upgraded M0 database and a fresh PostgreSQL database. Typecheck, lint, and the production build passed, along with 76 unit and import validation tests, seven PostgreSQL integration tests, and five Chromium tests on fresh development and production servers. The scoring tests cover all 56 V9 coefficients, sport-specific stacking, missing values, and two-way role selection. The integration tests verify raw immutability, correction replay, idempotency, and eligibility. The V9 coefficients are unchanged. The 0.5% target remains pending sealed holdout validation.

## Milestones

The [V9 start guide](fantasy_evolution_codex_v9_website_md/00_CODEX_START_HERE.md) and [milestones](fantasy_evolution_codex_v9_website_md/15_IMPLEMENTATION_MILESTONES.md) define the build order. The preset seeded in M0 is experimental. The 0.5% balance target is pending sealed holdout validation.

- [x] M0 · Local website, PostgreSQL, authentication, demo league, and verification workflow.
- [x] M1 · Canonical players and games, import validation, deterministic scoring, score ledger, and golden tests.
- [ ] M2 · Create and join leagues, commissioner settings, and configurable dynasty/redraft seasons and starter arrays.
- [ ] M3 · Drafts, rosters, bench and IR, lineup eligibility, and pregame locks.
- [ ] M4 · Matchups, standings, waivers and FAAB, trades, transaction audit, and score corrections.
- [ ] M5 · Four-sport ingestion, data coverage, and season completeness.
- [ ] M6 · Time-aware simulation and optimization. Import the original historical datasets and pregame enrichment, freeze candidates before the 2025 sealed holdout, and report the observed spread.
- [ ] M7 · Release hardening, performance and accessibility review, recovery, and deployment.

## Landing artwork

The [landing image](public/arena-hero.webp) was created with the built-in ImageGen tool.

> Use case: ads-marketing. Create a widescreen editorial hero photograph for the Fantasy Evolution multi-sport website. A single panoramic composition with four fictional adult athletes stepping forward on the RIGHT two-thirds: a helmeted American football player cradling a ball at center, a basketball player holding an orange ball just to his left, a baseball batter with bat behind to his right, and a helmeted ice hockey player with stick on far right. Medium-wide thighs-up composition, fresh distinct faces, believable hands, unbranded charcoal and muted navy uniforms. Overhead cool blue arena and stadium lights, black midnight navy field, a few electric blue light shafts and subtle atmospheric haze, dramatic high contrast realistic commercial sports photography, fine grain. Dark quiet left third for a typography overlay and dark bottom where it blends into a dark blue page. Use a unified camera and stage, no borders or panels. No text, numbers, brands, watermark, emblems, logos, or typography. Landscape 1536 by 1024.
