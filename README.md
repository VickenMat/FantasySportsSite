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

## Dependency security remediation

On November 23, 2026, the baseline audit found one critical, six high, and one moderate package finding. `npm outdated` confirmed patched versions for Next.js, Nodemailer, and csv-parse. After a clean `npm ci`, both `npm audit` and `npm audit --omit=dev` reported zero vulnerabilities. [Next.js 16.4.6 release](https://github.com/vercel/next.js/releases/tag/v16.4.6)

- Next.js and its ESLint config moved to 16.4.6. The framework resolved Sharp 0.35.5 for image optimization and PostCSS 8.5.23 for its CSS pipeline. Other tooling resolves PostCSS 8.5.33. [Sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) · [PostCSS advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- Nodemailer 10.6.1 handles password-reset email. Chromium verified delivery through Mailpit, reset, and revocation of the old session. csv-parse 7.0.3 handles operator-supplied historical files. All four importers passed PostgreSQL replay tests. [Nodemailer advisories](https://github.com/nodemailer/nodemailer/security/advisories) · [csv-parse advisory](https://github.com/advisories/GHSA-8cw4-87c7-c6xx)
- Prisma remains on 7.10.1. Its CLI configuration package pins a vulnerable Effect release, so the lockfile scopes an override to `@prisma/config` and resolves Effect 3.22.5. Prisma generation, migrations, seeding, and integration tests passed with the override. This dependency is in the development and migration toolchain. Reassess the override when Prisma updates its pin. [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw)

## M2 historical simulation

Run the simulator from archived CSVs or from timestamped snapshots. It defaults to 12 teams, the V9 nine-starter array for the selected sport, five bench seats, seed 11, a balanced draft, and Wednesday waivers at 12:00 UTC with 100 FAAB per team.

```bash
npm run --silent simulate -- --sport NHL --csv Datasets/nhl.csv --output /tmp/nhl-simulation.json
npm run --silent simulate -- --sport NFL --csv Datasets/nfl.csv --nfl-schedule Datasets/nfl-schedule.csv --teams 8 --seed 11 --seed 29
npm run --silent simulate -- --snapshot /path/to/snapshot.json --include-unverified --trace
```

Use `--slots` with a comma-separated array to test other formats, `--strategy balanced|upside|scarcity` for draft and valuation choices, and `--include-partial` or `--include-quarantined` for separately labeled diagnostic runs. `--year` can be repeated to select seasons. The CLI writes JSON with the code revision, source SHA-256 values, config, replay hash, season coverage, slot fills and vacancy counts by reason, role totals, FAAB, and team scores in integer tenths. `--trace` adds picks, locked lineups, waiver claims, and individual game settlements.

The snake draft reserves scarce starters across the league before filling benches. Lineups use only published schedules, eligible roster snapshots, and results known at lock from prior calendar days. A lineup maximizes legal fills and then projected points, and each athlete can occupy one slot on a slate. NFL uses weekly slates, and the other sports use daily slates in the CSV adapter. Each team can make one claim at each calendar-based waiver deadline. Highest bids win with deterministic priority, and a drop cannot reduce starter coverage.

### Timestamped snapshot input

Each JSON file describes one sport and season. Use ISO 8601 timestamps with offsets. An as-of snapshot needs independent coverage evidence before use in complete-season comparisons.

| Field | Shape |
| --- | --- |
| Season | `sport`, `year`, `label`, `coverage`, `coverageReason`, `draftAt`. For `COMPLETE`, provide the independently verified `expectedFixtures`. |
| `fixtures[]` | `id`, `slate`, `teams` containing two distinct pro team IDs, `knownAt`, `startsAt`. Combine games under the same slate ID for a shared lock. |
| `roster[]` | `playerId`, `team`, `positions`, `active`, `effectiveAt`, `knownAt`. Supply updated facts for injuries, trades, or roster changes. |
| `availability[]` | `playerId`, `gameId`, scoring `role`, pregame `knownAt`, `probability` from 0 to 1, and pitcher `usage` of `starter` or `relief`. Pitchers and goalies require this evidence in snapshot mode. |
| `outcomes[]` | `playerId`, `gameId`, `seasonYear`, `role`, `playedAt` when the game ended, `knownAt` when the box score became available, normalized `stats`, and optional `teEligible` and `started`. Earlier-season outcomes feed draft forecasts. |
| `positions[]` | Optional dated `LISTED` or MLB `FIELDING` evidence with `playerId`, `code`, `seasonYear`, `effectiveAt`, and `knownAt`. Fielding adds `gameId` and `started`. |

### Archived CSV diagnostics

The CSV path reads the original files and emits a report without writing PostgreSQL records. NFL logs are joined to the nflverse schedule for game dates and kickoffs. The other logs supply historical game dates. CSV runs assume fixtures were known before draft, publish box scores after a two-calendar-day lag, and use previously published team assignments. MLB and NBA position lists come from the preceding season. Pitcher and goalie availability is estimated from prior appearances and rest. These are explicitly labeled historical proxies. [nflverse schedule dictionary](https://nflreadr.nflverse.com/articles/dictionary_schedules.html)

The full replay read 1,746,957 source rows and ran 44 sport-seasons, including four labeled partial and five labeled COVID-disrupted. The remaining 35 were unverified. The report quarantines all 186 NFL rows without athlete IDs by source line. The 2016 NBA and MLB archives lack preseason position evidence, so those runs earned no lineup points. Postgres smoke tests imported 1,268 representative rows separately. The 56 V9 coefficients remain unchanged, and the 0.5% balance target still requires a sealed holdout with verified data.

Typecheck, lint, production build, 91 unit tests, seven PostgreSQL integration tests, and five production Chromium tests passed. The PostgreSQL schema matches the existing migrations.

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
