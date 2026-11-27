# M6.0 historical simulation dataset specification

Authority: the user's M5 Engineering Closure, Operational Readiness and M6.0 Dataset Preparation request, November 26, 2026. M6.0 preparation is authorized alongside M5 closure. V10 methodology, training/validation selection, optimization, activation and M7 deployment are not authorized. All 56 active UBP V9 rules remain fixed.

## Source and storage contract

The four immutable accepted Parquet archives are the statistical foundation: NFL185,368; MLB794,974; NBA260,499; NHL506,116 physical rows, totaling1,746,957 over44 sport-season cohorts. The seven recovered CSVs and five accepted V5 artifacts remain immutable provenance inputs. Do not import the decade-wide archive into operational PostgreSQL. Store derived columnar partitions, evidence overlays, missing masks and quarantine artifacts separately under ignored data directories. Commit deterministic preparation code, tests, compact manifests and reports.

Each manifest binds source filenames/provider/license or explicit unknown rights, SHA256 hashes, physical counts, transformation version/configuration, derived counts/hashes, canonical key coverage, rejected/quarantined records and missingness. A deterministic replay of unchanged bytes/configuration must produce identical semantic output and fingerprints. Runtime generation timestamps must not create a new semantic dataset version.

Physical rows, valid statistical rows, canonical player-games, duplicate/paired-role rows, accepted scoring records and complete seasons are independent denominators. Preserve unknown values; missing never becomes zero. Source-row presence never establishes participation.

## Evidence and chronological safety

Preserve source IDs and explicit canonical crosswalks. No name-only merges. Historical-only ID namespaces must remain distinguishable from operational canonical UUID mappings and unresolved schedule bridges. Missing-ID NFL rows remain quarantined unless a verified explicit identifier resolves them.

Every player-game retains scoring inputs/masks, participation (played/nonplayed/unknown), professional role, position evidence quality and precision, effective/known chronology, source references and decision reasons. Scheduled starts, actual starts, observed completion and statistical publication stay separate. Historical source records without historical known-at evidence cannot become available to a simulated manager retroactively.

MLB selects one role per player-game: starting pitcher takes PITCHER; otherwise HITTER if batting; proven exclusive pitching remains PITCHER. Never combine roles or select by realized fantasy value. Classify placeholders, duplicates, missing participation and contradictions explicitly. Apply10-start/20-appearance position thresholds with independent multi-team evidence. Prior-season qualifying positions may support following-year policy, but a season-end total cannot create current opening-day eligibility. Unknown threshold dates and historical availability dates remain leakage gates.

NBA positions have distinct explicit granular, approved family-derived, historical estimated and unknown classifications. Estimated positional minutes belong in sensitivity data, not the strict dated eligibility baseline. Unknown health/rookie/team-history/discovery chronology remains unknown.

NHL exact faceoff wins require actors or explicit counts; shorthanded points require scoring strength and player credits. Validate event/credit completeness and goalie decisions independently. Never infer shutout from zero goals against, integer faceoff wins from percentages, or historical performance from roster presence. Retain field-level contradictions and all source evidence.

## Readiness and later interfaces

Every sport-season report separates row, player, game, player-season, position, participation, role and season completeness. Independently verified expected games and season boundaries remain nullable when unavailable. Complete versus partial/shortened/unverified seasons must be explicit. No automatic season-length normalization or survivor-only cleaned population is authorized.

Required readiness classes: Ready for full simulation; Ready with explicitly documented limitations; Suitable only for sensitivity analysis; Incomplete; Blocked by unavailable source evidence. Reports must enumerate the limitations and exclusion impact by sport/position, including survivorship, missing-player/position/stat, role, future-information and partial-season bias. These classes do not select the final V10 baseline.

Reusable data interfaces cover historical player pool/draft eligibility, preseason information, game schedule, daily availability, historical V9 inputs, dated positions, participation, role selection, roster constraints, replacement-level inputs, missing-data handling and candidate training/validation cohorts. Scoring evaluation reuses and is checked against existing V9 behavior; no second production scorer is introduced.

The future methodology must address four sports, standard nine starters, twelve franchises, league-size sensitivity4–16, one-decimal scores, target maximum cross-sport season spread0.5%, later10/12-starter validation, prior-information-only drafting/lineups, waivers and positional scarcity. These are interface requirements, not permission to optimize now.

## Exit evidence

M6.0 review requires verified immutable fingerprints; runnable preparation tools; all44 cohorts; measured canonical coverage; positions classified by evidence quality; supported MLB/NHL reconciliation; explicit participation/missing masks; chronology/leakage audit; partial-season inventory; deterministic derived fingerprints; and measurable effects of unresolved gaps. Loading archives into a dataframe alone does not satisfy the exit. A proposed dataset may be reviewed, but V10 methodology and final cohort selection require subsequent approval.

## November 27, 2026 authority: M6.0–M6.3

The Final M5 Eligibility Application and M6.0–M6.3 Simulation Foundation instruction authorizes the exact eighteen-fact target `81c8099d2816afb7a5606a8e5264807236dd3e1189e2ba5172f306232f562da2`, subject to unchanged sources/heads/expiry and all established deployment safeguards. It is applied with exactly eighteen observations and eighteen decisions, no other application-table appends, unchanged original rows, a newly verified private backup and zero-addition replay. No migration is approved or required. M5 remains 16/32; its two narrow recurring policies remain enabled.

Authorized phases are M6.0 preparation, M6.1 dataset/methodology acceptance, M6.2 the simulation engine and M6.3 unchanged V9 evaluation where accepted data permits. M6.4 optimization framework, M6.5 optimization, M6.6 positional/replacement optimization validation, M6.7 full sensitivity, M6.8 out-of-sample scoring validation and M6.9 V10 integration remain deferred. Configurable interfaces and descriptive diagnostics do not authorize those later phases.

The baseline is twelve franchises, the established nine starters per sport, five sport bench seats per sport, five shared universal bench seats and five shared IR seats (66 total capacity). The NFL format is QB/RB/RB/WR/WR/WR/TE/FLEX/SUPERFLEX, matching M4; MLB remains SP/SP/1B/3B/MI/OF/OF/UTIL/UTIL. NBA and NHL retain their existing nine-slot formats. Generic P eligibility does not grant SP, RP or a new pitcher starting slot. Stored production league overrides remain unchanged.

The previously specified balance objective uses **sport medians**: `(max sport franchise median − min sport franchise median) / mean of the four sport medians × 100`, target at most 0.5%. The proposed alternative using sport means does not supersede that existing formula. Report means separately. No hidden sport multipliers or scoring changes are allowed.

The eleven existing gate files are eleven NHL season partitions, not eleven different rules. The old evaluator's `strictSimulationEligible:false` is an unconditional safety flag. The separate G01–G11 analytical audit measures actual source and chronology predicates across all 44 cohorts; it does not change the frozen gates or production requirements. Production fantasy ownership, production starter snapshots, worker receipts and correction anchors are not prerequisites for synthetic historical fantasy state.

Complete terminal native event actors support separate offline resolutions of the 441 NHL source contradictions. Original archives, 55 frozen partitions and eleven gate artifacts remain unchanged. Source agreement is field-specific, not a universal publisher preference; shared upstream lineage is explicit. Missing shutouts and other inputs remain unknown. New retrospective qualification does not provide historical information timestamps or dated eligibility.

The engine must use chronological information only, expected-point lineup decisions, immutable locked selections, one MLB source-selected scoring role per athlete/game, unique ownership and bounded shared capacity. Missing scores remain withheld and cannot enter rankings. Simulation-only projection models and synthetic source facts never activate website projections or create operational leagues/ledgers. Material chronology, position, roster, shared-bench and ranking assumptions require the consolidated review before an official baseline is accepted. See [methodology](M6_SIMULATION_METHODOLOGY.md), [gates](M6_SCORING_GATE_REVIEW.md) and [decisions](M6_UNRESOLVED_DECISIONS.md).

## November 27, 2026: approved D1–D6 execution authority

The user has approved all six consolidated offline methodology decisions. The primary choices are two-UTC-day information lag; dated applicable positions and qualifying prior-season carryover; delayed discovery/last-observed continuity with unknown availability; rotating 2/1/1/1 universal bench and individual-game movements; exact V9 projection control with preregistered sixty seeds; and independently verified closed season inventories. Weekly information, prior NBA estimates, daily freeze and V5/prior-only controls are authorized sensitivities. See [the approved method](M6_APPROVED_METHODOLOGY.md) and `reports/m61-approved-methodology.json` for the frozen policy.

Approval does not supply a missing completion UTC day, independently closed inventory, absent player-game participation, or a missing NHL statistic. Strict evidence remains independent of modeled timelines. A source-calendar diagnostic must not be relabeled as an approved reconstructed primary result. All material original cohort/statistical acceptance criteria remain in force. The fixed 28-task checklist is preserved.

Preregister seeds11–30 development,31–50 validation,51–70 reserved; do not execute reserved seeds or new2025 campaigns. The exposure audit identifies already-published2025 diagnostics, so no assertion of an untouched2025 holdout is permitted. No V10 search, weight modification, projection website activation, contract automation or M7 is authorized.
