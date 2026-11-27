# Historical simulation methodology and review boundary

November 27, 2026. This establishes reproducible mechanisms and proposed variants. It does not approve material approximations or an official V9 baseline.

## Confirmed requirements

The authority is the current M6 master and M4 master. Use four sports, twelve franchises, nine sport-specific starters, five sport bench slots per sport, five universal bench and five universal IR slots. One shared ownership ledger prevents duplicate native athletes within each sport; MLB hitter/pitcher rows never create two athletes. NFL ends in FLEX/SUPERFLEX; NHL UTIL excludes goalies; MLB UTIL excludes pitchers. Generic P is bench-eligible without granting SP or a P starter slot. Explicit ten/twelve-starter arrays can be supplied later; none is invented automatically. Sensitivity interfaces accept four through sixteen franchises.

The primary spread uses **sport franchise medians**, not sport means. Both V5's [daily plan](../fantasy_evolution_codex_v9_website_md/reference/UBP_V5/UBP_V5_DAILY_SIMULATION_PLAN.md) and V9's [engine specification](../fantasy_evolution_codex_v9_website_md/14_SCORING_AND_SIMULATION_ENGINE.md) specify max-minus-min sport medians divided by their mean. Report percentage contributions, pairwise differences, means and per-seed spreads separately. A zero/nonpositive denominator is unknown; incomplete starter outcomes cannot establish balance.

V9 specifies complete 2016–2022 training seasons, separate COVID stress cohorts, 2023–2024 development validation and 2025 sealed holdout; 2026 is excluded from full comparisons. The [validation specification](../fantasy_evolution_codex_v9_website_md/03_SIMULATION_AND_VALIDATION.md) warns that 2023–2024 were already examined. A proposal for comparable four-sport training cycles is 2016/2017/2018/2021/2022, with per-sport 2019/2020 stress tests. This is conditional on actual cohort acceptance, not proof that those seasons are complete. Reserve draft seeds independently before optimization; do not choose a split or seeds by apparent balance.

## Information model

Raw statistical performance and retrospective source corrections may settle a previously locked selection. They cannot choose that selection. Compiled snapshots provide distinct professional fixture start, schedule knowledge, final knowledge, roster effective/known times, availability and statistical information availability. Final knowledge releases mutation locks; it is not an invented exact physical completion instant. A historical decision does not require a preexisting production fantasy league, ownership, snapshot, worker receipt or correction clock.

The source archives lack historical statistical known-at timestamps. The proposed conservative alternative is to expose a completed game's inputs at a later UTC decision boundary, such as two calendar days after its verified played date, with exceptional suspended/resumed games withheld unless their final chronology is supported. Retrospective final values may also contain corrections published after the original game; no complete historical revision stream is supplied. Lagged final truth is therefore an approximation, not proven original-as-of values. Such a boundary must be labeled simulated information availability; original source publication remains null. This alternative is **not activated for historical baseline execution**.

No current-season outcome, season-end position total, future trade or injury can enter its own earlier decision. Unknown participation is not DNP; an absent row is not zero performance. A source-selected MLB role is required before settlement; unresolved dual roles are rejected rather than maximized by points.

## Implemented engine

`seasonSimulationEvents` is the existing engine exposed as chronological DRAFT/WAIVER/LINEUP events. `runSimulationCycle` coordinates the four streams and one shared capacity ledger. The existing single-sport entry consumes that same generator. Seeded franchise permutations and sorted native IDs make replay independent of input ordering. Draft feasibility and matching preserve scarce slots without artificial SP caps.

Individual-game mode revisits editable slots at each professional start. A selected athlete and slot remain locked until explicit final knowledge is available before a later decision; that slot may then be reassigned without changing earlier selections or points. Doubleheaders commit each supported game separately. The distinct DAILY_FIRST_START control freezes the athlete through the daily/week period instead. Expected-points mode may leave a negative-expectation slot empty; legacy fill-first remains available. Both lock interpretations are implemented and tested; the primary historical strategy remains under methodology review. Production lock rules are unchanged.

Weekly waivers retain the existing calendar Wednesday 12:00 UTC control, FAAB 100 default, one proposed upgrade per franchise/window, deterministic bid/claim/rotating-priority ordering and one winner per athlete. Real production waiver rules are unchanged. With strict simulation mutation locks, no professional final knowledge means no invented release time. Available-player replacement projections use only eligible, unowned players, the current schedule and prelock expected performance.

The shared ledger enforces 66-seat baseline capacity, explicit IR eligibility and atomic replacement. Explicit shared bench allocations are supported, summing to at most five; absent allocation leaves those seats unallocated. The fixture allocation NFL2/MLB1/NBA1/NHL1 is a test parameter, not the official allocation policy. IR moves require prior eligibility knowledge and unlocked professional games. Unknown historical injury status causes no invented IR moves. Cross-sport dynamic bench strategy remains a methodology choice rather than an automatically selected rule.

## Ranking variants

The existing V9 implementation uses up to twenty previously available role appearances, divided by at least four observations (short-sample shrinkage toward a zero prior). This remains `TRAILING20_SHRINK4`. `V5_TRAILING10_PRIOR_FALLBACK` uses the current season's last ten available appearances after at least three, otherwise the preceding season's full known per-game mean. `PRIOR_SEASON_ONLY` ignores current-season performance. These are simulation projections only; website projections remain inactive.

Prior-season aggregates are maintained before the draft; target-season totals never initialize rankings. Missing-input outcomes are excluded, not assigned zero. A player with no prior observations has a model expectation of zero and seeded tie handling, which is a modeling prior rather than a known zero statistical record. Exact rookie/discovery/availability strategy requires review. Unknown positions do not become starting eligibility; a supported generic MLB P may still occupy a bench seat.

## Evaluation and limits

`scoreSimulationAppearance` calls production `calculateScore(ubpV9Rules, ...)`; no second scorer or coefficient vector is introduced. Unknown totals are withheld, negative complete scores retained, and one-decimal/inning-third/TE semantics come from production. Diagnostic totals are sums of known complete locked inputs and are explicitly incomplete when any starter result is unknown.

Outputs include franchise mean/median/range/population standard deviation, starts, scoring per appearance/required slot, distinct owned-versus-started players, draft-round and waiver contribution, position contribution and prelock available-player replacement expectations. Distinct-player bench utilization is not mislabeled as bench-days. Actual injury counterfactual effects, year-to-year stability and championship influence require comparable accepted cycles or a separately accepted H2H model. Three synthetic workload seeds measure determinism/performance, not professional scoring balance or confidence intervals.

The [consolidated review](M6_UNRESOLVED_DECISIONS.md) owns material choices before official execution. No optimizer, V10 activation, contract automation or M7 deployment is authorized.

## Compiling columnar data when decision evidence is supplied

`python3 scripts/export-m6-asof-selection.py --knowledge <explicit-knowledge.json> --output <new-ignored-directory>` joins the previous and target season's existing hash-bound Parquets with separately supplied native player/game/role information facts. NHL reads the frozen gate plus the separate resolved-event overlay. It never re-parses historical CSVs, supplies a missing timestamp, changes original fields or treats source-row absence as DNP. The knowledge file must explicitly declare nonofficial classification, roster/schedule/availability facts, statistical information times, participation and source references. The generated four-sport manifest is consumed by `run-m6-simulation.ts`; the existing snapshot validator checks temporal and identity uniqueness. No such decade-wide decision-knowledge file is currently supplied.

Explicit terminal DNP may settle a fantasy assignment at zero while its unknown statistical fields remain unchanged; it does not enter per-appearance projection history. UNKNOWN participation or a missing result stays withheld. This is distinct from zero filling a missing field. The scorer itself still returns unknown for incomplete inputs.
