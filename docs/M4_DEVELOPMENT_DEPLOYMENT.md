# Approved development upgrade — November 25, 2026

Target: local `fantasy_evolution`, public schema. Approval covers the five migrations after the recovered 17-migration baseline, through `20261125200000_relative_matchups_m4_2`.

The project server was stopped. A PostgreSQL custom-format backup was created and successfully restored into `fantasy_evolution_migration_verify_20261125`. The exact Prisma 17→22 upgrade succeeded on that populated copy. The creation/dashboard/waiver regression passed 17/17 against the upgraded copy. Only then was `npm run db:deploy` run against development; all five migrations succeeded. The verification database was removed; the backup remains available.

All pre-existing counts matched before and after deployment: User 9, League 3, Player 8,042, PlayerGameStat 107,312, RosterEntry 47, Draft 3, ScoreLedgerEntry 35, GameScheduleObservation 57,352, HistoricalGameCrosswalk 52,866, RosterAssignmentEvent 48. Unchanged-table fingerprints matched exactly; League and Draft fingerprints matched after excluding only added default columns. No original rows were deleted. Expected additive backfill: 10 FAAB accounts, 10 opening ledger entries and 10 priority rows.

All 56 ScoringRule rows retained fingerprint `8bda393cb724945617185c9b1c8725ec`. All five accepted V5 artifact hashes match the schedule integration report.

Live Chromium verified a dedicated two-team NFL redraft H2H league, odd three-team NFL/NBA dynasty league, both new/existing Waivers, Founders Dynasty access and authenticated brand navigation. QA additions: two users and two leagues; no roster entries or assignment events added. Existing user fingerprint remained `cc8a753787a5bd5bb709e66086b7090c`.

Verification: 139 unit, 40 integration, eight standard Chromium tests passed. The opt-in live test passed separately and is skipped by the standard isolated suite. Prisma generation/validation, typecheck, lint, production build and npm audit passed. Schema diff still reports UUID/default/index-name drift; do not mistake migration status for zero drift.

Backup: `/private/tmp/fantasy_evolution_pre_m4_22_20261125.dump`; SHA-256 `c5b3c50fcd6510bb9a16a539147ac8546788b9c470e498a39da4306565b2a04a`. This temporary location needs durable private retention.
