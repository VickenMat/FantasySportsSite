# M5 staging migration review

Approved and deployed: `20261126010000_professional_ingestion_foundation`.

SQL SHA-256: `a1ba35606bfcb47197c55df87214dd0dbe3bc5c174aacd38fa6f60808c9102e0`.

Adds three empty application tables: immutable raw/normalized `ProfessionalDataObservation`, immutable versioned `ProfessionalDataDecision`, and mutable leased `ProfessionalSyncState`. Adds two append-only triggers, identity/version uniqueness, one new foreign key, nonnegative counters, publication/observation ordering and paired lease constraints. No existing application column or row is altered, no account converted, no source imported and no backfill included.

Fresh disposable integration preparation applies all 27 migrations. A populated disposable copy validates all 86 existing application tables before/after this migration, all 196 resulting foreign keys and empty Prisma drift. Development is only a read-only source. Detailed private verification is `/private/tmp/fantasy-pending-migration-verification.json`. At that checkpoint development reached 27 migrations; 195 original foreign keys remain, plus the one reviewed new key (196 total).

The user explicitly approved migration 26 → 27 and the exact MLB historical backfill. Deployment completed after a fresh verified private backup and exact SQL/target checks. All 86 original application-table rows were preserved. The offline schema dry-run and read-only coverage tools work without this migration. Live providers remain disabled independently of migration deployment, and provider licensing/credentials remain separate approvals.

The deployment SQL retained the exact SHA above. Backup SHA-256: `9352e3d660f1816883e2da890c0e72a397c0dce8c893ca8b9d94c0d6a0edd764`; the 35,831,832-byte private archive passed listing and full decode. No pending migration remained at that first checkpoint. See M5_RECOVERED_DATA_REVIEW.md and M5_RECOVERY_COMPLETION_REPORT.md.

## Projection migration: approved and deployed

`20261126020000_professional_projection_states` changes development from 27 to 28 migrations. Exact SQL SHA-256: `e09f1b7f28812757adffe60e950c6544d08ae467806258459968c4fda30c55fa`.

Adds `SKIPPED` to `MatchupStatus` so cancelled-only inactive periods do not become zero-score ties. Adds `ProfessionalDataObservation_sport_entity_revision_idx` over sport/category/entityKey/revisionOrdinal. No table, column or existing row is removed or rewritten; no backfill or provider activation is included.

Fresh disposable schemas and a populated development copy validate this change. All 89 existing application tables preserve exact counts/fingerprints, all 196 foreign keys pass, and Prisma drift is empty. Development was read-only for this verification. The private report is `/private/tmp/fantasy-pending-migration-verification.json`.

The reviewed deployment command is `scripts/deploy-reviewed-m5-projection.mjs`. It requires explicit approval tied to the exact SQL hash, rejects any additional pending migration, verifies a fresh ignored private backup by full decode, checks all 89 application fingerprints before/after and requires empty Prisma drift. Pause the managed development stack before deployment, then restore it. The user separately approved this exact batch. Deployment completed on 2026-11-26 after pausing workers and verifying a fresh private backup. Development now has **28 applied migrations and no pending migrations**. All 89 original application-table fingerprints matched after deployment; Prisma drift is empty and no backfill ran. The managed development stack was restarted successfully. The professional-source registry remains empty; this deployment does not activate feeds.

The 54,354,371-byte private backup passed archive listing and full decode. SHA-256: `e19748e0a98b4c4c456727be8e0ff94885760f6140823c9c045e23c6b50911d3`. It remains ignored under `data/private_backups/`. Exact deployment evidence is private at `/private/tmp/m5-projection-deployment.json`. Recovery retains that archive; application rollback leaves the additive enum/index in place.
