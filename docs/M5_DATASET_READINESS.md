# Operational data and M6.0 historical readiness

Updated for November 26, 2026 Pacific. Operational imported-cohort completeness and full historical simulation readiness are different measurements. M6.0 preparation is now executed; V10 methodology, cohort selection and optimization remain inactive.

## Immutable foundation

| Archive | Physical rows | Cohorts |
| --- | ---: | ---: |
| NFL |185,368|11|
| MLB |794,974|11|
| NBA |260,499|11|
| NHL |506,116|11|
| Total |1,746,957|44|

Accepted Parquet, seven recovered CSV and five V5 fingerprints remain unchanged. Recovered files are inputs, not replacement archives. Derived partitions, overlays, source objects and backups stay outside Git and operational PostgreSQL. Source possession does not create a new license grant; permitted seasonal NHL releases retain their explicit CC BY 4.0 provenance.

## Operational cohort after the exact approvals

| Sport | Real identities | Historical-stat players | Effective historical complete players | All-source statistical players |
| --- | ---: | ---: | ---: | ---: |
| NFL |3,075|1,829|1,829|1,829|
| MLB |1,472|1,472|1,470|1,472|
| NBA |538|474|474|476|
| NHL |876|872|844|872|
| Total |5,961|4,647|4,617|4,649|

There are 1,314 identities outside the archive-stat cohort and 1,312 without accepted statistics of any source. The new identity approval grants no implicit positions or availability. The 40 new NHL rows are separate from the 40 unresolved imported historical shutout appearances/28 goalies. Two MLB production role targets remain unresolved. The 26 newly materialized existing-stat MLB scores do not repair different unsupported appearances.

Operational completion now has 3,263 first-observed records; five complete boxes/BOX_CLOCKs satisfy their separate prerequisites. FINAL-only evidence cannot establish a complete box, correction clock, exact actual event or historical fantasy ownership. Current source/role/position gaps remain in [the unresolved register](M5_UNRESOLVED_DECISIONS.md).

## Executed historical preparation

All 44 cohorts retain every physical row. Valid rows total 1,746,771; the 186 missing-ID NFL rows are quarantined without name-only merges. There are 1,691,779 unique sourced player-game keys after distinguishing paired roles. Unsupported NFL professional roles remain explicit and unselected for offensive fantasy slots. Missing values remain null and missing masks retain actual V9 requirements.

The 55 base/enriched Parquet partitions passed byte-identical replay and canonical row-content hashing. Stable frozen partition bundle: `34dcac0fa467824b91879c115342e14338ff1b6676c337ebf1a63a6e40675749`. The authoritative consumer package is `1bf3ed2bfee3283f010c983c347b5164dfaa729ab4abe6fa3cfc045143a00a6a`; mandatory full-vector gates cannot be skipped. See [preparation tools and commands](M6_HISTORICAL_PREPARATION.md).

MLB has 54,992 paired keys: 52,737 verified PITCHER and 2,220 verified HITTER selections. A separate 35-key role-quality overlay preserves athlete PLAYED and selectedRole=null; it neither claims physical role absence nor resolves the production Freeland/Kerkering cases. Points never select the role and both roles are never combined.

A separate 9,374-record pitching threshold layer reconstructs SP 10-start, RP 20-explicit-relief and generic P 20-appearance dates from 216,671 exact distinct REGULAR appearances. Dates remain DAY precision with null known-at, no same-game prelock grant and no current eligibility promotion. Fielding/DH threshold dates still lack per-game evidence; season totals cannot grant opening-day eligibility. Following-year candidates retain their source and chronology gaps.

NBA position classes are 206,281 family-derived rows, 22,612 explicit granular, 24,693 historical-estimated and 6,913 unknown. Original roster, embedded recovered and estimated-minute alternatives remain separate; none becomes dated pregame/current eligibility by assumption.

## NHL completeness is not uncontradicted readiness

The 55 licensed seasonal sources produce 505,864 exact archive-row supplementary matches; another 37,206 overlay keys lie outside the accepted archive and are not counted as coverage. Exact faceoff wins cover 455,245/455,497 skater rows, shorthanded points 455,137/455,497 and goalie wins 50,614/50,619. Shutout coverage remains 48,640/50,619, with 1,979 unknown and every known value zero.

Complete V9 input rows increase 47,427→503,774. Independent direct-box comparison covers all 506,116 archive rows and identifies **441 known weighted-source conflicts across 171 games**, including 438 otherwise complete rows. The mandatory gate yields 503,336 complete/no-known-conflict rows before participation/role checks and **479,710 retrospective-qualified rows** afterward. All conflict rows have false eligibility and null gated score; original values and valid FO/SH evidence remain retained. The earlier zero-conflict measure applies only to supplemented fields, not full scoring vectors.

Unknown shutout rows may disproportionately contain positive credits, so the retained population is not unbiased. Diagnostic missing contribution bounds use the unchanged 187-tenths weight, [0,187] per unknown credit, without imputation. Faceoff/shorthanded unknowns receive no invented upper bound. [Full package](../reports/m6-dataset-package.json), [source comparison](../reports/m6-nhl-full-box-corroboration.json).

## Native keys, UUIDs and chronological gates

| Sport | Native historical player keys | Existing real Player UUID matches | Native-game/V5 matches |
| --- | ---: | ---: | ---: |
| NFL |5,783|2,364|2,797/2,797|
| MLB |4,037|1,472|25,193/25,193|
| NBA |1,533|516|12,217/12,221|
| NHL |2,355|876|12,655/12,655|

Only 5,228 of 13,708 native player keys currently match operational UUIDs. Exact source namespace normalization is not an assertion that every retired historical athlete has an operational Player row. Existing V5 observations bind the matched game UUIDs; the four accepted historical NBA limitations remain unmatched. No wholesale import or name/date bridge occurred.

Strict historical prior-information simulation readiness is **zero**: historical publication, discovery, injury and schedule-revision knowledge remains unknown. Clear position codes and season-end thresholds do not supply absent known-at times. NFL/NBA/NHL 2026 ongoing cohorts are partial; MLB 2026 extent remains unverified rather than automatically partial. COVID-shortened structures and NFL schedule changes are flagged without normalization. Independently verified expected games remain null where absent.

The frozen base inventory classifies 31 cohorts as sensitivity-only, ten as blocked by missing NHL evidence and three as ongoing incomplete. None is declared ready for strict full simulation or automatically selected as a V10 baseline. Per-position memberships overlap; selected-only completeness is separate from full-sourced-key completeness and excludes no group silently. The [impact report](../reports/m6-preparation-impact.json) lists all withheld role actors and row/player/game/player-season/position effects.

## Review boundary

M6.0 preparation is reviewable: deterministic tools, source/derived fingerprints, V9 parity, all 44 cohorts, masks, source-quality gates and measurable limitations exist. A dependency-provenance addendum honestly distinguishes original startup hashes, retrospective baseline equality and future complete-entrypoint guards. It does not claim a portable image-locked environment.

No V10 methodology, training/validation split, missing-data assumption or position-estimate baseline was chosen. That review must address remaining source conflicts/roles/shutouts, historical chronology, partial seasons, source/position/survivorship bias and replacement behavior before optimization. No M6 evidence layer is a development backfill authorization.
