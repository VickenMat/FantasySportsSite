# M5 staging migration review

Approved and deployed: `20261126010000_professional_ingestion_foundation`.

SQL SHA-256: `a1ba35606bfcb47197c55df87214dd0dbe3bc5c174aacd38fa6f60808c9102e0`.

Adds three empty application tables: immutable raw/normalized `ProfessionalDataObservation`, immutable versioned `ProfessionalDataDecision`, and mutable leased `ProfessionalSyncState`. Adds two append-only triggers, identity/version uniqueness, one new foreign key, nonnegative counters, publication/observation ordering and paired lease constraints. No existing application column or row is altered, no account converted, no source imported and no backfill included.

Fresh disposable integration preparation applies all 27 migrations. A populated disposable copy validates all 86 existing application tables before/after this migration, all 196 resulting foreign keys and empty Prisma drift. Development is only a read-only source. Detailed private verification is `/private/tmp/fantasy-pending-migration-verification.json`. Development is now at 27 migrations; 195 original foreign keys remain, plus the one reviewed new key (196 total).

The user explicitly approved migration 26 → 27 and the exact MLB historical backfill. Deployment completed after a fresh verified private backup and exact SQL/target checks. All 86 original application-table rows were preserved. The offline schema dry-run and read-only coverage tools work without this migration. Live providers remain disabled independently of migration deployment, and provider licensing/credentials remain separate approvals.

The deployment SQL retained the exact SHA above. Backup SHA-256: `9352e3d660f1816883e2da890c0e72a397c0dce8c893ca8b9d94c0d6a0edd764`; the 35,831,832-byte private archive passed listing and full decode. No pending migration remains at this checkpoint. See M5_RECOVERED_DATA_REVIEW.md and M5_RECOVERY_COMPLETION_REPORT.md.
