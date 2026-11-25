# M4 unresolved and externally blocked behavior

The M4 master specification supersedes earlier proposals and resolves salary increases, dead cap, Vickrey acquisition, keeper costs, H2H structure, tiebreakers, universal budgets, and NFL Week 18 handling. The items below remain gated because the specification intentionally defers them or because authoritative evidence is unavailable.

| Area | Remaining dependency | Safe behavior |
| --- | --- | --- |
| Contracts | Expiration, extensions, tags and restricted free agency are deferred beyond M4. | Contract automation stays disabled; no expiry is inferred. |
| Corrective trades | A corrective trade must reduce payroll without bypassing the rule preventing an ineligible team from initiating ordinary proposals. | Permit releases and incoming compliant proposals; require an explicit corrective classification before allowing an over-cap outgoing proposal. |
| Rookie eligibility | Official sport-specific evidence is not bundled. | `PENDING_DATA`; no player is inferred to be a rookie from age, draft year or absence. |
| Injury and IR | Complete authoritative availability designations are not bundled. | Only verified evidence can unlock IR; offseason inactivity and retirement do not qualify. |
| Retirement | Verified retirement evidence is not bundled. | Players remain rostered and are never inferred retired from missing statistics. |
| Professional schedules | V5 is accepted. Four NBA crosswalk rows remain unresolved, five future starts are unpublished, and observed season boundaries lack independent verification. | Use accepted games where eligible and keep unavailable dates pending. |
| Correction publication time | The development archive has no official publication timestamps on its 107,312 stat revisions. | Preserve statistical revisions and keep competitive outcomes provisional until official timestamps are available. |
| Waiver game clock | The schedule bundle gives starts and completion statuses. It lacks verified game-completion instants. | Apply the verified release clock. Keep game-completion holds pending until a source provides the required instant. |
| Schedule normalization | Formula is explicitly unapproved. | Extension point only; never apply a multiplier. |
| Keeper Round 10 fallback | A draft configured below ten rounds has no approved substitute cost. | Reject the keeper configuration until an explicit cost is supplied. |
| Commissioner lottery | Lottery algorithms are configurable but no default lottery formula is approved. | Manual recorded order or reverse final standings; no hidden random lottery. |

## Data blockers

Current availability, retirement status, rookie eligibility, and official statistical publication times remain unavailable across the development archive. The repository contains the M4 master checklist and the older gameplay summary. The November 24 master specification itself is needed to verify detailed rules that those files omit.
