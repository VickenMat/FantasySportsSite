# M3.5 gameplay, security, and scalability report

Date: November 23, 2026

## Delivered gameplay

- Persistent, configurable draft clocks with queue-first automatic picks, commissioner pause and resume, reconnect recovery, and verified snake order for league sizes 4 through 16.
- PostgreSQL-backed roster and lineup changes with explicit position eligibility, game-start locks, free-agent acquisition, ordered FAAB waivers, and an append-only transaction record.
- Trade proposals with configurable expiry, acceptance, rejection, cancellation, ownership revalidation, roster-limit checks, and atomic processing.
- Batched matchup recalculation, deterministic standings tiebreakers, configurable playoff fields, and seeded playoff rounds.
- Responsive league navigation for overview, team, players, draft, matchups, standings, waivers, trades, settings, historical analysis, and UBP V9 scoring.

## Authorization and security review

| Surface | Enforced rule |
| --- | --- |
| League reads | Authenticated league membership is required. |
| Team name, lineup, adds, drops, and claims | The authenticated member must manage the target fantasy team. |
| Draft selections | The draft must belong to the route league. The current manager, a computer team, or an expired system timer may select. |
| Draft pause, resume, schedule, scoring recalculation, playoffs, invitations, and settings | Commissioner role is required in the target league. |
| Trade proposal | The proposer must manage the source team and the recipient must be in the same league. |
| Trade response | Only the recipient manager can accept or reject. Acceptance rechecks every asset inside the transaction. |
| Score ledger | Authentication plus target-league membership is required. Results are paginated. |

Better Auth keeps scrypt password hashes and PostgreSQL sessions. Password reset tokens expire after 30 minutes and a successful reset revokes existing sessions. Chromium verified delivery through Mailpit, reset, revocation, and sign-in with the replacement password. Authentication and gameplay mutations use hashed, PostgreSQL-backed rate-limit buckets. Security headers deny framing, prevent MIME sniffing, apply a strict referrer policy, and remove the framework disclosure header. Secrets remain server-only environment variables. Prisma Studio is not exposed by a route or production script.

`npm audit` reported zero known vulnerabilities across 677 dependencies. `npm outdated` listed only newer major lines for `@types/node`, dotenv, ESLint, lucide-react, React, React DOM, and TypeScript. They were not adopted without a compatibility migration. Prisma remains on 7.10.1 with the scoped Effect override established during the dependency remediation phase.

## PostgreSQL and query work

- Serializable transactions protect draft selection, free-agent acquisition, trade acceptance, and waiver awards.
- Unique constraints prevent the same player from being drafted twice or owned by two teams in one league.
- Draft status and clock, league status and sport, membership role, matchup period and playoff round, trade status and expiry, and rate-limit expiry have supporting indexes.
- Player-pool reads use count plus bounded `skip` and `take` pagination.
- Matchup recalculation fetches the period roster and immutable ledger graph once, builds team totals in memory, and writes the bounded matchup set. It does not issue a ledger query per team.
- Waiver processing preloads affected teams and existing ownership before applying ordered claims.
- The connection pool defaults to 10 and accepts a deployment-specific `DATABASE_POOL_MAX` from 1 through 50.
- Historical import, simulation, audit, and scoring recalculation stay in operator workers and do not execute in gameplay request paths.
- The fantasy transaction worker uses a unique minute key. Two invocations in the same minute produced one completed run and one idempotent skip.

No application cache was introduced. The measured reads were database-bound and correct under the configured pool, while authentication password hashing was the dominant bottleneck. Caching authentication or mutable gameplay responses would add invalidation risk without addressing that result.

## Reproducible performance results

The command below exercised a local production build on `127.0.0.1:3200`, local PostgreSQL, Node 24.8.0, and an application pool cap of 20. Synthetic users, leagues, sessions, players, and transactions were removed after the run.

```bash
DATABASE_POOL_MAX=20 npm run test:load -- \
  --base-url http://127.0.0.1:3200 \
  --levels 100,500,1000 \
  --output reports/load-m3-5.json \
  --timeout-ms 30000
```

| Scenario | Users | p95 ms | Throughput req/s | Unexpected errors |
| --- | ---: | ---: | ---: | ---: |
| Authentication | 100 | 2,254.97 | 44.09 | 0 |
| Dashboard | 100 | 374.10 | 265.55 | 0 |
| Player search | 100 | 208.82 | 473.14 | 0 |
| Matchups | 100 | 190.91 | 515.35 | 0 |
| Standings | 100 | 151.82 | 650.52 | 0 |
| Authentication | 500 | 9,220.51 | 54.19 | 0 |
| Dashboard | 500 | 907.76 | 544.68 | 0 |
| Player search | 500 | 682.81 | 721.20 | 0 |
| Matchups | 500 | 606.16 | 805.11 | 0 |
| Standings | 500 | 526.68 | 930.53 | 0 |
| Authentication | 1,000 | 18,692.50 | 53.46 | 0 |
| Dashboard | 1,000 | 2,018.89 | 488.03 | 0 |
| Player search | 1,000 | 1,260.41 | 777.36 | 0 |
| Matchups | 1,000 | 1,177.47 | 826.08 | 0 |
| Standings | 1,000 | 1,099.13 | 888.21 | 0 |

PostgreSQL client connections peaked at 22 during the read scenarios and 25 during the mutation scenarios. Those totals include the 20-connection application pool plus the load runner, connection sampler, and administrative connections.

Mutation contention is limited to the maximum supported league size of 16 managers. The draft and direct-acquisition scenarios each produced one HTTP 200 and fifteen expected HTTP 409 conflicts. All 16 waiver claims returned HTTP 200, and the ordered waiver processor completed in 17.34 ms. The JSON report counts non-2xx responses as errors, so those 409 totals are expected safety outcomes rather than lost or corrupt operations.

These local measurements do not establish production scalability, geographic latency, multi-instance behavior, or managed-database limits. Authentication is CPU-bound and requires capacity planning before production. A later deployment test should measure CPU saturation, pool wait time, database CPU and I/O, and latency across multiple application instances.

## Verification

- TypeScript and generated Next.js route types passed.
- ESLint passed.
- 108 unit and import validation tests passed.
- 10 PostgreSQL integration tests passed.
- 6 Chromium workflows passed.
- The production build passed and emitted every expected route.
- Two additive Prisma migrations applied without resetting historical data.
- The background job completed once and skipped the duplicate same-minute invocation.
- `npm audit` reported zero vulnerabilities.
- The load harness completed 19 scenarios and left zero synthetic users, leagues, or mutation players.

## Evidence boundaries and next work

UBP V9 remains unchanged and experimental. V10 remains inactive. Historical simulations are reconstructed unless their source evidence independently proves what was knowable before each decision. The 0.5% cross-sport target remains unverified.

Defensible calibration still needs timestamped preseason ranks or projections, injury and inactive reports, team depth charts and roster transactions, MLB announced starters and rotations, NHL starting goalies, game postponements, position eligibility rules as known at the time, and timestamped waiver availability and manager knowledge. Candidate coefficients must be frozen before a sealed holdout is scored.

Recommended next work is a production-like multi-instance deployment test, a real scheduler with alerting and retry observability, database backup and restore rehearsal, authoritative live availability feeds, and expanded accessibility coverage before public deployment.
