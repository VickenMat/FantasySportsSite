# M5 staging migration review

Pending, not deployed: `20261126010000_professional_ingestion_foundation`.

SQL SHA-256: `a1ba35606bfcb47197c55df87214dd0dbe3bc5c174aacd38fa6f60808c9102e0`.

Adds three empty application tables: immutable raw/normalized `ProfessionalDataObservation`, immutable versioned `ProfessionalDataDecision`, and mutable leased `ProfessionalSyncState`. Adds two append-only triggers, identity/version uniqueness, one new foreign key, nonnegative counters, publication/observation ordering and paired lease constraints. No existing application column or row is altered, no account converted, no source imported and no backfill included.

Fresh disposable integration preparation applies all 27 migrations. A populated disposable copy validates all 86 existing application tables before/after this migration, all 196 resulting foreign keys and empty Prisma drift. Development is only a read-only source. Detailed private verification is `/private/tmp/fantasy-pending-migration-verification.json`. Development remains at 26 migrations; the source's 195 existing foreign keys are unchanged.

No deployment approval is inferred. Before eventual deployment, take a fresh verified private backup and repeat exact SQL/target/fingerprint checks. The offline schema dry-run and read-only coverage tools work without this migration. Live providers remain disabled independently of migration deployment, and provider licensing/credentials remain separate approvals.
