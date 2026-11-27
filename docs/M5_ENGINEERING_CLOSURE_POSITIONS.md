# Current position and identity closure evidence

Reproduce locally with `node --import tsx src/workers/audit-m5-current-position-closure.ts`. This command reads retained licensed source bytes and frozen approved/accepted manifests; it performs no network call or database write. Its ignored report and separate proposal live in `data/operational_enrichment/current_position_followup/`. Expected canonical heads are guarded proposals until populated-copy validation, not a claim that development was queried or changed.

## NFL offensive coverage

The retained nflverse source contains 3,082 rows and 3,081 distinct valid native GSIS IDs. There are **964 offensive rows** in QB/RB/FB/WR/TE categories; one lacks GSIS, leaving **963 identifiable supported players**. The accepted current position manifest covers **961**. The two identifiable offensive holds are:

| Player | Native GSIS | Position | Hold |
| --- | --- | --- | --- |
| Devin Neal | 00-0040202 | RB | Explicit canonical identity/name-collision review remains required |
| Cam Miller | 00-0040222 | QB | Explicit canonical identity/name-collision review remains required |
| Al-Jay Henderson | missing | RB / DEV | Source row 3,083 has no GSIS; no native identity invented |

The other four held same-name source identities are OL/DB; they cannot be pushed into offensive slots. The 961 accepted roles comprise QB121, RB221, WR402 and TE217. No source row currently labels FB. This establishes that the mapping does not discard another available identified offensive category; it does not prove that the provider roster contains every real offensive professional.

Known unsupported professional codes DB/OL/LB/DL/K/LS/P now have a distinct display-only `KNOWN_UNSUPPORTED_ROLE` status. An unknown, expired, retracted, contradictory or novel position code stays UNKNOWN/CONFLICT. Raw professional code is retained; fantasy positions remain empty. No bench acquisition restriction was introduced.

## Six newly approved NBA identities

All six are absent from the retained 527-row direct NBA roster. Their **18 player-box rows all have blank positions**:

| NBA ID | Player | Box rows | Available crosswalk candidate |
| --- | --- | --- | --- |
| 1631115 | Orlando Robinson | 3 | ESPN4593049 / C |
| 1641725 | Trey Alexander | 4 | None |
| 1642396 | Blake Hinson | 1 | ESPN4396963 / F |
| 1642923 | Otega Oweh | 2 | None |
| 1642933 | Keshon Gilbert | 4 | None |
| 1643758 | AK Okereke | 4 | ESPN5114350 / F |

The three crosswalk position labels are **candidates**, not independently qualified current grants. A native NBA identity approved from game-box evidence does not independently verify an ESPN alias, source bio or roster position. No name-only merge or copied family position was made. The other three lack any current position in these retained products. Future fresh approved roster bodies may supply evidence normally; old bodies do not acquire standing authorization by re-download.

## Four newly approved NHL identities

Retained licensed game-roster source SHA-256 `26c545b6130a3140ec15f2a68721b4b74f658d4e6990fe5c8caf643a31a395be` explicitly supplies native ID, dated position and team:

| Native NHL ID | Player | Latest source date | Position → fantasy code | Team | Operational expiry |
| --- | --- | --- | --- | --- | --- |
| 8477573 | Nathan Walker | 2026-11-25 | L → LW | STL / native19 | 2026-12-03T00:00Z |
| 8479406 | Filip Gustavsson | 2026-11-25 | G → G | MIN / native30 | 2026-12-03T00:00Z |
| 8482451 | Mikael Pyyhtia | 2026-11-25 | L → LW | CBJ / native29 | 2026-12-03T00:00Z |
| 8484821 | Sam Morton | 2026-11-23 | C → C | CGY / native20 | 2026-12-01T00:00Z |

The separate proposed target is **`42b63da44b968677b91fd01e882ee81a7a2499df52b31ab55f0d50117f2fd88c`**: four POSITION and four TEAM_ASSIGNMENT observations/decisions. No availability, rookie, retired, statistics, ownership or financial fact is included. Source dates/first receipt/expiry remain unchanged; prospective accepted decision time controls the grant. Identity approval does not authorize these old-body current facts.

The populated-copy validator `src/workers/validate-current-position-followup.ts` asserts the exact target, all89 original application tables/rows preserved, exactly eight new observations/eight decisions, four expected positions/four expected teams, unchanged other current eligibility, unknown exact source clocks, late-error transaction rollback and zero-addition replay. Execution and any subsequent exact approval/application remain separate from this source-only preparation.

## Additional available MLB generic-P evidence

Five previously uncovered players have explicit same-team pitching appearance counts: Brady Basso669620(26), Ty Madden680744(20), Mason Barnett686930(20), Alec Gamboa687941(21), Tyler Samaniego701719(20). The existing P flex slot accepts generic P; these facts never establish SP or RP. Ben Brown's sixth source case already has prior-year eligibility and is excluded from this additional-player target.

A new additive helper outside the frozen historical transform modules requires an explicit P source role, recorded pitching reference, coherent available starts/relief totals, independent same-team scope and at least20 appearances. It does not change the prior recovered-role helper's output or sum teams. Exact read-only native-alias/season/head binding produced **`59762cfec052211d2ebc5ca5350a951a2a735d616f88652013b21fedb1fa03ed`**: five existing players, ten P-only observations/decisions covering2026 and2027. Source hash remains the accepted recovered repair hash7d642767…; exact effective/publication times stay unknown.

The proposal is isolated at `data/operational_enrichment/generic_pitcher_followup/reviewed_manifest.json`; it is not merged into NHL8 or any approved batch. `validate-current-position-followup.ts --generic-pitcher` validates10+10 appends, all original rows, no other eligibility changes, five current/five following projections and replay zero. Copy validation and exact required approval remain pending; no development eligibility/count change is claimed.
