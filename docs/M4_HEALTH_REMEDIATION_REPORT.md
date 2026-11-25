# M4 health remediation checkpoint — November 25, 2026

M4 is not complete or ready for full acceptance. This checkpoint resolves P0 worker failure propagation, restores startup safety, reconciles schema drift, corrects fantasy/professional deadline separation, improves roster/recap views, introduces read-only historical analytics and implements the keeper cost/paid-round core. Financial dynasty, rookie execution, advanced trading and competitive rollover remain substantial work.

## Repository and runtime

Baseline `51411d8`; verified descendants include `440c769` (P0) and `0bb86b9` (schema alignment). Ordinary Git synchronization is authorized in AGENTS.md. Protected screenshots remain uncommitted; tests now write screenshots to their own output directories.

Start infrastructure with `docker compose up -d`, then keep `npm run dev:all` running. It owns web port 3000, the draft timer and minute gameplay ticks. Duplicate startup exits safely before starting children. The stack stops only its own process groups. Live pages had zero unexpected navigations or JavaScript errors during a 120-second landing/Dashboard/existing-league observation.

Both workers now run successfully, but operational health correctly remains HTTP 503 because League1's NBA pick 11 is blocked by Franchise 2's existing NFL bench overflow: 14 occupants / five slots. The user must make legitimate roster corrections; no roster was silently changed. The blocked pick checks recovery once per minute and no longer emits errors every second. Other drafts and worker tasks continue.

## Database, backups and drift

22/22 migrations applied; none added or deployed during remediation. Prisma now matches the SQL defaults/index names already created by the accepted migrations. Development and a fresh disposable schema both report no difference. This required schema description corrections rather than database DDL.

Durable pre-upgrade backup: `/Users/vicken/Developer/PrivateBackups/FantasyEvolution/fantasy_evolution_pre_m4_22_20261125.dump`; SHA-256 `c5b3c50fcd6510bb9a16a539147ac8546788b9c470e498a39da4306565b2a04a`. Directories 700, file 600. Original temporary backup retained.

Separate pre-classification backup: same directory, `fantasy_evolution_pre_fixture_classification_20261125.dump`; SHA-256 `a7baa72d1e9744c98847783667806cceb111dd3338e29c656be81dfd6ba2bdf7`.

The user explicitly approved 3,388 fixture classifications after a read-only exact-target dry run. Applied ID-set hash `ad2140ed00d822115a09579a1b813976fc347deae97260b9c278a872951bb2f9`; counts NFL 33, MLB 33, NBA 3,311, NHL 11. The update set only Player.isSynthetic. Repeat dry run: zero candidates.

All 8,042 player identities remain. Non-flag player hash `3eaf8050bbddf28d33be155862114692` matches before/after; all 107,312 stat rows retain hash `e9bc246abd94be407b0712da411b4b42`; all 47 roster rows retain hash `01435df7d89cf155142df71fdad371bf`. All 48 assignment events remain. No duplicate active ownership or duplicate provider identity groups, no invalid foreign keys, 22 enabled append-only triggers, and no negative/ledger-inconsistent FAAB balances were found. Operational job/compliance journals legitimately grow.

All five V5 hashes and all 56 V9 rules are preserved. V10, contracts and normalization remain inactive.

## Data reconciliation

The prior 8,033-real-player estimate was based on flags and included legacy fixtures. Accepted archive identities now total 4,645: NFL 1,827, MLB 1,472, NBA 474 and NHL 872. Fixture records and their history remain preserved.

The four archives contain 1,746,957 rows across 2016–2026 (NBA/NHL through 2026–27). Development has 103,801 accepted 2026-season archive stat rows plus 3,511 fixture revisions. MLB/NBA files have no physical position columns; no local repaired file was found under data/. Current real-player observed position coverage is NFL/NHL 100%, MLB/NBA 0%. Current authoritative active/rookie/injury/retirement status remains unavailable.

Historical points are derived without inserting competitive ledger events. Development read-only checks found complete totals for imported appearances of NFL 1,827/1,827; MLB 1,337/1,472; NBA 474/474; NHL 41/872. Missing inputs or ambiguous scoring roles keep totals N/A. No projection was fabricated. All existing competitive ledger rows are preserved; real-player persisted ledger coverage is zero. See PLAYER_DATA_AUDIT.md for exact provenance and scope.

## Checklist accounting

The former 48 rows contained 17 checks: 16 implemented checkpoint mechanisms and one intentional contract-disable safeguard. The restored M4.1 section is derived from its existing report, not new product rules.

| Milestone | Checked | Unchecked | Status |
| --- | ---: | ---: | --- |
| M4.1 | 5 | 1 | Source foundation verified; full fantasy-window configuration remains partial |
| M4.2 | 8 | 1 | Relative calendar binding and NFL windows improved; finalization/placement completion remains |
| M4.3 | 6 | 2 | Roster/waiver core verified; auction initialization and lifecycle resets incomplete |
| M4.4 | 2 | 3 | Keeper cost/round core added; rookie execution, pick transfers/consumption and full keeper history acceptance remain |
| M4.5 | 1 | 7 | The check is intentional contract inactivity; salary/Vickrey/dead-cap implementation remains |
| M4.6 | 0 | 6 | Basic two-party player exchanges work; advanced assets/review/multi-party model incomplete |
| M4.7 | 0 | 6 | Assignment/audit/historical transition mechanisms partial; competitive lifecycle incomplete |
| M4.8 | 0 | 6 | Supported checkpoint verification passes; complete M4 acceptance does not |
| Total | 22 | 32 | 54 rows: 21 implemented mechanisms plus one intentional-disable check |

M0–M3 foundations remain implemented. M4 is partial. M5 data completeness, M6 validated balance/simulation and M7 release readiness are not complete. Passing synthetic fixtures is not production data readiness.

## Website request reconciliation

| Request | Status |
| --- | --- |
| Account page / editing / explicit anonymizing deletion | Supported success path browser-verified; owner gate exists; broader error/race acceptance remains |
| Authentication-aware general landing and brand link | Working; session preserved |
| Improved Overview | Working |
| Remove obsolete overview text/scoring preset | Working |
| Rookie picks in My Team | Working; below IR |
| Editable franchise name | Working |
| Position selection/deselection | Working |
| Separate starters, sport bench, IR, universal bench | Implemented; universal bench follows IR/picks |
| Remove standalone roster-actions/identity panels | Working |
| Consistent canonical identity/positions/available points | Shared historical analytics working; position authority/data still incomplete |
| Draft access through Settings/contextual actions | Working |
| Recap index by season and sport | Implemented; immutable draft board retains original franchise |
| Visual board, identifiers, ownership and colors | Traditional snake supported; auction prices unavailable until salary implementation |
| Immediate persistent round-robin | Working; initial calendar binding verified; new-cycle planning remains lifecycle work |
| Waivers runtime | Fixed; supported flows browser-verified |
| Conditional/dropdown Settings | Partial; supported enums use selects and bounded counts use number controls |
| Readable scoring names | Working |
| Remove Role column | Working |

## Approved gameplay decisions

Short-draft keeper fallback now operates in the cost service and persisted selection path. Costs escalate, resolve conflicts toward earlier rounds, enforce three-year age, and remove the paid round from the next draft using a stored pick-location snapshot. Comprehensive transfer/drop-reacquisition history acceptance is still pending.

Salary-dynasty pick prohibition, universal cap transfers, non-playoff weighted lottery, elimination-round placement, mandatory over-cap cuts, self-reacquisition dead-cap credit and persistent release floors remain approved requirements with incomplete mechanisms. No salary league is exposed as working. No decision gate was filled with an invented default.

Remaining gates: lottery weights/selected positions, universal-cap deadline, same-round playoff placement tiebreaker, higher-salary repeat-release floor basis, corrective-trade classifications and normalization. External dependencies remain verified season boundaries/starts where unpublished, completion instants, eligibility/availability/retirement authority and correction publication times.

## Verification and acceptance

147 unit tests, 43 PostgreSQL integration tests and 11 standard Chromium tests pass. One opt-in live-development test is excluded from the isolated run and was not counted as a new pass. Typecheck, ESLint, Prisma validation/generation, production build, fresh deployment, schema drift checks and npm audit pass.

New fixtures cover exclusive job ownership, backoff, stale RUNNING recovery, blocked/healthy coexistence, legitimate correction recovery, downstream job continuity, operational health, exact keeper round consumption, historical correction precedence and absence of analytics ledger writes. Live stability covered the earlier P0 server with all workers. Fresh-user NFL redraft and four-sport dynasty browser workflows cover registration, second-manager joining, configuration, completed snake drafts, rosters, relative matchups, cross-sport/basic trades, release, waiver submission/cancellation and refresh persistence. A full fresh-user flow with an actual mid-test web-server restart remains additional acceptance work; worker recovery was tested separately.

Manual QA: create a two-team public NFL redraft, register/join a second manager, set one draft round, start through Settings, finish both selections, inspect My Team/Matchups, trade a player between managers, refresh, release a player, submit/cancel a waiver claim, and repeat by sport in dynasty. Restart with Ctrl+C then npm run dev:all and verify saved state. Use dedicated QA leagues; do not repair League1 by automated roster changes.

Next dependencies: full fantasy calendar configuration and cycle binding, rookie execution/pick consumption/transfers, remaining keeper ownership acceptance, salary ledgers/Vickrey/dead cap/cap transfers, advanced trading, independent rollover/finalization/administration, then complete M4.8. Future development migrations or substantial backfills require separate approval.
