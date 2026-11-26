# M4 completion and acceptance report

M4.1–M4.8 mechanisms are implemented and verified against isolated fixtures, including every confirmed gameplay decision from the final continuation request. Production-data readiness remains explicitly deferred to M5. Missing source evidence is never represented as successful live acceptance.

The branch is `main`, based on `16b9940` and verified implementation checkpoint `853f45f`. The final synchronized HEAD is reported in the delivery message; this report is included in that completion commit. Ordinary verified changes are committed and pushed without force. The three preexisting user screenshot modifications are preserved and excluded from the commit. No production deployment occurred.

## Milestone reconciliation

| Milestone | Verified behavior |
| --- | --- |
| M4.1 | Immutable schedule provenance, independent season offsets and cycle assignments, unique game attribution, configurable source-bounded fantasy windows and matchup lengths; later boundary reconciliation records source revision, draft and rollover deadlines. |
| M4.2 | H2H round-robin/odd byes, fixed playoffs, third place/consolation, same-round elimination by original seed, cumulative scoring without H2H awards, provisional revisions, source-backed 24-hour freeze, final sport placements and overall awards/results. |
| M4.3 | Immutable individual-game starter snapshots, append-only assignments, sport/shared bench and IR compliance, no verified-offseason IR, corrective releases/movement, rolling/auction priorities, release/completion holds, sealed FAAB/reservations and independent sport/cycle resets. |
| M4.4 | Reverse finalized placement for every linear rookie round; no lottery/custom order. Official rookie evidence, configurable rounds, transferred entitlements and consumption, three-season traditional pick inventory, overflow, snake-only keeper history/cost/escalation/three-year limit and last-round fallback. Scheduled rookie preparation/queues/worker activation share the Draft center. |
| M4.5 | Sport/universal traditional and salary auctions, English draft bidding and sealed 24-hour Vickrey acquisitions, integer ledgers/reservations, queue-first automatic nomination, pause-safe timers, acquisition salaries, annual $2 increases, ceil(50%) dead cap, seven-day self cooldown/credit, decreasing floors, offseason free-agent floor removal, conserved current cap transfers/expiry and overlapping obligations. No salary-league future rookie picks. |
| M4.6 | Multi-party cross-sport players, traditional picks, FAAB, current salary cap and explicit cuts; immutable revisions/all-party same-version acceptance, configurable default 24-hour review, cancellation/veto/expiry, reservation release, per-asset/review deadlines, dynasty/redraft offseason guards, standalone current-cycle universal-cap exception, atomic revalidation/settlement/conflict invalidation. |
| M4.7 | Source-backed independent competitive rollover, dynasty/keeper retention, salary/FAAB/pick/obligation lifecycle, overlapping cycles, future immutable settings, abandoned ownership transfer, offseason archival with history retained, no midseason expansion, audited reversible score and last-pick corrections. |
| M4.8 | Unit, normal/shuffled PostgreSQL, six website gameplay journeys, general Chromium and actual server/worker restarts; Prisma/type/lint/build/security gates; populated-copy and development preservation checks; acceptance guide and external-input handoff. |

The reconciled [master checklist](M4_MASTER_CHECKLIST.md) has **60 checked / 0 unchecked / 60 total** rows. Confirmed decisions supersede older reports. Data dependencies and administrative safety boundaries are explicit in [unresolved rules](M4_UNRESOLVED_RULES.md).

## Website and draft experience

The brand opens the authentication-aware public landing page while retaining sessions. Only explicit sign-out revokes a session. Fresh two-franchise league creation and Waivers load against the migrated schema. Capacity/format/competition/historical matrices and rollback protection remain covered by integration acceptance.

Overview has responsive horizontal summaries, private invitation creation/copy, selected sport seasons and shared saved draft schedules. Dashboard includes actual league scheduling. Draft is permanent navigation; Players redirects to the consolidated Waivers browser. Canonical historical statistics support ownership/availability/position/search/score filters and sorting before pagination; known zero and unknown N/A stay distinct. Current FAAB displays use the correct sport or overlapping-cycle account and reservation balance.

Initial order is persisted random or accessible custom drag/arrows. The saved plan governs activation order, rounds, timer and UTC schedule. Room access opens exactly one hour before start, preserves queues and forbids actual acquisition during preparation. Server workers start due valid plans once; exact blockers persist with retry/backoff isolation. Start Now is an authorized development/testing shortcut that preserves every eligibility, source-boundary and financial gate. Rookie controls expose reverse-placement linear scheduling only.

New draft labels, positions, original/transferred owners and auction prices have immutable evidence. Results list recorded selections, not a later current roster. Legacy franchise labels without original evidence show the immutable franchise ID and the missing-label explanation. Audited replacements preserve the original snapshot and append their own label evidence. A corrected turn has a new timer-job generation so an old successful job cannot strand it.

## Administrative safety boundaries

Score adjustments are signed, append-only and idempotent by request ID. Compensating entries reverse adjustments without rewriting V9 inputs or captured lineups. They apply only before competitive finalization; official publication still governs the correction window and finalized results stay frozen.

Draft undo/correction supports the last reversible selection of an unfinished, paused traditional initial snake draft. Invalid replacement rolls back the undo, roster release and audit atomically. Consumed rookie entitlements, settled auction finances, locked lineups and downstream ownership/movement cannot be silently unwound. Unsupported operations explain their guard. Ordinary rookie-order customization remains prohibited.

Franchise removal archives future participation through an immutable audit event. Every included sport must have a verified offseason, competitions/championships and drafts must be finished, and at least two franchises remain. Players, reserved funds, salary/dead-cap/cap-transfer obligations and outstanding original/owned picks must be resolved first. Historical team rows, results, labels, ownership and ledger records remain. Finalized standings retain their archived participants; future scheduling uses active franchises, and rollover rejects an inherited playoff field that exceeds the reduced capacity until a future configuration is saved. Manager departure also retains franchise identity/history.

## Latest verification

- Unit: **155/155**.
- PostgreSQL: **87/87** in a new normal schema and **87/87** in a separate shuffled schema, seed `20261129`. Earlier 79-test shuffled execution also passed; two detected fixture/import-order dependencies were corrected without weakening their assertions.
- Standard Chromium: **17 passed**, one intentionally skipped development-writing opt-in test. All six requested format journeys pass. The first four use fresh registrations; keeper and rookie journeys use isolated league/evidence setup followed by website actions.
- Actual server/worker restart Chromium: **2/2**.
- TypeScript, ESLint, Prisma validation, production Turbopack build and Git whitespace validation: passed.
- Restarted development stability: **13 read-only samples over 120 seconds**, public landing 200, database connected and both workers healthy; the one known roster-blocked draft correctly keeps operational health at 503.
- Dependency security audit: **zero vulnerabilities**.
- Populated copy: **86 application tables**, **195 foreign keys**, **26 applied migrations**, no pending migration and empty Prisma diff. Source connection was repeatable-read/read-only; all copied-data work was confined to an isolated schema of `fantasy_evolution_test` and removed afterward.

See [the acceptance guide](M4_ACCEPTANCE_GUIDE.md) for exact commands and workflow mapping. Browser screenshots are disposable test output; user-owned screenshots remain untouched.

## Development preservation and migration authorization

The user approved the exact four reviewed migrations from 22 to 26. Before deployment, the supervisor was paused and a fresh verified private custom-format backup was created. All 70 original application-table fingerprints matched exactly immediately before/after deployment, and 27 append-only triggers remained enabled. No additional migration or backfill approval is pending. The subsequent populated copy also validated all current 86 tables with no drift.

Private backup: `/Users/vicken/Developer/PrivateBackups/FantasyEvolution/fantasy_evolution_pre_m4_26_20261125.dump`; SHA-256 `bc363fe67a9bbcb1c8c6c07cb4761aa83af79a3726405d5639a2f61b2352fc66`. Detailed approved SQL fingerprints are in [the migration review](M4_PENDING_MIGRATION_REVIEW.md).

Preserved development baseline: 11 users, seven leagues, 8,042 players, 107,312 player-stat revisions, 47 roster entries, three drafts, 48 assignment events, 35 score entries, 57,352 schedule observations and 52,866 crosswalks. All 56 V9 rules remain unchanged. Worker journals advance normally. Existing leagues were not converted to salary mode; no competition evidence or source dataset was fabricated, imported or backfilled. The earlier expressly approved classification of 3,388 fixture players remains separate from this work.

All five accepted V5 fingerprints match their originals, including the four Parquet schedule files and validation JSON. All eight recovered historical/schedule datasets are preserved. Four unresolved historical NBA crosswalk games remain an accepted limitation. V10, contract automation and unapproved normalization stay inactive. The original iCloud workspace and damaged recovery backup were not accessed.

## Readiness and M5 handoff

M4 is ready for fixture-backed gameplay/manual product acceptance. Authoritative production competition remains gated by external evidence. The development stack runs with `npm run dev:all` at <http://localhost:3000>, using Webpack and the existing Docker project/volume. Existing League1 roster noncompliance is preserved; its draft blocker can make `/health` report 503 while both workers remain healthy. This is not represented as a healthy live draft or silently repaired user data.

M5 should proceed in this dependency order:

1. Obtain independently verified professional season boundaries, unpublished starts and verified game-completion instants; reconcile them through the existing immutable source interfaces without restarting accepted V5 acquisition.
2. Supply sport/season-specific current positions, availability/IR, rookie eligibility and retirement evidence with effective and known timestamps. MLB/NBA verified position files remain unavailable locally.
3. Add official score-publication/correction timestamps so competitive 24-hour finalization can operate on real evidence.
4. Resolve MLB HITTER/PITCHER scoring-role ambiguity for 135 players and NHL faceoff wins, shorthanded bonuses, goalie wins and shutouts affecting 831 players. Preserve missing values as unknown.
5. Reconcile coverage against the accepted 4,645 professional players: NFL 1,827/1,827 scored, MLB 1,337/1,472, NBA 474/474 and NHL 41/872. Keep historical analytics separate from competitive ledgers.
6. Review concrete target manifests and backfill previews before requesting any necessary development import/backfill approval. Re-run isolated acceptance before activating live authoritative operation. Keep V9 and contract safeguards in place; production deployment/supervision remains separate release work.

Exact external-input details are retained in [the player data audit](PLAYER_DATA_AUDIT.md). There is no unresolved confirmed-gameplay decision requiring another clarification.
