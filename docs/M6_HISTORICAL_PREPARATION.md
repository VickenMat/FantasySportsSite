# M6.0 historical dataset preparation

This offline preparation pipeline creates reproducible historical analysis partitions while retaining the active UBP V9 scorer. It does not select a V10 training cohort, run optimization, change weights, grant current eligibility or import archives into PostgreSQL.

Run `node scripts/prepare-m6-dataset.mjs` after the accepted inputs and separately prepared NHL overlays are frozen. Use `node scripts/prepare-m6-dataset.mjs --verify-existing` to verify the frozen partitions and mandatory scoring gates without rebuilding the package. The public entry point checks its runtime dependency lock before and after every stage; the original low-level Python tools remain implementation details of that guarded workflow. Python uses the already installed PyArrow; the TypeScript stream workers reuse the existing normalizer, participation classifier, NBA mapping and V9 evaluator. No new scoring engine or dependency is installed.

All large inputs, normalized intermediates, position provenance and derived Parquet partitions remain excluded under `data/simulation/`. Compact reports live in `reports/m6-historical-readiness.json`, `reports/m6-nfl-unresolved-identities.json` and `reports/m6-nhl-enrichment-readiness.json`. The NHL source-side evidence report is separate: `reports/m6-nhl-historical-enrichment.json`.

## Deterministic architecture

Accepted archive and V5 hashes are checked before processing; recovered inputs and position-source hashes are pinned independently. Every physical source row retains its original row number and canonical transformation fingerprint. Processing is bounded to one sport-season, sorted by exact source game/player IDs and physical row number. The 44 partitions preserve every physical row, including quarantined missing identities, duplicate role rows and unresolved scoring roles. Source possession never establishes a new data license.

The preparation process captures transformation hashes at startup and refuses report publication if code changes before completion. Derived Parquet uses fixed schema, ordering, compression, row-group size and no generated timestamp. Library versions and transformations appear in the compact manifest. Reproducibility replay compares actual bytes, not just row counts.

Canonical player keys retain sport and provider namespaces; no operational UUID is invented. Canonical game mapping uses only the accepted V5 crosswalk. NBA leading-zero official game IDs remain strings. Unmatched source IDs stay explicitly unmatched; names and calendar similarity cannot establish a bridge. Verified expected game totals remain null because the accepted V5 calendar does not independently certify full professional-season completeness.

## Statistical and role evidence

`src/simulation/preparation/records.ts` calls the same `normalizeHistoricalRow`, `participationEvidence` and `calculateScore(ubpV9Rules, ...)` services used by the application. Missing inputs remain null, missing masks retain applicable required stat keys, and incomplete totals remain null. Partial sums are never presented as complete scores. NFL TE classification remains separately required when its bonus could matter. Unsupported professional NFL roles are retained without being forced into fantasy offensive slots.

MLB paired roles are grouped by exact player/game/season. Recorded starts take PITCHER priority; otherwise explicit batting selects HITTER. Explicit zero plate appearances, zero at-bats and all zero hitter scoring inputs establish a batting-role placeholder alongside a proven active pitcher, without claiming that the athlete did not play. Missing participation, missing starter evidence, positive contradictions and duplicate/conflicting roles remain distinct classifications. Realized fantasy points never select the role, and both role scores are never combined.

NHL overlays join exact season/game/player/role tuples and require pinned source sets plus per-field evidence. Only missing scoring inputs are supplemented. An existing nonnull disagreement withholds the entire overlay for that row and retains its original statistics. Baseline and enriched statistics, masks, scores, proof and conflicts occupy separate columns. Unknown shutouts remain unknown; percentage-derived faceoff integers are prohibited. Enrichment does not manufacture historical publication timestamps.

## Positions and temporal leakage

NBA original roster evidence, embedded recovered values and repaired estimated positional minutes remain separately traceable. Explicit granular and approved family-derived roster classifications remain distinct from historical estimates. Unknown and conflicting records remain unknown. Every undated historical position retains unknown effective/known-at times, even when its position code is clear.

MLB recovered threshold evidence retains each team/source scope and the recorded10-start/20-appearance rule. Independently sufficient counts are not summed across potentially overlapping teams. Current-season totals remain retrospective with unknown threshold-reached dates; prior-season carry is retained as a candidate with its original evidence and unknown publication time. Neither becomes an opening-day grant by assumption.

`permitsHistoricalDecisionEvidence` requires both effective and known-at times by the simulated decision, and rejects retrospective estimates. Strict historical draft/lineup simulation therefore remains gated where chronology is unavailable. Retrospective box-score comparison and documented position sensitivity analysis are separate uses, never disguised as pregame evidence.

## Reporting and methodology boundaries

Cohort reports expose physical rows, valid rows, quarantines, unique players, unique source games, exact V5-matched games, complete statistical rows, selected role rows, complete players/player-seasons and materialized-row-complete games with their own denominators. A complete-game metric does not claim a complete final box or complete professional athlete inventory. Missing-field, role ambiguity, DNP/unknown, position quality and duplicate/conflict counts remain separate.

NFL, NBA and NHL2026 ongoing cohorts are marked partial. MLB2026 extent remains unverified rather than being declared partial solely from its start year. Earlier observed schedule extents also remain unverified. COVID-shortened structures and NFL16-to17-game changes are flagged without automatic normalization.

No cohort is automatically accepted as the official V10 baseline. Frozen input-completeness artifacts are not a scoring-consumption approval: the final package must bind full-vector corroboration and its quarantine mask before use. Missing-player, survivorship, positional exclusion, role-selection, source-coverage, schedule-length and partial-season biases must be assessed using the explicit exclusion counts. Strictly dated evidence and retrospective sensitivity datasets remain different selections. The reusable contracts retain nine-starter/twelve-franchise objectives, four-through16-franchise sensitivity, later ten/twelve-starter comparisons and the0.5% contribution-spread target without running an optimizer or choosing a replacement-level methodology.

## Verified preparation result

The frozen run retained all1,746,957 physical rows across44 cohorts. Only the186 NFL rows without explicit player IDs were quarantined; none was merged by name. Exact V5 crosswalks matched2,797 NFL,25,193 MLB,12,217 of12,221 NBA and12,655 NHL source games across the archived cohorts. The four accepted historical NBA limitations remain unmatched.

MLB preparation identifies54,992 paired player-game keys:52,737 verified PITCHER selections and2,220 verified HITTER selections.40,472 batting-role placeholders are explicitly recorded through zero PA/AB/scoring inputs.35 remaining zero-activity role keys are separately exposed for review rather than silently selecting or summing roles. Baseline records retain the exact original classification and immutable row pointers.

NBA position classifications are206,281 family-derived rows,22,612 explicit granular rows,24,693 historical-estimated rows and6,913 unknown rows. These are source-evidence classes, not dated fantasy eligibility grants; strict historical known-at coverage remains zero.

Exact NHL overlays match505,864 accepted archive rows. Another37,206 source overlay keys lie outside the accepted archive and are not counted toward archive readiness. Existing nonnull inputs had zero contradictions in the supplemented-field domain only; this does not establish agreement of the full known source scoring vector. A separate full-box audit found441 known-field disagreements, which must be quarantined by the final quality gate. Complete V9 input rows increase47,427→503,774 of506,116. This is input completeness, not uncontradicted scoring readiness;438 of those complete-input rows are among the441 source-vector conflicts. Faceoff coverage becomes455,245/455,497 skater rows; shorthanded coverage455,137/455,497; goalie wins50,614/50,619. Shutout coverage remains48,640/50,619:1,979 unknown rows are preserved.

That high completeness rate is not evidence of an unbiased goalie dataset. Every known shutout value is zero. Excluding unknown positive-time/zero-GA cases can preferentially exclude actual positive shutout events. With the unchanged V9 shutout weight187tenths, each unknown binary credit has a diagnostic missing contribution interval[0,187]tenths; no value is imputed and unknown actual totals remain null. Faceoff/shorthanded unknowns receive no invented upper bound.

All44 base partitions and11 enriched partitions passed byte-identical Parquet replay and independent canonical row-content hashing. The stable dataset bundle fingerprint is `34dcac0fa467824b91879c115342e14338ff1b6676c337ebf1a63a6e40675749`. See `reports/m6-partition-reproducibility.json`. The separate full-source-key and per-position impact report prevents selected-row completeness from hiding excluded role keys; its position memberships overlap and must not be added as mutually exclusive populations.

The current base cohort classification is31 suitable only for documented sensitivity analysis,10 blocked by missing NHL scoring evidence and3 ongoing incomplete cohorts. None is declared ready for strict prior-information fantasy simulation. M6.0 preparation is reviewable with its measured limitations; it does not authorize V10 optimization or a methodological selection.

## Additional derived review layers

`python3 scripts/prepare-m6-role-quality.py` prepares a separate35-key role-quality overlay, fingerprint `e6f3bae647ff28213f9bcc5c3e47b008d20e01de8f0271301f0ba76341803228`, parented to the unchanged55-partition bundle. All35 have a recorded HITTER GP1, zero PA/AB/all applicable hitter inputs, and a zero-appearance/zero-input PITCHER row. The classification is `ROLE_LEVEL_NON_PLAYING_PLACEHOLDER` / `NO_ACTIVE_SCORING_ROLE_IN_RECORDED_ROWS`. Athlete PLAYED remains intact; selected role stays null. This does not assert physical role absence, create a production role resolution, score a game or resolve the two production Freeland/Kerkering targets. The diagnostic recorded-input zero remains separate from score materialization. Reversing source ordering produces the same review manifest.

`python3 scripts/prepare-m6-pitching-timeline.py` prepares an independent historical eligibility-evidence layer, fingerprint `45cc27479479a9cb8764bc5d3e7aeb1f00cc92ed07839f5225c76b54135acad2`.216,671 exact distinct dated REGULAR pitching appearances yield9,374 independently proved thresholds:1,933 SP10-start,2,993 RP20-explicit-relief and4,448 genericP20-appearance records. These are overlapping position threshold records, not9,374 distinct athletes.

The timeline counts exact player/year/game keys and never sums team aggregates. RP requires explicit GS0 and pitching appearance1; missing GS cannot establish relief. GenericP never impliesSP/RP. Every reached date is DAY precision with null known-at, strict eligibility false and no threshold-game prelock grant. Following-year carry remains a dated-evidence candidate with no fabricated opening-day timestamp. Source order replay is identical. Actual current eligibility is unchanged; fielding/DH threshold dates remain unavailable because season totals lack per-game position chronology.

The final impact report breaks down each cohort by overlapping position membership, records every withheld role actor/key, and keeps selected-only completeness distinct from full-sourced-key completeness. For NHL,1,977 of the1,979 unknown shutout rows have all other V9 inputs complete; the two others retain additional missing inputs. Missing SO contribution bounds are diagnostic only. Their aggregate interval is[0,370,073]tenths across the archive, never an imputed score or a claim that all unknowns are shutouts.

Twelve core/enrichment tests and five role-quality/timeline tests pass. Independent peer verification additionally recomputed all506,116 NHL baseline/enriched masks and V9 arithmetic, audited all54,992 MLB paired selections and scanned all NBA temporal gates. Large derived artifacts stay ignored; only compact reports, reproducible code and documentation are committed.

For one serial offline entry point after the accepted inputs and frozen NHL overlays exist, run `node scripts/prepare-m6-dataset.mjs`. It executes preparation, exact NHL enrichment, the two separate review layers, impact reporting and final partition replay. `node scripts/prepare-m6-dataset.mjs --verify-existing` verifies already prepared partitions without rebuilding them. Neither command retrieves sources, opens a database connection or runs optimization.

## Source keys versus operational UUIDs

The offline partitions normalize native identifiers within explicit sport/provider namespaces. They do not assert that every historical athlete already has a Player UUID in the operational database. A separately authorized read-only snapshot measured the distinction without importing any historical profiles:

| Sport | Historical native player keys | Keys matched to existing real Player UUIDs | Native games matched to existing Game UUIDs through accepted V5 evidence |
|---|---:|---:|---:|
| NFL |5,783|2,364|2,797/2,797|
| MLB |4,037|1,472|25,193/25,193|
| NBA |1,533|516|12,217/12,221|
| NHL |2,355|876|12,655/12,655|

Across sports,5,228 of13,708 historical native player keys have an existing operational UUID;8,480 remain native-key-only. That does not prevent explicitly scoped offline analysis, and it does not authorize creating those profiles in PostgreSQL. The accepted four NBA crosswalk limitations remain unmatched. Current UUID presence says nothing about historical discovery or prior-information availability.

The compact report is `reports/m6-operational-canonical-coverage.json`; the ignored mapping snapshot is under `data/simulation/identity_crosswalks/`. `src/workers/export-m6-operational-identities.ts` performs a guarded local read-only export, including reviewed-overlay checks where present; `python3 scripts/report-m6-operational-coverage.py` measures exact44-cohort matches. These optional coverage tools never perform a database import or identity merge.

## Mandatory full-vector scoring gate

The authoritative consumption manifest is now `reports/m6-dataset-package.json`, package fingerprint `1bf3ed2bfee3283f010c983c347b5164dfaa729ab4abe6fa3cfc045143a00a6a`. The frozen55 partitions remain audit inputs, not standalone scoring authorization.

Full native-box comparison covers all506,116 NHL archive rows, separately from the505,864 rows receiving supplementary facts. It identifies441 known weighted-base-vector disagreements across171 games:16 goalie-save conflicts in2021 and425 conflicts across155 games in2026. Sources remain unresolved; neither known original values nor independent FO/SH evidence is overwritten.

Of503,774 complete-input rows,438 have known source-vector conflicts. Therefore503,336 rows have complete inputs and no known compared-source conflict before participation/role gates;479,710 are selected-role, explicitly PLAYED, retrospective-qualified rows. Strict prior-information simulation eligibility remains zero. The difference includes explicit nonplaying and unknown-participation records, not fabricated zero games.

Each source-qualified row in `data/simulation/scoring_gates/NHL/{year}/scoring-gate.parquet` carries its exact source tuple, comparison state, conflict fields and eligibility reasons. All441 conflicts have false retrospective eligibility and null gated score, including the three already incomplete rows. A consumer must join this gate; it must not interpret `enrichedCompleteRows` or the old supplement-only zero-conflict metric as scoring readiness. This is retrospective data-quality qualification, not competitive score materialization, a claim of unbiased coverage or historical information availability.

The public preparation entry point requires the frozen full-vector sidecar and final package. `--verify-existing` checks both the55-partition replay and exact byte replay of the11 mandatory scoring gates. Missing or changed comparison evidence, archive tuple mismatches, mismatched native source hashes, source conflicts escaping quarantine, or changed final report bindings fail closed.

## Dependency-provenance addendum

`reports/m6-dependency-provenance.json` binds the runtime import closure and package/runtime metadata without changing the frozen55 datasets. Eight runtime modules had original startup hashes; seven omitted dependencies in the frozen55 path are retrospectively corroborated as byte-identical to `7a37ddc`, including `src/positions/nba-policy.ts`, `src/ingestion/contracts.ts`, schema imports and `historical-evidence.ts`. Baseline and current Git blob IDs are recorded. Six subsequently added role/timeline/gate modules are locked at review time.

This is explicitly a retrospective addendum: it does not claim that the original run captured a complete historical runtime closure. The future public entry point durably captures its full declared literal-import closure before processing and checks it before/after every stage. The mismatch guard was exercised successfully against the omitted NBA module. The original low-level Python files remain frozen; use the public entry point for the stronger guard.

Observed review versions are Node24.8.0/ICU77.1, Python3.12.5, PyArrow/ArrowCPP26.0.1, Zod4.6.7, tsx4.23.15 and TypeScript5.9.3. Package metadata and npm/config lockfiles are fingerprinted. Except the originally recorded PyArrow version, these are observed review-time versions, not invented historical startup measurements. Native binary/OS dependencies are not a fully image-locked portable environment; successful same-environment semantic/byte replay is separately reported.

The pitching genericP layer intentionally records the20-appearance basis; SP10-start evidence is recorded independently. It is not an assertion that genericP20 is the only way an existing broad pitcher slot can accept an SP-qualified athlete.
