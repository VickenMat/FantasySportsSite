# M5 evidence precision and operational policy decisions

**Resolved by explicit user approval:** granular NBA positions with the specified family fallback, conservative observed events/complete-final-box clocks, and prospective snapshot evidence are now confirmed. The alternatives and pending-decision language below are the prior review record. See [authoritative addendum](M5_MASTER_SPECIFICATION.md#confirmed-operational-evidence-decisions--november-26-2026) and [implementation/application report](M5_OPERATIONAL_COMPLETION_REPORT.md). New substantial data promotions still require exact reviewed approval.

No alternative policy in this document is activated. Current authoritative source-time gates remain intact. Permitted file retrieval, retained observations and isolated processing may operate while gameplay promotion stays pending. Data permission, timestamp precision and product rules are separate decisions.

## What the actual sources prove

| Input | Actual fields/example | Proven statement | Unproven statement |
| --- | --- | --- | --- |
| Current nflverse/SD roster | Season, player/team ID, listed position and status; artifact modified/retrieved timestamps | Publisher represented that roster data in the retrieved artifact | Exact roster/position/status effective instant, official statistical publication, or uninterrupted validity until the next fetch |
| Injury snapshot | `as_of_date=2026-09-08`, `injury_date=2026-07-18T23:18Z`, Day-To-Day in one NBA record | A dated snapshot retained a provider injury record with a separate record timestamp | That the July record timestamp is the September status-change instant or an official final-box publication |
| Latest injury snapshots | Nov 26 snapshot date; record dates range into prior months | Source status at its declared snapshot precision, with attribution | Healthy status for omitted athletes, midnight-UTC effective change, guaranteed return on `detail_return_date` |
| NHL event/game-info releases | Calendar `game_date`, OFF state, event period/time and explicit actors | Reported final state and exact event counts where completeness checks pass | Absolute UTC start/end, original source publication or correction instant |
| MLB play-by-play | Per-play start/end and explicit at-bat/player identifiers | Participation and recorded play timing | Exact whole-game completion or official box publication merely from the last play |
| GitHub artifact metadata | Asset creation/modification plus actual retrieval | Representation metadata and local acquisition/verification chronology | Original professional publication, actual game completion, or a restarted correction window |
| Official NHL HTML, research only | [Game 0043](https://www.nhl.com/scores/htmlreports/20262027/RO020043.HTM): 7:08–9:25 CDT, 2026-10-05; footer timestamp lacks explicit zone/publication semantics | Bounded event-clock evidence | Second-level UTC event/publication instants |

The last row is an access/precision example, not permission for an automated league collector. A date-only or minute-only field must retain its precision. A 12-hour clock requires corroborated meridiem/timezone conventions; customary sport hours are not evidence. Do not assign missing seconds or timezone silently.

## Decision 1: NBA coarse official positions

The direct NBA roster has G 208, F 167, C 65, C-F 15, F-C 27, F-G 11, G-F 33 and one blank. Both NBA and ESPN releases use coarse families; ESPN has Guard 237, Forward 205 and Center 88. Current granular PG/SG/SF/PF claims cannot be manufactured from these codes.

Proposed explicit fantasy rule, if the user approves:

| Source code | Proposed eligible fantasy positions | Concrete source example |
| --- | --- | --- |
| G | PG, SG | Luguentz Dort (1629652) |
| F | SF, PF | Jalen Johnson (1630552) |
| C | C | Rafael Castro (1643572) |
| G-F or F-G | PG, SG, SF, PF | Ron Harper Jr. (1631199), Jayson Tatum (1628369) |
| F-C or C-F | SF, PF, C | Onyeka Okongwu (1630168), Mitchell Robinson (1629011) |
| Blank/unknown | No eligibility | Drake Allen (1643789) |

This would be an approved fantasy family expansion, not a claim that the source explicitly designated every granular position. It broadens lineup flexibility equally for every manager; it can reduce scarcity of individual guard/forward slots and change draft/keeper value. Existing rosters and finalized snapshots must remain historical.

Alternative: retain the strict five-position requirement and wait for granular evidence; explicit C components can support C only. There are 107 C-bearing source rows, including 91 currently imported canonical players, but temporal approval still matters. Broad mapping could supply family-based position information for 469 directly matched imported players, plus two independently corroborated ESPN profiles if their bridges are approved. Three missing imported identities and the blank source position remain pending. No estimated-minutes history is promoted under either option.

Exact question for the user: **Should authoritative coarse roster codes expand to the listed fantasy families, or should G/F branches remain pending until granular evidence is available?** This decision alone does not supply dates or authorize a backfill; the exact dated evidence target must still be reviewed.

## Decision 2: precision and conservative operational evidence

The current exact-instant policy can remain unchanged. Its irreducible consequence is that the reviewed free releases cannot establish every actual-start/completion/publication instant, so authoritative live competition remains gated even though release synchronization and provisional historical analytics work.

The following alternatives are separate scopes within one evidence-policy review:

1. **Bounded actual-event/date evidence, strict publication clock.** Permit explicitly labeled minute/date intervals from an approved source. Lock at the earliest proven start bound; release holds no earlier than the latest proven completion bound plus 24 hours. Preserve the exact 24-hour official-stat-publication requirement for competitive finalization. Do not convert an observed LIVE transition into an exact start. If bounds are not sufficiently established, retain pending state.
2. **Observed complete-box clock, explicitly changed finalization policy.** In addition, permit a separately named first-observed-final/complete-box anchor. Start a new conservative 24-hour eligibility window only after a reviewed complete final box and final/completion evidence have been observed. Local observation remains labeled observation; it never becomes an official publication timestamp. This generally delays finalization relative to the unknown original publication, rather than shortening the guaranteed minimum review period. It changes the existing exact publication rule and needs explicit approval.
3. **Strict exact instants throughout.** Keep all current gates; seek appropriately permitted sources with the required time semantics. Daily artifacts must never be presented as live feeds or a measured one-minute service.

A transition interval needs an explicit earlier state and a later state with validated semantics. Absence from a release is not proof of an earlier SCHEDULED/not-started state. If the first known record is FINAL, it may establish an upper observation bound, not a fabricated lower event bound. Source staleness can invalidate prospective bounds. Preserve the raw observations, receipt order and the reason any interval remains open.

Fairness consequences must be explicit. Conservative lower-bound locks may reject legitimate last-minute changes; immutable starter reconstruction should flag changes within unresolved intervals for review rather than choose a favorable lineup. Upper-bound holds can keep players unavailable longer. Daily release delays can postpone matchups, playoffs and rollover. Any observed-box clock must be shared centrally for the same professional game and applied consistently to every affected league; it must not reset on each re-fetch, per-league request, duplicate record or corrected artifact. Corrections after finalized results continue to require the existing audited protection.

Status/position snapshot promotion also needs an explicit precision rule. If approved, retain separate **source-reported snapshot date**, **local known-at**, **validity interval/expiry** and **policy basis**. Do not place first retrieval into an exact professional-change field under the old semantics. Scope any assumption prospectively; no retroactive position grants, rookie eligibility or ownership changes. Literal Injured Reserve may support an IR claim under the approved sport/league rule, but Day-To-Day and profile Active cannot automatically clear or grant IR. Retirement needs an explicit designation and never removes dynasty ownership automatically.

Exact question for the user: **Keep exact instants, accept bounded events/snapshots while keeping publication strict, or also approve the separately labeled observed-complete-box 24-hour policy?** No choice grants access to restricted APIs, activates a new feed or approves an unreviewed development backfill.

## Engineering and audit boundaries

The implementation can retain all these facts now, with no invented production evidence. Actual gameplay promotion remains conditional on approved precision/position policy and an exact target manifest. The identity-review overlay records reviewer, reason, source hashes, expected old edge/head and immutable decisions; its review clock is a local administrative event, not official publication. Retraction fails closed before legacy mappings, and historical as-of resolution sees the prior mapping. New real-player creation requires a separate exact reviewed roster manifest; ordinary automatic PLAYER.NEW remains synthetic in disposable fixtures.

The smallest remaining user decisions are the two rule choices above, plus the concrete consolidated development backfill once its populated-copy verification is complete. No paid subscription decision is required for the implemented free-release synchronization. Providers with actual second-level events/publication could later remove assumptions without reusing a false timestamp or altering V9 weights.
