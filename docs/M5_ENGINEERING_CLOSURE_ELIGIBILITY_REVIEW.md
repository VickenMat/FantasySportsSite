# Consolidated current eligibility follow-up — approved and applied

> November 27, 2026 update: this exact target is now explicitly approved, applied and replay-verified. All 90 tables' original rows were preserved. Proposal-time statements below are historical. See [the current application report](M6_ELIGIBILITY_APPLICATION_REPORT.md).

Exact proposed target: **`81c8099d2816afb7a5606a8e5264807236dd3e1189e2ba5172f306232f562da2`**.

Ignored manifest: `data/operational_enrichment/current_eligibility_followup/reviewed_manifest.json`. Parent component fingerprints are retained inside the manifest and audit:

- NHL eight-fact source proposal: `42b63da44b968677b91fd01e882ee81a7a2499df52b31ab55f0d50117f2fd88c`.
- MLB ten-fact source proposal: `59762cfec052211d2ebc5ca5350a951a2a735d616f88652013b21fedb1fa03ed`.

The combined target requests **one review/application**, not separate component deployment loops. It does not modify the approved supplemental/identity batches or either standing policy.

| Sport | Existing players | Proposed facts | Gameplay meaning |
| --- | --- | --- | --- |
| NHL | Nathan Walker, Filip Gustavsson, Mikael Pyyhtia, Sam Morton |4 POSITION +4 TEAM_ASSIGNMENT | Explicit dated native-ID positions/teams; L→LW, G→G and C→C only |
| MLB | Brady Basso, Ty Madden, Mason Barnett, Alec Gamboa, Tyler Samaniego |5 P-only counts ×current2026/following2027 =10 POSITION_AGGREGATE | Explicit independently supported26/20/20/21/20 pitching appearances; P flex only, no SP/RP inference |

Expected append scope: **18 ProfessionalDataObservation +18 ProfessionalDataDecision rows only**. No new Player, alias, Game, team, season, stat, score ledger, availability, rookie, ownership, financial or finalized-result row is included. If current projection assumptions remain valid, NHL supported current positions gain4 and current teams gain4; MLB current2026 eligibility gains5 (1,081→1,086), following2027 gains5 (944→949). These deltas were verified in the populated disposable copy; they remain proposed development changes pending approval/application, not new development counts.

The recovered MLB source hash remains `7d642767b45d9e26f31778ebbf0456715d785de3ad3d274ec7bee1f07b7aec72`; the NHL source hash remains `26c545b6130a3140ec15f2a68721b4b74f658d4e6990fe5c8caf643a31a395be`. Source rows, line hashes, independent team counts, native identities and existing canonical guards are retained. Exact professional effective/publication times remain null. Actual review/application decision time supplies prospective gameplay knowledge. No grant is backdated.

NHL's original operational expiry is preserved: Morton December1 00:00UTC; the other three December3 00:00UTC. Retained source date/first receipt are never refreshed by re-running preparation or re-downloading the same body. If a target expires or a canonical/source head changes before application, abort and review fresh evidence. Identity-only approval and the old-body-excluding standing snapshot policy do not implicitly grant these facts.

`validate-current-position-followup.ts --combined` passed the populated disposable copy. It verified both source bodies/recovered counts, exact heads, all 89 original application tables/rows, exactly 18 observations plus 18 decisions, nine current/five following position projections, four team projections, unchanged other actors, 18 null exact source clocks and zero-addition replay. Both a late-component failure and a late semantic failure rolled back valid preceding facts atomically. The exact result is retained in ignored `data/operational_enrichment/current_eligibility_followup/populated_copy_validation.json`; a sanitized summary is in [the application report](../reports/m5-engineering-closure-application.json). Copy validation is complete; development approval/application remains pending.

The deployment entry `apply-reviewed-current-eligibility-followup.ts` is disabled without `APPROVED_CURRENT_ELIGIBILITY_FOLLOWUP` matching the exact hash above. It additionally requires the successful exact copy report, local development database/default schema, paused managed workers, clean28-migration baseline, matching backup cluster, new private backup checked by listing and full decoding, unchanged source bytes/heads, all90 original-row fingerprints and exact final/replay counts. It never auto-restores or deletes unrelated data. No execution or authorization file was created by this workstream.
