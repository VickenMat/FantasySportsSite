# P0 worker reliability remediation

The blocked draft is `34d283ce-50a3-4317-9641-b8e860d726c0`, League1, Franchise 2 (`89f4db3e-f58a-424f-a0df-957d1fd6243c`), NBA pick 11. Its NFL sport roster has 14 BENCH occupants against a configured limit of five. An unfinished roster with empty starter slots is allowed; the existing overflow is an actual violation. No existing player was moved or released by remediation.

Per-pick journals now use PostgreSQL session advisory locks scoped to database/schema/job. They prevent concurrent execution and allow RUNNING records to recover when their original process no longer owns a lock. Gameplay validation failures persist BLOCKED with an explanation and a one-minute recheck. Other failures use capped exponential backoff. Commissioner draft pages show the corrective action. Healthy drafts continue independently.

Gameplay capture, waiver leagues, drafts, finalization leagues, expiry, computer lineups and cleanup run as isolated jobs. One failing task no longer aborts later tasks. Journal COMPLETE records remain idempotent. The draft-timer has exclusive database ownership, heartbeat/error reporting and backoff for infrastructure errors.

Health reports application/database availability separately from worker freshness, failures and active blocked picks. Operational degradation returns HTTP 503. A legal roster correction resumes automatic processing at the next recovery check; manual pick progression makes the old blocked journal historical rather than a current health block.

Development startup claims a process lock, probes port 3000 before launching workers, fixes Next to port 3000 and sends shutdown signals only to process groups it spawned. Duplicate startup was verified to exit 1 without starting children. Stale startup locks fail with explicit recovery instructions.

Live verification: zero unexpected reloads or browser errors over 120 seconds simultaneously on landing, Dashboard and an existing league page. New gameplay ticks completed and the illegal roster remained blocked without one-second error logging. Fixtures verify blocked/healthy coexistence, correction recovery, concurrent ownership, backoff, stale RUNNING recovery and downstream expiry processing.

Durable backup: `/Users/vicken/Developer/PrivateBackups/FantasyEvolution/fantasy_evolution_pre_m4_22_20261125.dump`; containing directories mode 700, file mode 600. SHA-256 `c5b3c50fcd6510bb9a16a539147ac8546788b9c470e498a39da4306565b2a04a`. Original temporary backup retained.
