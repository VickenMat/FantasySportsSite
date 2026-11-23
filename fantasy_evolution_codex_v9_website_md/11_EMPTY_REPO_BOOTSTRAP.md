# Build a website from an empty folder

## Stack selection
Use **Next.js App Router + TypeScript + Tailwind CSS**, PostgreSQL, Prisma, Auth.js (or equivalent maintained session library), Zod, Vitest, Playwright, Docker Compose. Node LTS and npm. No paid SaaS required for local development. Use server-side authorization and secure password hashing; never hardcode secrets. If an install tool has changed, select its currently supported equivalent and document it.

## Bootstrap commands (macOS/Linux shell, from project root)
```bash
pwd
git status || git init
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias '@/*' --use-npm
npm install prisma @prisma/client zod next-auth bcryptjs
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom playwright @playwright/test tsx
npx prisma init
```
If `create-next-app` refuses a nonempty directory, scaffold in a temporary sibling folder and copy **only generated application files** into the repository without overwriting specs or Git metadata. Do not delete these Markdown files.

## Infrastructure
Create `docker-compose.yml` for PostgreSQL 16+ with named volume and health check. Create `.env.example` documenting `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, optional ingestion provider keys. Use a local `.env` that is gitignored; never commit secrets. Configure Prisma migration scripts, `npm run dev`, `npm run build`, `npm run test`, `npm run test:e2e`, `npm run db:seed`, and `npm run worker`.

## First runnable milestone
`docker compose up -d`, install dependencies, `npx prisma migrate dev`, `npm run db:seed`, `npm run dev`. Verify `/` shows a styled Fantasy Evolution landing page, `/sign-in` authenticates, `/dashboard` requires a session, `/health` reports database connectivity, and the CI pipeline builds and tests. Do not proceed until these pass.

## Repository layout
```text
src/app/                   # routes and server components
src/components/            # accessible reusable UI
src/lib/                   # auth, db, permissions, validations
src/server/                # league/draft/roster/score services
src/workers/               # ingestion, scoring, waivers, backtests
src/scoring/               # pure deterministic sport scoring rules
prisma/schema.prisma       # database
prisma/seed.ts             # seed demo league and players
tests/unit/                # golden statline scoring tests
tests/integration/         # DB/API tests
tests/e2e/                 # browser tests
docs/                     # these specifications
.github/workflows/         # build, lint, test CI
```
