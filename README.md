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
npm run fantasy:process
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
- [x] M2 · Create and join leagues, commissioner settings, and configurable dynasty/redraft seasons and starter arrays.
- [x] M3 · Persistent snake drafts, roster ownership, bench management, and recorded-position lineup validation. Authoritative live availability feeds remain release work.
- [x] M3.5 · Draft clocks and reconnects, commissioner controls, trades, playoff seeding, authorization and rate limiting, query hardening, and measured local load tests.
- [ ] M4 · Matchups, standings, waivers and FAAB, trades, transaction audit, and score corrections.
- [ ] M5 · Four-sport ingestion, data coverage, and season completeness.
- [ ] M6 · Time-aware simulation and optimization. Import the original historical datasets and pregame enrichment, freeze candidates before the 2025 sealed holdout, and report the observed spread.
- [ ] M7 · Release hardening, performance and accessibility review, recovery, and deployment.

## M2.5 Parquet validation and calibration controls

The local `Datasets/` directory remains ignored. Run the memory-bounded audit against the four discovered files with:

```bash
npm run data:audit -- --datasets Datasets --output reports/m2-5-analysis.json --database
npm run db:import:parquet -- --sport NFL --file Datasets/nfl_2016_2026_final.parquet --validate-only
npm run db:import:parquet -- --sport NFL --file Datasets/nfl_2016_2026_final.parquet --allow-rejected
```

Parquet reads are bounded by `--batch-size`, defaulting to 25,000 rows. Imports reuse the M1 canonical normalizer and transactional persistence path. They retain raw cells, append corrections, quarantine invalid records, fingerprint the complete file with SHA-256, and return an existing batch for repeated bytes. NFL import requires `--allow-rejected` after reviewing its 186 missing-player-ID records. A matching archive row count does not imply that all rows exist in PostgreSQL.

The tracked [M2.5 analysis](reports/m2-5-analysis.json) records physical schema, metadata, fingerprints, per-season quality, quarantine reasons, evidence coverage, chronological split labels, player-game V9 totals, positional contributions, and top players. It read 1,746,957 rows and found no duplicate game-player-role records. The four files contain final results but no independently timestamped pregame ranks, injuries, rotations, or waiver knowledge. NBA and MLB also lack sufficient position evidence for a defensible replay. Fixture-count agreement is therefore reconstructed and remains `UNVERIFIED`.

The V9 coefficients and scoring engine are unchanged. The report leaves fantasy-team means and balance spread empty because those values would require defensible pregame decisions. The 0.5% target is **not verified**. The V10 framework enforces versioned integer tenths, chronological training-only optimization, and deterministic hashes, but no candidate was optimized, selected, published, or activated.

Authenticated users can inspect this evidence at `/analysis`. Import and calibration commands remain operator-only and are not exposed through the browser.

## M3 playable leagues

Create a single-sport league at `/leagues/new`. The browser flow supports four to sixteen teams, secure single-use invitations, commissioner permissions, custom team names, historical replay labeling, starter and bench configuration, UBP preset selection, and computer-filled demonstration leagues. League pages provide the player pool, My Team, a persistent snake draft board and queue, matchups, standings, FAAB waivers, and settings.

Draft picks and waiver awards use serializable PostgreSQL transactions. Unique indexes prevent a player from being drafted twice or appearing on two rosters in the same league. Draft refreshes retain state, commissioners can exercise an absent manager's queue-driven auto-pick, and completing the final pick activates the league. Add, drop, draft, and waiver activity is retained in the transaction audit.

Matchups use the latest entry in the immutable versioned score ledger for each rostered player and scoring period. Commissioners can recalculate after statistical corrections. Historical replay periods must be advanced explicitly and are never presented as live results. Due waiver claims can be processed from the page or a scheduler can invoke:

```bash
npm run fantasy:process
```

Historical demo play requires importing the reviewed local Parquet source for the selected sport. The repository does not bundle those files or pretend the eight seeded presentation players form a complete historical pool.

### Current limitations

- The Parquet sources do not establish verified pregame evidence, so sealed held-out cross-sport balance evaluation and V10 model selection remain blocked on better source data.
- NFL Parquet rows do not contain game dates. Historical replay still requires a separately timestamped schedule feed before NFL lineup evidence can become reconstructed or verified.
- Lineup eligibility uses the latest stored observed positions. A production feed must create dated position and availability evidence before live locks can be treated as authoritative.
- The local scheduler command must be invoked by cron or another deployment scheduler. No production deployment or background scheduler was configured in this milestone.

## M3.5 gameplay completion and hardening

Drafts now use a persistent PostgreSQL clock with configurable 15-to-600-second picks, queue-first automatic selections, commissioner pause and resume controls, and state restoration after reconnect. Snake order is verified for every supported league size from 4 through 16. Roster changes, lineup eligibility, free-agent acquisition, waivers, trade proposal and response, matchup calculation, deterministic standings, and playoff seeding all enforce league or team authorization in the service layer.

Concurrent draft picks, direct acquisitions, accepted trades, and waiver processing use serializable transactions and database uniqueness constraints. The gameplay worker claims a minute-specific PostgreSQL job key, so a scheduler can safely invoke it more than once per minute. Configure a deployment scheduler to run:

```bash
npm run fantasy:process
```

Player search uses server-side pagination. Matchup recalculation loads roster, game, and ledger data in bounded relation queries instead of querying once per team. The PostgreSQL pool defaults to 10 connections and can be capped with `DATABASE_POOL_MAX`. Keep analytical imports and simulation commands in workers rather than request handlers.

Authentication and mutation routes have persistent rate limits. Security headers disable MIME sniffing and framing, restrict referrers, and remove the framework disclosure header. Prisma Studio remains a local operator command and has no application route. The November 23, 2026 final audit reported zero known npm vulnerabilities.

The reproducible local load report is tracked at [reports/load-m3-5.json](reports/load-m3-5.json). With a 20-connection application pool, all read scenarios returned zero errors. At 1,000 concurrent isolated users, authentication p95 was 18.69 seconds, dashboard p95 was 2.02 seconds, player search p95 was 1.26 seconds, matchup retrieval p95 was 1.18 seconds, and standings p95 was 1.10 seconds. Authentication hashing is the primary measured bottleneck. Peak observed PostgreSQL client connections were 25 when the load runner and sampler were included.

The supported-league contention run used 16 managers. Exactly one competing draft request and one competing direct roster acquisition succeeded, while the other 15 requests in each scenario received expected HTTP 409 conflicts. All 16 waiver submissions were stored and the ordered waiver processor completed. These are local measurements on one development machine and do not establish production capacity. See [the M3.5 report](docs/M3_5_REPORT.md) for the security review, test evidence, and limitations.

UBP V9 remains the immutable experimental baseline with all 56 coefficients unchanged. V10 remains inactive. The 0.5% cross-sport balance target is unverified because the archives still lack independently timestamped preseason ranks, injury and availability reports, pitching rotations, and waiver knowledge needed for defensible historical decisions.

## Landing artwork

The [landing image](public/arena-hero.webp) was created with the built-in ImageGen tool.

> Use case: ads-marketing. Create a widescreen editorial hero photograph for the Fantasy Evolution multi-sport website. A single panoramic composition with four fictional adult athletes stepping forward on the RIGHT two-thirds: a helmeted American football player cradling a ball at center, a basketball player holding an orange ball just to his left, a baseball batter with bat behind to his right, and a helmeted ice hockey player with stick on far right. Medium-wide thighs-up composition, fresh distinct faces, believable hands, unbranded charcoal and muted navy uniforms. Overhead cool blue arena and stadium lights, black midnight navy field, a few electric blue light shafts and subtle atmospheric haze, dramatic high contrast realistic commercial sports photography, fine grain. Dark quiet left third for a typography overlay and dark bottom where it blends into a dark blue page. Use a unified camera and stage, no borders or panels. No text, numbers, brands, watermark, emblems, logos, or typography. Landscape 1536 by 1024.
