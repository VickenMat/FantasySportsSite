# M4 unresolved gameplay rules

These decisions have no active default. Schema fields may reserve an extension point, but services must reject or show `PENDING_CONFIGURATION` when behavior depends on them.

| Area | Unresolved decision | Safe current behavior |
| --- | --- | --- |
| Salary rollover | Default fixed-dollar increase | Require explicit commissioner value before enabling increases. |
| Dead cap | Percentage, duration, and contract interaction | Store no release penalty. Do not claim release compliance when a configured rule would be required. |
| Non-auction salary | Salary assigned to free agents and waiver winners | Do not enable salary-league non-auction acquisition. |
| Salary waivers | Nomination and bidding mechanism | Inactive. FAAB is not converted to salary. |
| Contracts | Expiration, extensions, tags, restricted free agency | Retain only start/duration extension fields; no automatic action. |
| Over-cap correction | Exact allowed corrective transaction set | Always allow releases in the future design; do not activate other exceptions until confirmed. |
| Universal FAAB | Reset across independent sport rollover | Prefer per-sport budgets; universal mode remains unavailable. |
| Universal salary | Rollover boundary across sports | Separate sport caps can proceed; universal mode remains unavailable. |
| Salary transfers | Asset deadline | Reject configuration without an explicit deadline. |
| Cross-sport salary | Whether conversion exists | Never convert implicitly. |
| Rookie eligibility | Sport-specific definitions and sources | No athlete is rookie eligible without verified evidence. |
| Redraft keepers | Limits, costs, and duration | Preserve existing keeper fields but do not expand semantics. |
| Rookie order | Alternative methods beyond reverse standings | Reverse standings is documented but cannot run until final standings are authoritative; alternatives remain inactive. |
| H2H ties | Tied sports and overall matchup tiebreaker | Do not activate individual-sport-victory mode. |
| Playoff ties | Seeding and matchup tiebreakers | Require explicit configuration before an affected playoff. |
| Overlapping cycles | Weekly H2H pairing across two cycles | Do not merge or double-count; mark overlapping H2H construction pending. |
| Normalization | Schedule-normalized scoring formula | Extension point only; no multiplier is applied. |
| Universal bench/IR | Cross-sport capacity, movement, and simultaneous locks | Do not activate until shared-roster constraints are confirmed. |
| NFL championship | Exact handling of Week 18 in combined H2H | Week 17 is intended championship week and Week 18 cumulative; overlapping combined rules remain pending. |

## Data blockers

Authoritative professional season boundaries, UTC game schedules, current availability, retirement status, rookie eligibility, and statistical-correction publication times are not present across all existing archives. M4 scheduling and eligibility services report provenance and availability instead of extrapolating these values.
