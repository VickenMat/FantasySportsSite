# Waiver query and accepted NBA team-ID bridge review

After the approved FINAL-only bootstrap, populated NHL Waivers exposed a90-second timeout. Read-only `EXPLAIN` on accepted player A. Akhtyamov identified two costs: full professional game projections ran before narrowing to the athlete, and completion receipts compared indexed UUID columns as text.

The implementation now materializes a conservative candidate-game set first: direct player statistics, accepted MATCHED historical crosswalks, explicit game availability links and **all** historical team-target receipt versions. Coarse team candidates do not discard old seasons, rejected/retracted/expired receipts or older LIVE/SUSPENDED games. The original full affiliation/as-of/retraction/expiry predicate remains authoritative after candidate reduction. Availability only broadens candidates; it does not independently satisfy the pre-existing waiver membership predicate.

Completion receipt lookups cast only the JSON reference through a guarded canonical-UUID CASE, retaining the indexed UUID column. Malformed generic source records fail closed without a cast exception. No migration or timeout increase is required.

The first candidate-only rewrite reduced estimated cost but still rescanned thousands of professional observations inside each candidate's temporal membership branch. It also left the copied schema without `pg_statistic` data. The final query materializes the player's complete membership-observation superset once, admitting every historical receipt version/outcome before applying the unchanged per-game temporal predicate. This removes repeated whole-observation scans without discarding expired/retracted/old-season candidates.

Final populated-copy performance **passed** under the unchanged10-second statement limit:

| Query | Original development estimate | Final populated-copy estimate after statistics | Actual EXPLAIN ANALYZE execution |
| --- | --- | --- | --- |
| Pending completion hold |600,565,261.78 |14,266.59 |**7.228ms** |
| Latest completion hold |72,331,892.83 |6,322.34 |**4.785ms** |

The copy contained **57,519 games**, **188,156 statistical rows** and **17,883 observations/17,883 decisions** by verified row counts. PostgreSQL's post-ANALYZE `reltuples` estimate for statistics was188,158; it is not an exact row count. Cold-copy metadata had `reltuples=-1`, `relpages=0` and no prior analyze for the principal tables. Its completion plan cost157,474.26 and generated283 JIT functions. After target-only statistics refresh, neither measured query used JIT. JIT itself remained enabled; no timeout, semantics or database-global setting changed.

All populated-copy verification modes now refresh planner statistics for the isolated target after original-row preservation, foreign-key and drift checks, so standalone population/browser commands do not benchmark a newly bulk-loaded schema with missing statistics. When the performance flag is used, diagnostics retain the cold plan before refresh and save per-query plans incrementally before execution. The measured copy verified **89 original application tables**, **196 foreign keys**, **28 existing migrations**, no pending migration and empty Prisma drift. Only disposable-schema planner metadata changed; development was a READ ONLY source.

Ignored evidence is retained in `data/provider_previews/query_audits/waiver-holds-cold-copy.json`, `waiver-holds-after.json`, `/private/tmp/m5-waiver-instrumented-popcopy.log` and `/private/tmp/fantasy-pending-migration-verification.json`. The audit allows ANALYZE execution only behind the isolated-schema guard and retains its10-second timeout. Parent-owned full regression and four-sport/browser acceptance remain separate from these measured query timings.

The same read-only audit found all30 native NBA↔ESPN team pairs in already accepted V5 facts: a MATCHED native archive game supplies an explicit native HOME/AWAY participant ID, and its accepted same-game V5 observation supplies the corresponding numeric ESPN side ID. The read model requires COMPLETE `schedule-v5-1` batches, exact canonical/archive/schedule IDs, matching sport/season, source knowledge as of the query and a conflict-free bijection. It never uses name, abbreviation or calendar similarity or promotes an ignored crosswalk file.

Identity-bridge knowledge is separate from team-affiliation time. A waiver query may use an accepted explicit identity bridge known now to interpret team affiliation already known before the game. Snapshot membership queried at the operational lock still cannot see a bridge learned later. Future game mutation locks and `professionalGamePlayers` use the same accepted numeric bridge; medical designation and fantasy eligibility remain independent.

Independent review confirmed that the coarse set preserves the previous direct/stat/crosswalk/team paths and older LIVE/SUSPENDED logic. Three added isolated cases exercise required accepted bridge despite matching names/codes, late bridge knowledge plus pregame affiliation/retraction, and ambiguous accepted mappings that must fail closed. No development rows, accepted V5 files, original fantasy-week assignment, scoring weights or policy fingerprints changed.
