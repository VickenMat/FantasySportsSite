"""Concise current-authority documents from frozen policy and coverage reports."""
import json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
method=json.loads((R/'reports/m61-approved-methodology.json').read_text())
text='''# Approved historical simulation methodology

Authority: user instruction “M6.1 Methodology Acceptance and M6.3 Historical V9 Baseline Execution”, November 27, 2026. D1–D6 are approved for offline simulation. The previous decision review remains historical evidence; no repeat approval is required for those policies. Production evidence, eligibility, scoring and projections remain unchanged.

## Exact frozen policies

| Decision | Approved implementation |
| --- | --- |
| D1 | Verified completion UTC day D becomes modeled information at 00:00 UTC on D+2. Later verified completion days prevail. Weekly sensitivity uses the first Wednesday 12:00 UTC not earlier than that two-day floor. Exceptional/resumed games require supported completion-day evidence. Official publication remains null. Retrospective final revisions are labeled uncertain. |
| D2 | Applicable dated positions and qualifying previous-season carryover. MLB ten starts OR twenty appearances; current dated thresholds become usable only after their modeled knowledge boundary. Season-end fielding/DH totals never create retroactive current eligibility. Generic P never creates SP/RP or hitter UTIL. NBA granular-first/family fallback; prior NBA estimates sensitivity-only, never target-season estimates at opening day. |
| D3 | Prior supported discovery or delayed first observation; latest known team continues until superseded. Availability remains UNKNOWN. Existing prior-only participation heuristic is used without enabling proxy position eligibility. No fabricated injuries, IR, rookie classifications or announced starters. |
| D4 | Twelve franchises, nine fixed starters per sport, five sport bench, five shared bench and five IR. Rotation allocates 2/1/1/1, each sport receiving the extra seat five times in each twenty-seed group. Individual-game primary; daily-first-start paired control; unused universal seats diagnostic only. |
| D5 | Exact V9 trailing-twenty/shrink-four primary; V5 trailing-ten after three games with prior mean fallback; prior-only control. All ranking uses known-before information, no target-season hindsight. Seeds 11–30 development, 31–50 validation, 51–70 reserved. |
| D6 | Independent closed regular-season inventory required. Named V5/archive/native-info reconciliation is reviewable but not automatically accepted. Same starting-year four-sport mapping preserved. COVID2019/20 and partial2026 excluded; 2025 remains sealed going forward but has documented prior exposure. |

The modeled participation control reuses the existing implementation: nonpitcher/nongoalie 0.85; goalie min(0.85,(prior starts+1)/(prior role appearances+2)); SP only after at least four elapsed days from the last prior known start, min(0.55,0.2+0.07×(days since start−4)); relief based on prior relief share, capped0.35. Only known complete prior played outcomes enter this history. Unknown source health stays unknown. This is a deterministic strategy model, not a forecast recovered from historical publications. Missing-scoring exclusions can bias this history and are reported.

V9 projections retain up to twenty earlier appearances and divide their sum by max(4,count); no observations yields a modeled zero prior. Prior-only uses the preceding season's complete known mean. Source-defined NHL starter and MLB gamesStarted evidence informs only subsequent knowledge, never its own pregame selection. Rookies without earlier production use the modeled prior; their discovery still requires evidence.

## Acceptance boundary

The policy fingerprint is `{fingerprint}` in [the frozen manifest](../reports/m61-approved-methodology.json). Sixty seeded configurations and balanced allocations were frozen before new campaign outcomes. The source/scoring fingerprints are recorded there. No 2025 campaign or seed51–70 run is authorized in this baseline implementation.

The archive has retrospective final statuses and start dates, but no reliable actual UTC completion-day stream or historical schedule-publication stream. Ordinary-game source-calendar diagnostics therefore remain distinct from the approved primary lag. A scheduled UTC date does not become a verified completion day merely because Final exists. Native NHL GAME_END events have game clocks and assigned dates, without UTC event timestamps. These source limits are not solved by D1 approval.

All strict evidence reports and eleven frozen artifacts remain unchanged. The new gate report preserves independent/overlapping failures and separates candidate calendar counts from primary eligibility. No accepted comparable cycle is fabricated. Offline diagnostics can exercise real identities and scoring while preserving all missing appearances in their denominator.

## Reproduction

```sh
node --import tsx src/workers/freeze-m61-methodology.ts
python3 scripts/prepare-m61-history.py --snapshot-year 2023
python3 scripts/audit-m61-holdout.py
node --import tsx src/workers/run-m61-historical-diagnostics.ts 2023 31
node --import tsx src/workers/verify-m61-historical-leakage.ts
```

Large snapshots/campaign traces remain ignored under data/simulation/approved_model_v1. Reports never describe diagnostic known-point totals as complete franchise scores. Finite fixed-assignment intervals are separate from adaptive rerun scenarios. Missing rows are UNKNOWN, never expanded into DNP. No original historical partition, production record or V9 coefficient is changed.
'''.replace('{fingerprint}',method['fingerprint'])
(R/'docs/M6_APPROVED_METHODOLOGY.md').write_text(text)
