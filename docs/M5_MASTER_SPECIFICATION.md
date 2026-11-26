# M5 authoritative professional data specification

Authority: the user's M5 Authoritative Professional Sports Data Integration request, November 25, 2026. M4 at `ad99dff` remains the gameplay authority and is not redesigned. M5 is in progress; fixture acceptance is not live integration.

## Invariants

Preserve canonical IDs, ownership, statistical revisions, financial/competitive ledgers, the accepted historical Parquet files, V5 fingerprints and all 56 V9 rules. Unknown is not zero, healthy, retired, rookie, eligible, complete or officially published. V10, contract automation, normalization, M6 optimization and M7 deployment remain inactive.

No name-only identity merges. Explicit provider IDs and verified crosswalks resolve identity; contradictory links quarantine. New identity discovery requires explicit evidence and review. Historical observed positions remain separate from current eligibility. MLB eligibility uses 10 starts OR 20 appearances at a position in the current/following year, never a HITTER/PITCHER role inference.

Scheduled starts, actual starts, completed status, completion instants, provider update instants, source publication and ingestion time are distinct. The official 24-hour competitive correction window must never start from a fetch timestamp. Corrected observations append revisions and cannot silently rewrite finalized competition.

## Architecture

Provider adapter → immutable raw/normalized observation → identity and temporal validation → immutable processing decision → existing M4 evidence service → canonical operational data → existing V9 ledger → M4 competition/website. PostgreSQL remains operational storage; full historical archives stay Parquet. No new service infrastructure is required.

The initial implementation introduces `ProfessionalDataObservation`, `ProfessionalDataDecision` and `ProfessionalSyncState`. Raw envelopes have provider/sport/category/entity/revision identity, content hash, source reference and separate observed/effective/published instants. Content-identical replay deduplicates independently of fetch time. Contradictory same-revision content quarantines; older ordered revisions stay raw without changing accepted evidence. Changed content with no trustworthy ordering cannot supersede accepted evidence.

Decisions and observations are append-only. Sync state retains cursor, leases, request budget, next eligible poll, failures and last success. One lease owns a stream; lost/expired responses cannot advance it. Page promotion and cursor advancement are one transaction. Failure releases only the owning lease and persists conservative exponential/Retry-After backoff. Credentials are never part of source references, error logs or checked-in fixtures.

The first promotion slice supports verified player identity bridges and positive position evidence through the existing position service. MLB listed roster roles are quarantined; fielding evidence uses canonical games and explicit starts. Observation time cannot fill absent publication fields. Position retractions, team history, game-state, availability, rookie, retirement, statistics, source arbitration and publication adapters remain tracked requirements.

No provider license exists. The SportsDataIO player decoder is a pure bounded codec, not an activated API connection. Local files default to schema-only dry runs. Fixture promotion requires the authorized isolated test database and schema; development promotion is disabled. Request budgets are persisted hard ceilings, not a claim to implement a vendor's rolling commercial quota.

## Milestones

M5.1 researches provider terms/coverage/pricing and selects permitted primary/fallback feeds. M5.2 reconciles identity, team and position evidence. M5.3 adds independently verified boundaries and game-state evidence around accepted V5. M5.4 audits/reconciles historical roles and missing fields without bulk operational import. M5.5 activates approved incremental live ingestion. M5.6 supplies availability and player lifecycle. M5.7 supplies official publication/correction evidence and source-aware V9 integration. M5.8 verifies provider-to-website coverage, failures, replay, concurrency and M4 regressions.

## Safety and rollout

The additive staging migration is reviewed/tested only in disposable schemas until explicit development approval. No provider accounts, subscriptions, paid calls, licensing acceptance, development imports or substantive backfills are authorized by a recommendation. Before any such data change, prepare a target manifest, canonical mapping, row fingerprint, source rights, provenance, coverage impact and rollback/recovery plan.

Reuse `historical-position-reconciliation.ts` for approved historical repairs. The current V9 ledger explicitly selects `v9-historical`; new authoritative statistics need a reviewed provider-selection layer rather than a second scoring engine or a silent provider-name alias. Preserve fixed scoring roles and finalized competitive outcomes.
