# M5 authoritative professional data specification

Authority: the user's M5 Authoritative Professional Sports Data Integration request, November 25, 2026. M4 at `ad99dff` remains the gameplay authority and is not redesigned. M5 is in progress; fixture acceptance is not live integration. The current engineering-closure authority addendum supersedes initial preview/default-off rollout statements below; exact approved policies are enabled while restricted direct APIs remain disabled.

## Invariants

Preserve canonical IDs, ownership, statistical revisions, financial/competitive ledgers, the accepted historical Parquet files, V5 fingerprints and all 56 V9 rules. Unknown is not zero, healthy, retired, rookie, eligible, complete or officially published. V10 optimization/activation, contract automation, unapproved score normalization and M7 deployment remain inactive. M6.0 offline historical preparation is explicitly authorized; it does not authorize optimization or a production import.

No name-only identity merges. Explicit provider IDs and verified crosswalks resolve identity; contradictory links quarantine. New identity discovery requires explicit evidence and review. Historical observed positions remain separate from current eligibility. MLB eligibility uses 10 starts OR 20 appearances at a position in the current/following year, never a HITTER/PITCHER role inference.

Confirmed November 26 MLB rule: select PITCHER for a starting pitcher; otherwise HITTER when the player bats. Proven exclusive pitching remains PITCHER. Evidence gaps stay pending; roles are never combined or selected by fantasy total.

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


November 26 continuation: licensed nflverse/SportsDataverse releases now have bounded real downloads, canonical staging, NFL/NHL V9 samples and populated-copy replay acceptance. Exact NHL missing-field and MLB role materializations were separately approved and applied with fresh verified backups. Those historical applications do not activate continuous feeds or supply unavailable official publication/completion evidence. Current source limitations and exact approvals are recorded in M5_REAL_DATA_COMPLETION_REPORT.md and M5_REAL_DATA_REVIEW.md.

## Confirmed operational evidence decisions — November 26, 2026

The user's operational-completion instruction supersedes conflicting strict requirements above. See [current application and policy report](M5_OPERATIONAL_COMPLETION_REPORT.md). Granular NBA positions take precedence within an applicable period; supported family fallback is G→PG/SG, F→SF/PF, C→C, G-F/F-G→PG/SG/SF/PF, F-C/C-F→SF/PF/C. Unknown grants none. New applicable family evidence may supersede stale granular evidence; conflicting peers are quarantined, never unioned. NBA slots remain PG, SG, G, SF, PF, F, C, C, UTIL.

Exact verified event times remain preferred. Verified scheduled starts and trustworthy observed in-progress evidence may enforce conservative locks; started games never unlock. Late earlier-start or post-lock assignment discrepancies require audited review without rewriting immutable history. Trustworthy first-final observations may anchor operational completion and the separate 24-hour waiver hold. First validated complete final boxes may anchor the shared 24-hour competitive correction window when official publication is absent. Final-state presence alone and partial boxes cannot anchor that clock. Retry, restart, failover and ordinary corrections preserve its first anchor; explicit invalidation/replacement cannot shorten the deadline. Finalization still requires complete inputs, snapshots, resolved games and no blocking conflict. Source event, publication, observation, artifact date and processing times remain distinct.

Observed and date/season-precision player and professional calendar snapshots may support prospective decisions with explicit provenance and unknown exact timestamps. No health, retirement, rookie or positional inference follows from omission or newly observed identity. Retired players remain owned until an authorized transaction. New substantial promotion batches require exact populated-copy review and approval; recurring canonical promotion requires a separately bounded authorization. Targets A/B are now applied as documented, with current eligibility unchanged. V5, all 56 V9 weights, V10 inactivity and contract inactivity remain fixed.

## Engineering closure authority — November 26, 2026 Pacific

The user's engineering-closure/M6.0 instruction explicitly approves exact supplemental 0413f205bf71b0369108b58d998745caf04641c360546842febdcdea6cb660d1, exact identity 281641b0d5912b469d8b2153f19399774e28ee6049ae3ad355324a50aa717197 and recurring statistical policy d3a1937527bdca3ce94d9db47cb761417fa89c96e4d3be53a82e0ccd001c2eb6. These supersede older pending-approval statements: both exact targets are applied/replay-verified and the policy is enabled. UTC receipt/application records on November 27 correspond to November 26 in America/Los_Angeles; do not misdate the instruction.

Statistical authority is prospective and limited to reviewed NFL/NBA/NHL products, current 2026 existing real identities/teams and existing REGULAR canonical games. One game per sport per minute, declared complete input/role inventories, canonical/provenance validation, source-head checks, provider/role source restrictions, append-only revisions, budgets, leases and finalized-result protection remain mandatory. Both game start and immutable primary-body first receipt must meet the authorization cutover. A body retained before approval cannot become newly authorized by an unchanged refetch. Semantic per-game identity prevents unrelated enclosing-body updates from manufacturing corrections. Reviewed identity retractions remain authoritative. MLB future statistics, arbitrary historical backlog, identity discovery, calendar changes, current position policy, financial/ownership writes and migrations are outside this policy. Ordinary gameplay consequences flow through existing M4 services.

Actual current professional identity population is 5,961; 3,263 first-observed completion records and five accepted complete boxes remain distinct from exact physical events. The40 new NHL statistical targets are a different set from the40 unresolved historical shutout appearances. Historical scoring repair preserves source records and publication unknowns; no automatic inference closes the latter.

The separate18-fact current-eligibility proposal 81c8099d2816afb7a5606a8e5264807236dd3e1189e2ba5172f306232f562da2 has passed populated-copy preservation, both late failures and empty replay. It remains unapproved/unapplied. Applying it requires new exact approval, fresh private backup and unchanged source/head/expiry checks; identity approval and the recurring policy do not imply approval of an older-body position backfill. No new gameplay decision or migration is needed.

Original checklist accounting is16/32. U09 closes only for licensed repair manifests, historical reconciliation and completed approved selective materialization. U08 retains missing-field/role evidence; no assertion of exhaustive historical completeness follows. M5 engineering exit, practical delayed-data operation, full original checklist closure and genuinely live scoring are separate conclusions.

M6.0 uses immutable accepted Parquets and separately retained recovery/V5 inputs outside PostgreSQL. All 44 cohorts and all 1,746,957 rows are prepared with native-key/operational-UUID distinctions, explicit missingness, role/position/participation classes and unknown chronology. A mandatory full-vector quality package quarantines 441 known NHL source conflicts; complete numerical input rows are not scoring readiness. Source-only thresholds and role-quality overlays never become current grants or production role resolutions. See [M6 authority](M6_MASTER_SPECIFICATION.md) and [final preparation evidence](M6_HISTORICAL_PREPARATION.md).
