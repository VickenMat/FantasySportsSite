# M4 unresolved and externally blocked behavior

The M4 master specification supersedes earlier proposals and resolves salary increases, dead cap, Vickrey acquisition, keeper costs, H2H structure, tiebreakers, universal budgets, and NFL Week 18 handling. The items below remain gated because the specification intentionally defers them or because authoritative evidence is unavailable.

| Area | Remaining dependency | Safe behavior |
| --- | --- | --- |
| Contracts | Expiration, extensions, tags and restricted free agency are deferred beyond M4. | Contract automation stays disabled; no expiry is inferred. |
| Rookie eligibility | Official sport-specific evidence is not bundled. | `PENDING_DATA`; no player is inferred to be a rookie from age, draft year or absence. |
| Injury and IR | Complete authoritative availability designations are not bundled. | Only verified evidence can unlock IR; offseason inactivity and retirement do not qualify. |
| Retirement | Verified retirement evidence is not bundled. | Players remain rostered and are never inferred retired from missing statistics. |
| Professional schedules | V5 is accepted. Four NBA crosswalk rows remain unresolved, five future starts are unpublished, and observed season boundaries lack independent verification. | Use accepted games where eligible and keep unavailable dates pending. |
| Correction publication time | The development archive has no official publication timestamps on its 107,312 stat revisions. | Preserve statistical revisions and keep competitive outcomes provisional until official timestamps are available. |
| Waiver game clock | The schedule bundle gives starts and completion statuses. It lacks verified game-completion instants. | Apply the verified release clock. Keep game-completion holds pending until a source provides the required instant. |
| Schedule normalization | Formula is explicitly unapproved. | Extension point only; never apply a multiplier. |
| MLB/NBA position repair | Current local accepted Parquet files contain no position columns; no repaired position source was found under project data. | Display unknown positions, retain canonical IDs, and keep historical observations separate from current eligibility. Do not infer positions from age, role category or missing records. |

## Final decisions resolved by the latest request

No rookie lottery or ordinary custom ordering; reverse finalized standings only. Same-round playoff elimination uses original regular-season seed. Standalone universal cap transfers remain available throughout the current cycle; mixed trades obey all player deadlines. Player-specific acquisition floors use min(existing floor, new release penalty) and disappear when free agents in the applicable offseason. These are final rules, not remaining product gates. Over-cap franchises restore compliance through cuts; ordinary outgoing trades cannot replace the required releases, while compliant incoming proposals remain eligible. There is no pending authorization to add a bypass.

## Data blockers

The remaining gameplay continuation adds exact missing-input counts in PLAYER_DATA_AUDIT.md. MLB's missing totals are role ambiguity (215 appearances / 135 players), while NHL has missing faceoff/shorthanded inputs and goalie outcomes (13,499 appearances / 831 players, overlapping reasons). These are not authorizations to choose a role or substitute zero. Historical position repairs have an idempotent append-only mechanism and manifest contract, but no concrete development target set or backfill approval exists without verified files.

Rookie drafts default to four rounds and support longer persisted configurations through the approved lifecycle migration. Inventory expansion preserves existing original slots and traded ownership. Rookie lottery and ordinary custom ordering are revoked. Reverse finalized sport standings is mandatory.

Current availability, retirement status, rookie eligibility, verified game-completion instants, independently verified future season boundaries, and official statistical publication times remain unavailable across the development archive. The reconstructed master specification is now authoritative for confirmed decisions; isolated synthetic fixtures must exercise the corresponding mechanisms without manufacturing production evidence.

## Administrative safety boundaries

Offseason removal archives a franchise through an append-only event; it never deletes its team, results or ownership history. Every sport needs verified offseason bounds; championships and drafts must be finished, at least two participants remain, and assets/reservations/obligations must be resolved. Outstanding original or owned rookie selections block removal rather than being silently cancelled or reassigned.

Score corrections add audited signed adjustments inside the competitive correction window, with compensating entries for reversals. They preserve all V9 ledger entries and captured lineups; final results remain frozen. Draft undo/correction applies to the last reversible selection of an unfinished, paused traditional initial snake draft. Original immutable snapshots remain intact, replacements carry append-only label evidence, and timer jobs use a fresh correction generation. Downstream lineup/movement history, consumed rookie entitlements and settled auction accounting cannot be silently unwound. These are supported-operation guards, not missing-data excuses or ordinary rookie-order controls.
