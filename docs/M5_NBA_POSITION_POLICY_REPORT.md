# NBA approved position policy implementation

The November 26/27 continuation approves specific NBA positions first within the applicable period, with the stated family fallback. The policy is `NBA_GRANULAR_FAMILY_OBSERVED_V1`. Its processing/adoption floor is `2026-11-27T00:18:32.000Z`; this is a server processing boundary, not a claimed user-click or professional-change instant.

The new `NBA_POSITION_SNAPSHOT` observation is retained in existing ProfessionalDataObservation/Decision JSON, with no migration and no synthetic professional game. Exact effective/publication columns stay null. Original provider position, source record/hash, source snapshot date (nullable), first trustworthy known time, prospective applicability interval, revision, retraction and policy/precision metadata remain distinct. Derived position/classification and original evidence are exposed by the shared eligibility service.

| Evidence | Derived eligibility |
| --- | --- |
| PG, SG, SF, PF, C | The explicit position(s) only |
| G | PG, SG |
| F | SF, PF |
| G-F / F-G | PG, SG, SF, PF |
| F-C / C-F | SF, PF, C |
| Unknown/unsupported | None |

Equivalent explicit source spellings/separators are normalized; unrelated family expansions and estimated historical minutes are excluded. The most recent applicable period is selected before specificity. Compatible granular evidence takes precedence within that period; conflicting granular/family alternatives are quarantined without a broad union. A newer applicable family may supersede an older granular record. Ordered revisions, same-revision conflict checks, retractions, expiry and historical queries preserve earlier source facts. A retracted current stream cannot resurrect its older grant. Existing applicable legacy LISTED evidence remains available through the same projection; only explicit same-provider/time multi-position records are grouped.

Draft selection, acquisition-slot checks and roster movement already consume `getEligiblePositions`, so the policy adds no competing eligibility engine or starter-slot redesign. Existing PG, SG, G, SF, PF, F, C, C, UTIL definitions remain intact. Position evidence never edits a stored starter snapshot, player ownership, draft history, financial record or finalized score.

Focused pure tests cover all mapping categories, exact/multi-position precedence, incompatible sources, stale versus newer evidence, replay/equal revision, retraction/as-of, prospective bounds, expiry and unknowns. The new isolated integration fixture additionally exercises shared draft/acquisition/roster slot checks, conflict quarantine and no LISTED/exact-clock fabrication. Database execution remains delegated to the coordinated disposable-schema suite; no production eligibility promotion has occurred in this workstream.

`node --import tsx src/workers/prepare-nba-position-promotion.ts` prepares an exact read-only proposal after the approved identity batch is present. It verifies immutable licensed source objects and canonical alias heads, retains the 527 direct-roster rows plus two independently corroborated supplemental ESPN profiles, and freezes a prospective preparation boundary. It does not manufacture a source snapshot date, professional effective instant or official publication. The reviewed manifest is excluded at `data/position_enrichment/nba_observed_position_promotion_manifest.json`. The authorized post-A read-only run froze target **`0f16aaf52f3c25b007ab20574b1b79d95f311262217036552e9a3a743ee747a3`**, prepared `2026-11-27T00:37:29.885Z`: **529 players/observations/decisions**, comprising527 direct NBA source rows and two independently corroborated supplemental ESPN profiles. There are **528 supported-position targets** (65 explicit C,463 family-derived) and one unknown position. The three other accepted NBA identities still lack current source evidence. No LISTED rows, exact effective/publication times or development writes were supplied. Do not regenerate this frozen target to refresh its prospective clock. Substantial development eligibility promotion still needs exact populated-copy validation and a new explicit approval.

M6 must retain this policy/version and family-derived classification: broader guard/forward flexibility affects positional scarcity and prevents a valid comparison with older granular-only runs unless that difference is modeled explicitly. No weights or simulation are changed here.
