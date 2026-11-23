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

## Milestones

The [V9 start guide](fantasy_evolution_codex_v9_website_md/00_CODEX_START_HERE.md) and [milestones](fantasy_evolution_codex_v9_website_md/15_IMPLEMENTATION_MILESTONES.md) define the build order. The preset seeded in M0 is experimental. The 0.5% balance target is pending sealed holdout validation.

- [x] M0 · Local website, PostgreSQL, authentication, demo league, and verification workflow.
- [ ] M1 · Canonical players and games, import validation, deterministic scoring, score ledger, and golden tests.
- [ ] M2 · Create and join leagues, commissioner settings, and configurable dynasty/redraft seasons and starter arrays.
- [ ] M3 · Drafts, rosters, bench and IR, lineup eligibility, and pregame locks.
- [ ] M4 · Matchups, standings, waivers and FAAB, trades, transaction audit, and score corrections.
- [ ] M5 · Four-sport ingestion, data coverage, and season completeness.
- [ ] M6 · Time-aware simulation and optimization. Import the original historical datasets and pregame enrichment, freeze candidates before the 2025 sealed holdout, and report the observed spread.
- [ ] M7 · Release hardening, performance and accessibility review, recovery, and deployment.

## Landing artwork

The [landing image](public/arena-hero.webp) was created with the built-in ImageGen tool.

> Use case: ads-marketing. Create a widescreen editorial hero photograph for the Fantasy Evolution multi-sport website. A single panoramic composition with four fictional adult athletes stepping forward on the RIGHT two-thirds: a helmeted American football player cradling a ball at center, a basketball player holding an orange ball just to his left, a baseball batter with bat behind to his right, and a helmeted ice hockey player with stick on far right. Medium-wide thighs-up composition, fresh distinct faces, believable hands, unbranded charcoal and muted navy uniforms. Overhead cool blue arena and stadium lights, black midnight navy field, a few electric blue light shafts and subtle atmospheric haze, dramatic high contrast realistic commercial sports photography, fine grain. Dark quiet left third for a typography overlay and dark bottom where it blends into a dark blue page. Use a unified camera and stage, no borders or panels. No text, numbers, brands, watermark, emblems, logos, or typography. Landscape 1536 by 1024.
