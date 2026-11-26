# M4 draft, financial and trade continuation

This continuation starts from `16b9940` and applies the final draft-experience request. M4 continuation is complete for all unblocked mechanisms; the checklist has **60 checked / 0 unchecked / 60 total** rows, including six explicit website/draft requirements. See [the final acceptance report](M4_COMPLETION_REPORT.md). Older reports describe historical checkpoints, including the now-revoked rookie lottery proposal.

## Implemented and verified

Rookie drafts reject lottery and ordinary custom ordering, derive every linear round from reverse finalized sport placement, preserve transferred entitlement ownership, and retain historical provenance. Elimination placement without consolation uses round and original seed. Four rookie rounds remain the default; longer configurations have persistent rules and additive inventory without replacing traded picks.

Creation selects the upcoming or immediately following eligible season independently for each sport. Unknown dates retain the chosen season and a pending state. Draft completion no longer chooses the season. Fantasy scoring windows and matchup lengths are configurable within verified professional bounds; deadlines use fantasy playoffs or cumulative scoring end, rather than professional postseason dates.

Overview uses responsive summary groups, commissioner invitation creation/copy, saved shared draft schedules and room links. Draft is permanent navigation. Players redirects to the consolidated Waivers browser, which reuses canonical identities and historical statistics, supports ownership/availability/position/search/score filters, and keeps missing scores unknown.

The Draft center persists audited random/custom initial order, accessible drag/arrows, UTC schedule and timezone, preparation exactly one hour before start, private queues, disabled preparation selections and worker-controlled activation. Start Now remains a gated testing control. New selections capture immutable player/franchise labels, original rookie ownership and auction prices; preexisting selections without historical label evidence are not backfilled.

Traditional English auctions and salary Vickrey acquisitions use integer accounts, immutable ledgers, bid reservations, recorded priorities, automatic nomination/settlement, pause-safe clocks and atomic roster assignment. Salary acquisition prices, annual $2 increases, ceil(50%) release penalties, seven-day cooldown, player-specific credit, decreasing acquisition floors, cap transfers and cycle expiry are implemented. Over-cap tests verify lineup restrictions and incremental cuts that improve compliance before fully restoring it. Salary leagues cannot grant future rookie picks.

Revisioned multi-team trades support routed players, picks, FAAB, cap and explicit cuts. All participants accept the same immutable revision; revisions invalidate prior acceptance, final acceptance reserves funds, review is configurable with a 24-hour default, commissioners may veto, and workers revalidate and atomically settle or invalidate conflicts. New website proposals use this workflow; legacy creation is blocked at its old server-action entry point after the revisioned mechanism is available.

Competitive cumulative finalization requires completed source-backed windows, verified game completion and official publication, waits 24 hours, freezes eligible starter totals and final placements, and creates overall results without H2H award points. Late statistical revisions do not rewrite finalized totals. Independent sport rollover retains dynasty players, applies salary increases, resets applicable FAAB, generates eligible future picks and expires applicable obligations. Universal budgets remain attributed to their own overlapping cycles. Future competition settings are immutable versions, and abandoned-franchise ownership transfers retain franchise identity and append-only audit history.

## Verification and integrity

- 155 unit tests passed.
- Full PostgreSQL regression: 87/87 in normal and shuffled fresh schemas (seed `20261129`).
- 17 standard Chromium workflows passed, one development-writing opt-in skipped; two actual server/worker restart workflows passed.
- TypeScript, ESLint, Prisma validation and production Turbopack build passed; dependency audit found zero vulnerabilities.
- Latest populated-copy validation: 86 application tables, 195 foreign keys, 26 applied migrations, no pending migrations and empty Prisma diff.
- Development passed 120 seconds of read-only stability with healthy workers; its existing roster blocker remains visible.
- Shuffling exposed an import-order regression: schedule-created unverified season metadata was not reconciled when historical statistics subsequently arrived. Import now reconciles only unverified coverage, preserving stronger existing coverage. No development import was run.

The user explicitly approved the four reviewed migrations in [the deployment review](M4_PENDING_MIGRATION_REVIEW.md). Development is now at 26 migrations with no Prisma drift. A read-only source copy verified all 70 existing tables, then checked 195 foreign keys and an empty Prisma diff after the pending migrations. Deployment itself preserved every original table fingerprint exactly and retained 27 enabled append-only triggers.

The private pre-deployment backup is `/Users/vicken/Developer/PrivateBackups/FantasyEvolution/fantasy_evolution_pre_m4_26_20261125.dump`, SHA-256 `bc363fe67a9bbcb1c8c6c07cb4761aa83af79a3726405d5639a2f61b2352fc66`. Its custom-format archive was verified before deployment. Existing leagues were not converted to salary mode; no player, statistics or competitive evidence backfill was performed.

Post-test preservation comparison matched all original development data except the expected running worker journal. The five accepted V5 artifacts match their accepted hashes; all 56 V9 weights and both protected screenshots are unchanged. V10, normalization and contract automation remain inactive. The development stack runs with `npm run dev:all` at `http://localhost:3000`; existing League1 noncompliance remains visible rather than being silently repaired.

## Completion and data handoff

H2H championship evidence acceptance, mixed-asset salary/cap/FAAB/pick trading and deadline cases, offseason archival with preserved history, reversible commissioner score/draft corrections, universal snake/auction scopes, Waivers filter acceptance and all six requested website journeys are verified. Scheduled rookie plans reuse one-hour preparation, queues, saved UTC/timezone configuration and server activation; original reverse-placement slots stay separate from transferred owners. Source-backed fantasy window reconciliation now records draft/rollover provenance. Free-agent floors expire in verified offseasons without cancelling independent dead cap. Concurrent maximum bids cannot reserve the same cap twice.

All unblocked checklist rows are complete within the explicit safety boundaries in the final report. Production evidence still missing for M5 includes official rookie/availability/retirement status, independently verified professional boundaries, verified game-completion instants, correction-publication times, MLB scoring-role disambiguation, NHL scoring inputs and verified MLB/NBA positions. Synthetic test records remain confined to disposable schemas. No new schedule acquisition is planned.
