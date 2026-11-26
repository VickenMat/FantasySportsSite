# M5 recovered source and selective backfill review

Prepared November 25, 2026 (America/Los_Angeles), continuing synchronized `4c730e0`. All seven recovered sources remain immutable under ignored `data/raw/recovered/`. Derived data stays under ignored `data/position_enrichment` and `data/stat_enrichment`. The exact conservative MLB backfill and migration 27 were explicitly approved and applied after the validation below.

## Content comparison

Duplicate-aware canonical-key multisets compare shared typed raw values and, independently, existing gameplay normalization. Matching row counts alone are insufficient.

| Archive | Rows | Shared-value matches | Normalized matches | Qualification |
| --- | ---: | ---: | ---: | --- |
| NFL | 185,368 | 185,368 | 185,368 | Same 186 rejected rows on both sides; 185,182 accepted normalized rows |
| MLB | 794,974 | 794,974 | 794,974 | No shared-field discrepancies |
| NBA | 260,499 | 260,499 | 260,499 | CSV additionally contains positions; these are excluded from statistical equivalence |
| NHL | 506,116 | 506,116 | 506,116 | Raw comparison excludes `name`: CSV Python dictionary text differs from the Parquet locale-expanded struct. Boolean starter values are normalized by schema. This is not full raw-content identity. |

Accepted Parquet hashes match the existing full audit. The seven recovered SHA-256 values, schemas and derived fingerprints are recorded in `reports/m5-recovered-data-audit.json`. The NHL multilingual name representation is retained unchanged and not used for identity merging.

## MLB decisions

There are 15,645 player-seasons, including 531 with differing populated repaired lists. Repaired lists are not eligibility authority. Recompute from recorded counts and player-specific MLB Stats API fielding/pitching references. Qualify fielding with at least 20 games, SP with at least 10 explicit starts, and RP with at least 20 relief appearances. Fielding starts are absent, so the alternative 10-start route cannot be assumed.

A position must meet its threshold in an independently recorded team record. Do not add potentially overlapping season totals across teams. Deduplicate equal same-team counts; quarantine contradictory same-team counts and invalid counts. Preserve team IDs, source row hashes, counts and references. 9,772 archived player-seasons have independently supported thresholds; 5,873 lack sufficient evidence. 102 have possible combined-team thresholds requiring scope verification. This conservative subset does not claim to resolve all conflicts.

Development dry run proposes **66,825 new historical stat revisions for 935 imported MLB players**, filling existing empty `observedPositions`; 537 imported player-seasons are withheld. Historical coverage would change from 0 to 935/1,472 players and 0 to 66,825/72,510 latest stat observations. Overall PlayerGameStat count would change from 107,312 to 174,137; one ImportBatch would be appended. Original revisions, IDs, raw source evidence, normalized statistics, official publication timestamps, rosters and score ledgers remain unchanged. No current eligibility evidence is created; the legacy roster fallback explicitly excludes repaired historical records.

Exact target fingerprint: `22d4af0837a85bc2f89906d7e480536f7836072f2e20e7d75fc374957e6244f4`.
Manifest fingerprint: `d0633fa38e98956b045380a2e9e5e3d83e4e67dbd4e8edb94bbf02be3a156712`.
Local review input: `data/position_enrichment/mlb_review_manifest.json`. The generation context preserves the recovery observation instant for repeatable review; that instant never substitutes for official publication.

A populated disposable copy applied the exact target successfully: all old rows in 89 resulting application tables were unchanged, original normalized/publication/role/identity values were preserved, and replay yielded zero changes. Migration validation independently preserved 86 original populated tables, verified 196 resulting foreign keys and produced empty Prisma drift. Disposable application is not development approval.

## NBA decisions

All 6,282 original roster rows match the corresponding original fields of repaired records, using a duplicate-aware comparison. Repaired quality: 5,972 estimated-minutes rows, nine manual-name-review rows and 301 unmatched rows. There are 346 conflicting populated player-season lists (349 when empty lists count).

All 242,798 populated final-CSV positions exactly match a repaired record for the same canonical player, season and team. That relationship does not establish official positions. Preserve these as historical evidence with their original estimated/manual provenance; no arbitrary season union and no current eligibility promotion.

The 2026–27 population contains 5,414 rows and 474 players, with zero embedded positions and no same-season repaired matches. No NBA development backfill is proposed. Current official position sourcing remains a permission/evidence dependency.

## NHL decisions

The recovered archive adds no missing scoring values over accepted normalization. Among 50,619 goalie records, decisions are W 12,655; L 9,813; O 2,842; unknown 25,309. Unknown does not imply a loss or zero.

The canonical-ID selective request manifest targets 13,499 of 14,920 accepted imported rows: exact faceoff wins missing in 13,428, shorthanded points in 13,428, goalie win in 40, explicit/accepted shutout evidence in 38. Field counts overlap. Target fingerprint: `c930d3d59c637ad0c241925117e0c62321fb87bfdf91149cfa25be30a3f7b9ed`. No supplementary values are available to apply. Never derive integer faceoffs from percentages or shutouts merely from zero goals against.

## Consolidated approval scope

Approval would authorize only (1) the reviewed additive migration 26 → 27 in `M5_PENDING_MIGRATION_REVIEW.md`, and (2) the exact MLB historical revision manifest above, after a fresh verified private backup and rechecking SQL/source/target fingerprints. No reset, reseed, deletion, archive overwrite, NBA/NHL backfill, current eligibility promotion, live feed, scoring recalculation, V10 or contract activation is included.

Approval was subsequently received and the exact scope applied; all original rows were verified unchanged. A changed target fingerprint requires a fresh review. Failure rolls back its transaction. Recovery uses a verified private backup only with separate authorization; never delete immutable revisions as a rollback shortcut.

## Reproduction

`npm run data:recovered:audit` inventories and compares sources; `npm run data:recovered:prepare` builds conservative derived candidates; `npm run data:recovered:preview` reads development and generates the exact dry-run manifest; `npm run data:nhl:requests` creates missing-field targets. `node scripts/verify-pending-migrations.mjs --verify-recovered-backfill` reads development into an authorized disposable copy, applies pending migrations there and validates enrichment there. It never deploys to development.
