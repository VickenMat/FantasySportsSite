# Database and test environment isolation

Fantasy Evolution uses three explicit PostgreSQL identities:

| Environment | Variable | Purpose |
| --- | --- | --- |
| Development | `DEVELOPMENT_DATABASE_URL` | Local interactive work and preserved owner data |
| Automated test | `TEST_DATABASE_URL` | Disposable integration, browser and load-test data |
| Production | `PRODUCTION_DATABASE_URL` | Future deployment; not used by local or CI tests |

The normal application reads `DATABASE_URL`. In local development it should equal `DEVELOPMENT_DATABASE_URL`. Database-backed test commands do not trust that inherited value: `scripts/run-in-test-environment.mjs` validates `TEST_DATABASE_URL`, requires its exact database name in `AUTHORIZED_TEST_DATABASES`, rejects equality with development or production, and then overwrites `DATABASE_URL` for the child process. It also replaces `AUTH_URL` with `TEST_AUTH_URL`. A missing URL, empty allowlist, malformed URL, unlisted name, or identity collision stops before the test command starts.

## Local setup

Create the test database once without changing the development database:

```bash
docker compose exec -T postgres createdb -U fantasy fantasy_evolution_test
npm run test:db:prepare
```

`test:db:prepare` only deploys committed migrations and runs the idempotent seed. It does not reset either database. If the disposable database must be recreated, drop and recreate **that exact allowlisted database manually after reviewing the target**; never substitute the development or production name.

Run database-backed suites with their guarded commands:

```bash
npm run test:integration
npm run test:e2e
npm run test:load -- --base-url http://127.0.0.1:3100
```

Unit tests do not require PostgreSQL. Each integration invocation creates a unique schema in the authorized test database, deploys the current migrations, and seeds the demo catalog there. Prisma model queries and raw SQL both use that schema. The launcher drops the schema when the command exits, including when a test fails. A forced termination may leave an unused schema, and later invocations each create a fresh one.

CI creates `fantasy_evolution_test` inside its isolated Compose project and prepares its default schema for workers and Playwright. Playwright uses dedicated port 3100 and refuses to reuse any existing server, preventing an old port-3000 development process from retaining its development connection. CI Mailpit is isolated with the job. Local tests use `TEST_SMTP_URL`; point it to a separate local inbox if development and test email must not share Mailpit.

Do not invoke raw `vitest tests/integration`, `playwright test`, or the load worker directly. Those bypass the fail-closed launcher. The regression suite in `tests/unit/test-environment.test.ts` covers missing configuration, exact allowlisting, inherited URL replacement, and development/production collision rejection.
