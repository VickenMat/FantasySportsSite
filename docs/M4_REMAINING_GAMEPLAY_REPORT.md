# Remaining M4 gameplay implementation — November 25, 2026

Continuation from `577182e`. M4 remains in progress; this report does not claim all gameplay or full acceptance complete.

## Implemented continuation

Traditional dynasty rookie drafts now use one to four configurable linear rounds, default four. Reverse finalized sport placement is the default. A commissioner can supply a complete manual order with a reason or an explicit weighted non-playoff lottery. No weight or selected-position defaults are invented. The persisted draft provenance and append-only audit capture the configuration, draws, original franchise slots and pick IDs; repeated creation returns the same draft and lottery. Playoff entrants cannot enter the lottery. Current owners receive transferred entitlements, including corrections during an active draft. A consumed pick cannot transfer; its unique append-only ownership event records the selected DraftPick ID. All selection, roster and consumption changes commit together.

Verified season-specific rookie evidence is required for every rookie selection and automatic candidate. Normal drafts recheck the authoritative pre-season boundary at creation and each selection. Historical replay remains explicitly separate. Missing prior placements, current entitlements, eligibility or verified boundaries remain pending. There are no production rookie facts manufactured by this work.

Rookie overflow uses a separate non-scoring slot. It blocks ordinary acquisitions; remaining rookie selections can continue across sports only when every violation is temporary rookie overflow. Other violations, including League1's NFL bench, remain blocking. Move rookies into empty legal positions or explicitly release them. Future inventory extends three seasons at historical dynasty sport rollover, idempotently and independently; competitive automatic rollover remains open.

Keeper costs survive player trades, release/reacquisition and re-selection by the new manager. Rollover retains only selections still owned by their selecting manager; a recipient must make their own selection. Costs consume the correct next snake round, escalate, resolve conflicts earlier and enforce three years including acquisition. Existing costs and history remain preserved. Auction keeper and salary-pick prohibitions still need integration with those formats.

Historical independent sport rollover now expires pending sport FAAB bids, releases their reservations and writes one RESET ledger entry per account/season. It preserves other sports and universal cycle budgets. Universal completion resets and competitive rollover remain open.

## Website and operations

My Team shows every overflow occupant and each selected keeper's paid round. Incremental correction measures excess occupants, rather than error-message count. Settings and blocked draft messages link to a full league roster inspection page. Commissioners can explicitly release an unlocked player with a reason; releases and before/after values are permanently audited, retry-safe and visible in transaction history. No League1 player was modified.

The picks page exposes rookie startup, current entitlements, ownership history, available/consumed states and audited ownership corrections. The draft room filters verified rookies and uses the existing selection, timer and pause controls. Negotiated pick trades remain unavailable until the advanced-trade service is implemented.

The prior successful 120-second development check used Turbopack (the old `dev` command had no bundler flag). A new uninterrupted Turbopack observation also passed with no reloads or page errors. Webpack is now the default based on the user's independent reproduction; optional Turbopack commands remain. Observations overlapping source/type-generation edits are not treated as idle-stability failures. Production bundler remains Turbopack.

`npm run test:e2e:restart` runs the NFL redraft and four-sport dynasty fresh-user workflows in a private disposable schema with a separately owned web server and workers. Each workflow restarts the server and workers after draft completion, trade, release and pending waiver. Sessions, completed drafts, accepted trades and pending claims survive; requests and cancellation resume. The harness refuses development, tracks only its own child processes and tears them down.

## Verification scope

153 unit tests, 50 integration tests across 18 files, 12 standard Chromium workflows and two opt-in restart workflows pass. One live-development creation test is intentionally skipped in the standard suite. ESLint, TypeScript, Prisma validation, production Turbopack build and npm audit (zero vulnerabilities) pass. Fresh-schema deployment uses all 22 migrations; development schema diff reports no difference. No new migration means a new populated-copy upgrade was not required; the earlier verified 17→22 populated-copy upgrade remains the applicable evidence. Full M4.8 remains unchecked because salary, advanced trades and competitive lifecycle acceptance are incomplete.

Development fingerprints before/after automated testing: Player 8,042 / `21f310875df249bb02e78789ffb9bf98`; PlayerGameStat 107,312 / `b1a283150bd0bb762ba801a28805d04e`; RosterEntry 47 / `f2ab52e051fdf332356c1c4bfb8564e4`. This checkpoint uses `md5(string_agg(md5(to_jsonb(row)::text), ' ' ORDER BY id))`; hashes with a different separator from older reports are not directly comparable. Development retains 11 users, three drafts, 35 score revisions, 48 assignment events and 22 migrations. There are seven leagues at the later read-only check; concurrent manual development activity is preserved. Automated fixtures use independently named schemas in fantasy_evolution_test.

All five accepted V5 fingerprints and both protected screenshot fingerprints match. Development operational health correctly remains degraded/503 for one blocked draft, with both workers HEALTHY and unrelated gameplay jobs COMPLETE. The separately authorized fixture classification remains the only applied backfill; this continuation does not extend that approval.

No migrations were added or applied. No development backfill was performed. The position reconciliation mechanism is verified only in a disposable fixture; missing verified MLB/NBA position files still prevent a concrete production target set. See PLAYER_DATA_AUDIT.md for exact missing-input counts and required file fields.

Checklist: 54 rows, 24 checked and 30 unchecked (rookie execution infrastructure and keeper history are newly checked). Of the 24, one intentionally records contract automation remaining disabled. M4.1 5/1, M4.2 8/1, M4.3 6/2, M4.4 4/1, M4.5 1/7, M4.6 0/6, M4.7 0/6, M4.8 0/6.

## Next dependencies and gates

Remaining unblocked work includes fantasy-window configuration, cumulative/overall finalization, salary/auction accounts and immutable ledgers, Vickrey/dead-cap settlement, multi-party revisioned trades and asset transfers, competitive independent lifecycle, future settings, broader administration and the remaining four acceptance workflows. These are implementation work, not blocked by missing production datasets.

Product gates remain exact lottery defaults, universal cap deadline, same-round playoff elimination tiebreaker, higher-salary repeat-release basis, corrective-trade classification details and normalization. External source gates remain current position/rookie/availability/retirement evidence, completion instants, verified boundaries and correction publication times. Contract automation and V10 remain inactive.

## Startup and manual acceptance

Run `docker compose up -d`, then `npm run dev:all` for Webpack plus workers. Optional: `npm run dev:all:turbopack`. Web only: `npm run dev` or `npm run dev:turbopack`. Production build remains `npm run build`.

Use dedicated QA leagues. Register and join two managers; create NFL redraft or four-sport traditional dynasty, choose one initial draft round per sport in Settings and complete the draft. Inspect My Team and Matchups, exchange a player, refresh, release a player and submit/cancel a waiver. For rookie mechanisms use isolated synthetic evidence, prior final placements or manual order, a completed season transition and existing current entitlements; the live production-like pool correctly has no verified rookie evidence. Inspect League1 at Settings → Inspect rosters; correct it only with intentional manager moves/releases or explicit audited commissioner releases.
