# M3.6 synthetic-data cleanup audit

Cleanup validation ran with the application and Prisma Studio stopped. Before validation, a fresh custom-format PostgreSQL backup was created at `/private/tmp/fantasy-evolution-pre-synthetic-cleanup-2026-11-23.dump`; SHA-256 `b9f92346ff449162791b5261320bbdbdf3967a44c41216f21161269d20568abd`. `pg_restore -l` validated its archive inventory. The pre-M3.6 reference backup was restored separately to `fantasy_evolution_m36_backup_audit` for primary-key comparisons.

Exact set comparison identified 14 added import batches and their candidate graph: 308 added player identities, 15 added games, 319 stat revisions, two score ledgers and three ledger entries. Candidate game deletion was restricted to game primary keys absent from the reference backup; shared pre-existing games were excluded. Validation was by primary key and foreign-key relationship, not by name, prefix or timestamp.

The required “no legitimate dependency” safeguard failed before the transaction began. Candidate player `0646a272-b7b1-48ed-84b4-d9337960ac67` is referenced by:

- active roster entry `78f591b5-1d46-4d25-80d8-e1f1dcfd887b` for the User0 franchise in League0;
- draft pick `f20d2cdc-f0ee-41f2-a3b5-b49660671b4b` in completed draft `8aaf0822-8d3b-41d6-963c-380eff843838` (round 2, pick 2, automatic);
- fantasy transaction `6233848d-a1ff-4a5a-9c89-64091bd03786` recording that draft acquisition.

That draft began at November 23, 2026 8:28:44 PM CST and completed at 8:29:31 PM CST. Its first two picks were manual and later picks exercised the automatic-draft path. Removing the roster entry, draft pick or transaction was not authorized, and retaining this player would make the authorized expected player-deletion count differ from 308. Therefore the all-or-nothing cleanup was stopped. No cleanup transaction began, no trigger was disabled, and no record was deleted or updated.

The safe resolution is an owner decision: preserve the completed League0 gameplay and authorize a revised cleanup that retains this player identity, or explicitly classify and authorize removal of the named League0 roster/pick/transaction records. Until then, backups and all development data remain unchanged by cleanup.

## Browser-isolation incident found during final verification

The first local Playwright verification reused an already-running port-3000 development server. Although the Playwright worker itself received `TEST_DATABASE_URL`, HTTP mutations were handled by that older process and created six browser-test users and two browser-test leagues in development. The final fingerprint exposed the count change immediately. The exact root IDs are:

- users: `8efab051-72b1-4993-b435-5467514ea5ca`, `fc539898-896c-43da-bdd8-e8fa4216f9b0`, `f88934e6-4296-49ff-9586-aa0cdfe9416f`, `f9a5fe81-c315-4254-8536-8eb6b29b5990`, `e51af2e7-f8fc-4f15-ab96-e02536015a45`, `aa67f453-f164-4910-8d4d-fb899a900ea3`;
- leagues: `59758d81-fde7-4fbd-9136-aafcc7ae21dc`, `38be0993-dc36-4b87-8e2b-c5819da9b89c`.

Those roots own six accounts, six sessions, two memberships, six teams, five league-sport configurations, two drafts, twelve sport rosters and one fantasy transaction. They are not part of the original 14-batch deletion authorization, so they remain pending explicit deletion approval.

Playwright now uses `TEST_AUTH_URL=http://localhost:3100`, always starts the production build itself, and sets `reuseExistingServer: false`. A hardened rerun passed all eight browser tests; development remained at 13 users and five leagues before and after, while the disposable database returned to its seeded two users and one league. Strict untrusted-origin rejection was also verified in production mode.
