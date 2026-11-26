# M5 unresolved decisions and implementation dependencies

The user confirms no existing provider license. Prepare options; do not purchase, create accounts or activate feeds. M4 decisions, V9 weights, single-role MLB scoring, V5 acceptance, four unresolved historical NBA games, V10 inactivity and contract inactivity remain settled.

## Required provider/financial decisions

Select an approved provider/product after obtaining written coverage, usage rights and an actual quote. SportsDataIO is the first commercial quote recommendation and Sportradar the alternate; neither is approved. Confirm fantasy display, stored/raw/derived data, redistribution boundaries, attribution, retention after termination, required seasons, status/position/rookie/retirement fields, exact NHL inputs, limits and latency/SLA. No subscription cost is guessed and no paid API request is made. Public endpoints or MIT client libraries are not commercial data grants. nflverse's CC BY dataset license is a development option subject to per-dataset/upstream scope and attribution review.

## Evidence policies requiring explicit verification

Determine what a provider's publication, correction, update, actual-start and completion fields mean. Fetch time never substitutes for official publication. A published final status alone is not a verified completion instant. Conflicting providers require reviewed priority/resolution; an arbitrary latest ingestion cannot win. Position corrections/retractions need a proper revision-aware resolution mechanism; the current positive-evidence service cannot silently remove historical eligibility. This is implementation work, not a request to reopen MLB's 10/20 rule.

MLB requires trustworthy athlete/game role-selection evidence for the 215 paired archive appearances. V9 already requires exactly one scoring role; 92 pairs with nonzero inputs in both roles do not authorize combining them or choosing the higher realized total. Investigate official appearance/pregame role evidence before any repair. No new role-scoring decision is necessary on the current facts.

## Data dependencies

Verified MLB/NBA historical positions; NHL integer faceoff wins, shorthanded points, goalie decisions and explicit shutout evidence; current team/position/availability/rookie/retirement records; independently verified season boundaries and future starts; actual game-state instants; original/corrected publication timestamps. Accepted local archives and V5 remain unchanged while these inputs are sought through permitted channels.

## Pending implementation, distinct from external blockers

Licensed network adapters; team-assignment history; full position revocation semantics and conflict review; schedule/game-state codecs; availability/rookie/retirement codecs; live/final/corrected box-score normalization; source-aware V9 selection preserving the existing ledger; rolling commercial quota windows; all-sport freshness UI; real-source end-to-end coverage acceptance. These remain checklist work and are not mislabeled completed or entirely blocked on data. The first checkpoint delivers the durable staging, identity/positive-position slice, dry-run and audit mechanisms.

## Development safety approvals

One additive staging migration is prepared and validated in disposable/populated-copy schemas: `20261126010000_professional_ingestion_foundation`. Development remains at 26 applied migrations. No approval to deploy it or backfill development has been inferred. Deployment is not required for offline dry runs or read-only coverage research. See `M5_PENDING_MIGRATION_REVIEW.md`; consolidate any further necessary additive staging changes before requesting development deployment. There is no substantive backfill target or data-application request yet.
