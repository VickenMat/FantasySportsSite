# Rules update v0.7 (confirmed)

## NHL utility eligibility
- NHL UTIL accepts F or D only. Goalies are not eligible. This supersedes v0.6.

## Waiver processing
- Rolling and FAAB: ordinary eligible free agents may be acquired immediately. A recent completed game or release starts a rolling 24-hour waiver period; each later completed game resets the expiry.
- FAAB: while on waivers, accept sealed bids from eligible franchises. At expiry, award to highest valid bid and debit that bid amount from FAAB budget. If no valid bid, free pickup becomes available. Equal bids and insufficient funds at settlement remain TBD.
- Rolling: claims and tie handling during the restricted interval remain TBD; once clear, free pickup.
- Vickrey: 24-hour bidding window from nomination; pricing and cap mechanics TBD.
- Preserve event IDs and timestamps for game completion, player release, waiver start/reset, bids, resolution, and acquisition. Use idempotent resolution to avoid double awards.

## UBP status
- No final approved UBP weights yet. Existing top-108 coefficients are exploratory and do not simulate legal position-constrained lineups.
- Next: obtain verifiable historical MLB 1B/3B/MI/OF and NBA PG/SG/SF/PF/C eligibility, reconcile missing stat fields, simulate 9/10/12-starter lineups and 4–16 teams, then optimize weights to exactly one decimal and retest.
- Athlete IDs must be canonical across game rows and dual-role entries; each athlete may occupy only one roster slot and score only for the active role.
