# Bounded NBA6/NHL4 identity discovery review

All ten known discovery candidates have sufficient retained licensed evidence to prepare exact identity-only proposals now. This work is internal implementation and approval work, not an external source-data blocker. No additional sources were fetched, and no development rows were changed.

Fresh read-only canonical review at `2026-11-27T02:30:26.980Z` found all ten direct source IDs missing, with no existing reviewed overlay, no canonical UUID collision and no same-sport name collision after conservative case/diacritic/punctuation normalization. Normalized names are used only to reject possible collisions; they never establish a positive identity merge.

| Proposal | Exact new official IDs | Manifest fingerprint |
|---|---|---|
| NBA | 1631115,1641725,1642396,1642923,1642933,1643758 | `3b86bb9564997fcb1ac94ea792111e53b098b0237870b4515c3e48f47e0aaf23` |
| NHL | 8477573,8479406,8482451,8484821 | `fde0e0bc19dfe22548d27db88d32d932839533710f1fc7d7e93a49c74d215e8e` |

Combined identity-only fingerprint: `281641b0d5912b469d8b2153f19399774e28ee6049ae3ad355324a50aa717197`.

The ignored reviewed manifests and collision audit are under `data/operational_enrichment/direct_identity_discovery/`. These are separate from the frozen supplemental0413 batch; no approved or pending source manifest was regenerated.

## Evidence and limits

NBA candidates are Orlando Robinson, Trey Alexander, Blake Hinson, Otega Oweh, Keshon Gilbert and AK Okereke. Their18 retained box rows contain explicit official numeric person IDs, first/family names, team IDs and season2027. Immutable source SHA256 is `e57f6308f7f4a8184c5ccab14bab1f906f667e80715414fae9c582d147d7f5f1` from the licensed SportsDataverse NBA player-box release. Every candidate row was checked against its original physical source line. A DNP row can establish a recorded source identity, but cannot establish participation, health or eligibility.

NHL candidates are Nathan Walker, Filip Gustavsson, Mikael Pyyhtia and Sam Morton. Retained roster rows contain explicit official numeric player IDs and consistent full names. Immutable source SHA256 is `26c545b6130a3140ec15f2a68721b4b74f658d4e6990fe5c8caf643a31a395be`. All physical source rows and their hashes are retained in the exact NHL manifest.

Both source products are covered by the existing [SportsDataverse data license](https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md), CC BY4.0. No ESPN identity bridges are proposed. No date of birth, team creation, professional activity, current position, fantasy eligibility, scoring or ownership fact is inferred.

## Mechanism and validation

The NBA proposal reuses the existing reviewed-roster reconciler. The new NHL reconciler is limited to these exact four official IDs, requires immutable source proof and missing alias/review heads, fails closed on canonical ID/name collisions, and appends one audited review receipt. Each new athlete receives only one `v9-historical` namespace anchor for the explicit official ID, consistent with existing canonical architecture.

Three focused pure tests cover exact bounded discovery, source ID/name/hash disagreement and duplicate canonical targets, plus conservative punctuation/diacritic collision normalization. They pass. TypeScript and targeted ESLint pass.

The new `--verify-direct-identity-discovery` populated-copy hook executes before controlled competitive/browser fixtures. It verifies both immutable source objects, all89 original application tables, late second-component rejection rolling back the first, exact append counts, and empty replay. Expected append counts are Player10, PlayerExternalId10, ProfessionalDataObservation2 and ProfessionalDataDecision2; all other application tables remain byte-equivalent. Current central populated-copy verification passed: all89 original application tables preserved, exact10/10/2/2 appends, late-component atomic rollback and replay zero. The encompassing fresh-copy run validated196 foreign keys with empty Prisma drift.

`src/workers/apply-reviewed-current-direct-discovery.ts` remains disabled without the exact `APPROVED_CURRENT_DIRECT_IDENTITIES` approval hash. It additionally requires a matching fresh populated-copy baseline, paused managed stack, clean28-migration baseline, exclusive deployment locks, a private backup with cluster verification and full archive decode, preservation of all90 original tables including migrations, exact append counts and empty replay. It performs no automatic restore and never runs as a worker task.

Remaining work is explicit consolidated exact user approval, renewed predeployment verification and guarded application. There is no missing external identity evidence for these ten candidates. Subsequent unknown identities remain held for separate review.
