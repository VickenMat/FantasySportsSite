# M5 authoritative professional data specification

Authority: the user's M5 Authoritative Professional Sports Data Integration request, November 25, 2026. M4 at `ad99dff` remains the gameplay authority and is not redesigned. M5 is in progress; fixture acceptance is not live integration.

## Invariants

Preserve canonical IDs, ownership, statistical revisions, financial/competitive ledgers, the accepted historical Parquet files, V5 fingerprints and all 56 V9 rules. Unknown is not zero, healthy, retired, rookie, eligible, complete or officially published. V10, contract automation, normalization, M6 optimization and M7 deployment remain inactive.

No name-only identity merges. Explicit provider IDs and verified crosswalks resolve identity; contradictory links quarantine. New identity discovery requires explicit evidence and review. Historical observed positions remain separate from current eligibility. MLB eligibility uses 10 starts OR 20 appearances at a position in the current/following year, never a HITTER/PITCHER role inference.

Scheduled starts, actual starts, completed status, completion instants, provider update instants, source publication and ingestion time are distinct. The official 24-hour competitive correction window must never start from a fetch timestamp. Corrected observations append revisions and cannot silently rewrite finalized competition.

## Approved free-first strategy

The later M5 Approved Data Strategy and recovered-dataset supplement supersede commercial-first proposals. Development subscriptions have a $0 budget. Use one internal sports-data service with a unified hybrid provider layer. Evaluate ESPN/shared multi-sport coverage first only where permission allows; use sport sources to fill verified gaps. Commercial providers remain optional future extensions and must not block implementation. Endpoint accessibility alone grants no usage rights.

Poll centrally per professional game, never per fantasy league or user. Aim for the fastest permitted freshness, ideally under 60 seconds, with adaptive 15–60 second live polling subject to documented source limits. Distinguish provider publication delay, transport, normalization, scoring and display latency; a polling interval is not a measured end-to-end guarantee. Cache, conditional requests, batching and rolling quota enforcement belong in the shared service.

Recovered CSV files are immutable ignored inputs. Derived enrichment stays separate from accepted Parquet. MLB repaired lists require independently traceable 10-start/20-game evidence; do not sum overlapping team totals. NBA estimated-minute positions remain historical evidence. Substantial backfills require an exact validated manifest and explicit approval.

## Architecture

Provider adapter → immutable raw/normalized observation → identity and temporal validation → immutable processing decision → existing M4 evidence service → canonical operational data → existing V9 ledger → M4 competition/website. PostgreSQL remains operational storage; full historical archives stay Parquet. No new service infrastructure is required.

The initial implementation introduces `ProfessionalDataObservation`, `ProfessionalDataDecision` and `ProfessionalSyncState`. Raw envelopes have provider/sport/category/entity/revision identity, content hash, source reference and separate observed/effective/published instants. Content-identical replay deduplicates independently of fetch time. Contradictory same-revision content quarantines; older ordered revisions stay raw without changing accepted evidence. Changed content with no trustworthy ordering cannot supersede accepted evidence.

Decisions and observations are append-only. Sync state retains cursor, leases, request budget, next eligible poll, failures and last success. One lease owns a stream; lost/expired responses cannot advance it. Page promotion and cursor advancement are one transaction. Failure releases only the owning lease and persists conservative exponential/Retry-After backoff. Credentials are never part of source references, error logs or checked-in fixtures.

The first promotion slice supports verified player identity bridges and positive position evidence through the existing position service. MLB listed roster roles are quarantined; fielding evidence uses canonical games and explicit starts. Observation time cannot fill absent publication fields. The continuation implements revision-aware positions, team history, game-state, availability, rookie, retirement, statistics, reviewed source arbitration and publication adapters with isolated synthetic evidence. Real-source acceptance remains separate.

No commercial subscription exists. NFLverse player identities have a bounded CC BY 4.0 read-only preview with attribution; ESPN and restricted sport feeds remain disabled. The SportsDataIO player decoder is a pure bounded codec, not an activated API connection. Local files default to schema-only dry runs. Fixture promotion requires the authorized isolated test database and schema; development promotion is disabled. Provider-wide rolling request reservations enforce reviewed windows across sports and streams; failed attempts consume quota. Policy changes cannot reset quota history.

## Milestones

M5.1 researches provider terms/coverage/pricing and selects permitted primary/fallback feeds. M5.2 reconciles identity, team and position evidence. M5.3 adds independently verified boundaries and game-state evidence around accepted V5. M5.4 audits/reconciles historical roles and missing fields without bulk operational import. M5.5 activates approved incremental live ingestion. M5.6 supplies availability and player lifecycle. M5.7 supplies official publication/correction evidence and source-aware V9 integration. M5.8 verifies provider-to-website coverage, failures, replay, concurrency and M4 regressions.

## Safety and rollout

The additive staging migration is reviewed/tested only in disposable schemas until explicit development approval. No provider accounts, subscriptions, paid calls, licensing acceptance, development imports or substantive backfills are authorized by a recommendation. Before any such data change, prepare a target manifest, canonical mapping, row fingerprint, source rights, provenance, coverage impact and rollback/recovery plan.

Reuse `historical-position-reconciliation.ts` for approved historical repairs. The current V9 ledger explicitly selects `v9-historical`; new authoritative statistics need a reviewed provider-selection layer rather than a second scoring engine or a silent provider-name alias. Preserve fixed scoring roles and finalized competitive outcomes.

Historical repair preserves original official publication timestamps and never grants current eligibility through a legacy fallback. Source-aware V9 recalculation retains a single canonical ledger and fixed role; a source switch requires an explicit review reason, while replay retains the selected source. Typed publication/correction promotion is fixture-verified; real provider field semantics and authoritative end-to-end acceptance remain pending.

NBA/MLB/NHL postponements retain their originally assigned fantasy week; NFL retains the official professional week. Actual verified starts control immutable lineup capture. Cancelled-only regular periods are skipped without zero-score ties; uncertain playoff/championship consequences remain pending review.
