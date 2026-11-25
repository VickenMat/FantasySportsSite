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
| Weighted rookie lottery | The weighting formula and number of lottery-selected positions are not approved. | Provide configuration infrastructure only; reverse final standings remains the default and playoff teams are excluded. |
| Universal cap trade deadline | A universal asset can span independently scheduled sports, but its deadline is not approved. | Implement conserved current-cycle accounting; keep deadline-dependent execution gated. |
| Same-round playoff placement | Eliminated teams rank primarily by elimination round, but same-round tiebreakers are not approved. | Persist the elimination round and require configured/approved resolution before assigning ambiguous same-round final places. |
| Higher-salary repeat release | Replacement rather than stacking is approved for subsequent cuts, but the floor/dead-cap basis when the new salary exceeds the prior salary is not approved. | Implement equal-or-lower salary replacement and keep the higher-salary case pending. |
| MLB/NBA position repair | Current local accepted Parquet files contain no position columns; no repaired position source was found under project data. | Display unknown positions, retain canonical IDs, and keep historical observations separate from current eligibility. Do not infer positions from age, role category or missing records. |

## Data blockers

The remaining gameplay continuation adds exact missing-input counts in PLAYER_DATA_AUDIT.md. MLB's missing totals are role ambiguity (215 appearances / 135 players), while NHL has missing faceoff/shorthanded inputs and goalie outcomes (13,499 appearances / 831 players, overlapping reasons). These are not authorizations to choose a role or substitute zero. Historical position repairs have an idempotent append-only mechanism and manifest contract, but no concrete development target set or backfill approval exists without verified files.

Rookie drafts currently expose one–four configurable rounds, matching the existing future-pick round constraint. Longer configured drafts are implementation work requiring an additive constraint/configuration change, not an unresolved product decision. Exact lottery defaults remain gated; explicit commissioner-supplied weights and selected positions are supported without defaults.

Current availability, retirement status, rookie eligibility, verified game-completion instants, independently verified future season boundaries, and official statistical publication times remain unavailable across the development archive. The reconstructed master specification is now authoritative for confirmed decisions; isolated synthetic fixtures must exercise the corresponding mechanisms without manufacturing production evidence.
