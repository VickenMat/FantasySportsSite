# M4 unresolved and externally blocked behavior

The M4 master specification supersedes earlier proposals and resolves salary increases, dead cap, Vickrey acquisition, keeper costs, H2H structure, tiebreakers, universal budgets, and NFL Week 18 handling. The items below remain gated because the specification intentionally defers them or because authoritative evidence is unavailable.

| Area | Remaining dependency | Safe behavior |
| --- | --- | --- |
| Contracts | Expiration, extensions, tags and restricted free agency are deferred beyond M4. | Contract automation stays disabled; no expiry is inferred. |
| Corrective trades | A corrective trade must reduce payroll without bypassing the rule preventing an ineligible team from initiating ordinary proposals. | Permit releases and incoming compliant proposals; require an explicit corrective classification before allowing an over-cap outgoing proposal. |
| Rookie eligibility | Official sport-specific evidence is not bundled. | `PENDING_DATA`; no player is inferred to be a rookie from age, draft year or absence. |
| Injury and IR | Complete authoritative availability designations are not bundled. | Only verified evidence can unlock IR; offseason inactivity and retirement do not qualify. |
| Retirement | Verified retirement evidence is not bundled. | Players remain rostered and are never inferred retired from missing statistics. |
| Professional schedules | Complete UTC game schedules are being acquired separately. | Schedule-driven competition stays `PENDING_DATA` for missing sport seasons. |
| Correction publication time | Historical sources do not consistently include the official publication timestamp. | Preserve statistical revisions but do not fabricate a competitive finalization timestamp. |
| Schedule normalization | Formula is explicitly unapproved. | Extension point only; never apply a multiplier. |
| Keeper Round 10 fallback | A draft configured below ten rounds has no approved substitute cost. | Reject the keeper configuration until an explicit cost is supplied. |
| Commissioner lottery | Lottery algorithms are configurable but no default lottery formula is approved. | Manual recorded order or reverse final standings; no hidden random lottery. |

## Data blockers

Authoritative UTC schedules, current availability, retirement status, rookie eligibility, and statistical-correction publication times are not present across all archives. Services report provenance and availability instead of extrapolating these values.
