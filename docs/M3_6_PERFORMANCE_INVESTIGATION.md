# M3.6 performance investigation and M3.9 recommendations

The November 23, 2026 local load run is reproducible from `reports/load-m3-6.json`. It launched each level as one simultaneous burst, not a controlled arrival-rate or soak test. Each level performed a fresh authentication burst followed sequentially by dashboard, player-search, matchup and standings bursts for the same 100, 500 or 1,000 isolated users. Mutation contention used 16 managers, the maximum supported league size. The application pool was warmed to 20 connections and the runner sampled PostgreSQL client-backend counts every 25 ms.

## Findings supported by measurements

| 1,000-request burst | p95 | Throughput | Errors | Peak sampled DB clients |
| --- | ---: | ---: | ---: | ---: |
| Authentication | 39.19 s | 25.50/s | 0 | 24 |
| Dashboard | 6.80 s | 145.68/s | 0 | 22 |
| Player search | 3.31 s | 287.04/s | 0 | 22 |
| Matchups | 4.61 s | 209.54/s | 0 | 22 |
| Standings | 3.44 s | 282.53/s | 0 | 22 |

Authentication throughput stays near 20–26 requests/second from 100 through 1,000 while burst latency grows from 4.27 to 39.19 seconds. This shape is consistent with CPU-bound password verification queueing; it is not evidence that hashing should be weakened. Read throughput is higher, but burst latency grows as work queues behind the finite Node/PostgreSQL capacity.

The pool reached its configured application maximum during the run; totals of 22–24 include the sampler and other clients. The harness records connection counts, not adapter checkout timestamps, so it cannot quantify pool wait duration. It also did not sample server CPU, resident memory, garbage collection or Node event-loop delay. Those values are **unknown**, not zero.

The dashboard implementation performs one bounded Prisma call selecting memberships, minimal league fields and sport tags. There is no application loop issuing a query per league, so no source-level N+1 was found. Prisma may split relation loading into more than one SQL statement; exact statement count and server execution time were not instrumented in this run. Matchup recalculation similarly loads matchups and roster/ledger relations in bounded queries rather than per-team queries. PostgreSQL slow-query attribution was unavailable because `pg_stat_statements` and per-request query tracing were not enabled for the recorded run.

## Burst versus sustained use

The report demonstrates that all submitted local bursts eventually completed within the 120-second ceiling. It does not represent realistic think time, a fixed requests-per-second arrival rate, session reuse over hours, autoscaling, network latency, TLS, a managed database, or multiple application instances. A simultaneous 1,000-login burst is materially harsher than 1,000 signed-in users navigating intermittently, while it says less about memory leaks and connection stability than a sustained soak test.

## M3.9 recommendations

1. Add server-side `perf_hooks.monitorEventLoopDelay`, process CPU/RSS/heap sampling, and adapter pool checkout/queue instrumentation with scenario timestamps. Keep telemetry disabled or low-cardinality by default.
2. Enable `pg_stat_statements` in an isolated performance database. Capture calls, mean/p95 execution, rows and shared-block activity before/after each scenario; use `EXPLAIN (ANALYZE, BUFFERS)` for identified reads.
3. Run separate workload models: instantaneous login burst, ramped login arrival rate, authenticated navigation with realistic think time, and 30–60 minute soak. Report host CPU/memory and database limits so results are reproducible.
4. Keep secure password hashing. Bound authentication concurrency at the edge/application worker layer, return backpressure predictably, preserve rate limits, and evaluate horizontal capacity only with measured multi-instance tests.
5. Instrument dashboard SQL statement count before adding cache. If query time is low but queue time is high, tune pool/application concurrency together; increasing connections alone can overload PostgreSQL.
6. Consider short-lived user-scoped caching only after measurement shows repeated identical reads and after defining invalidation for membership, roster and transaction changes. Do not cache authorization decisions independently of current membership.

No production-capacity claim follows from the M3.6 report. The next performance gate should define latency/error objectives and test hardware before optimization.
