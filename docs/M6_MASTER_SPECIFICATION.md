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
