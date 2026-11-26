# M5 real-data integration and NHL backfill review

Development migration 28 is approved and deployed. No migration is pending. This review records the separately approved and applied NHL and MLB historical batches; NFL disposable ingestion is not a development import approval.

## Concrete NHL target

The ignored manifest `data/stat_enrichment/nhl_real_manifest.json` has canonical fingerprint **`ebef6aa292e8cebc466f9b6f12fdd1ce15e21b99bcca6730690ccda70ce30f61`** (stable normalized JSON SHA-256). Each target includes canonical player/game IDs, prior stat ID/content hash, exact added fields and event-level provenance. No historical archive is overwritten.

Append **11,808 PlayerGameStat revisions for 785 NHL players**, retaining every original row and ID. Each adds exact faceoff wins and shorthanded points only where previously unknown. Goalie wins and shutouts receive **zero** new values. Reconciliation accepts 351 of 399 complete games; 48 games with inconsistent scoring/box evidence remain withheld. Faceoff percentages only validate event-derived counts. Explicit scoring strengths and current scoring credits are checked against full boxes; stale PBP assist credits never override them. Known zero requires a validated complete stream.

Before: 831 imported NHL players have incomplete V9 inputs. Proposed after: **153 newly complete, 678 still incomplete**. This describes historical statistical completeness, not authoritative publication/finalization readiness. Position coverage and current eligibility do not change. The missing goalie evidence, all rejected games and canonical unresolved rows are recorded in `data/stat_enrichment/nhl_real_reconciliation.json`.

## Sources and fingerprints

These current-season releases are published by SportsDataverse, with data licensing identified in its [repository README](https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md). Preserve attribution to SportsDataverse contributors and identified upstream statistical sources, identify normalization changes, and imply no endorsement. This permission does not activate direct restricted league endpoints or confer image/logo rights.

| Source | SHA-256 |
| --- | --- |
| [skater_box_2027.csv](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_skater_boxscores/skater_box_2027.csv) | `dcaf102977847a02df33aef9d6b3b9cf97bb32a996b48eb1c973d9750b6a83b5` |
| [play_by_play_lite_2027.parquet](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_pbp_lite/play_by_play_lite_2027.parquet) | `6d16cbc1c1747a54eb6ff5f0b2b2ef399bc5c0a17c1667131cd6989e69318606` |
| [scoring_2027.csv](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_scoring/scoring_2027.csv) | `8dac66e73efac0560c32cfb69ff1c37d924e320e862c085403df0133c6b7b454` |
| [game_info_2027.csv](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_game_info/game_info_2027.csv) | `0ebc8b3b1f854c78d99f08d5ae81e298d530ab59b970cd14b75eca67621cc1f2` |
| [goalie_box_2027.csv](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_goalie_boxscores/goalie_box_2027.csv) | `24db76222d6da416a840ef4793bad18d11afdfce7be9098497eeb18fcae36dcc` |

## Populated-copy acceptance

Executed `node scripts/verify-pending-migrations.mjs --verify-real-sources` against an isolated schema in `fantasy_evolution_test`. All **89** original application tables retain their original rows/fingerprints; **196** foreign keys pass and Prisma drift is empty. NHL dry-run and application agree on 11,808 changes; replay has zero changes. Source publication, observed positions and canonical player/game/role identities remain unchanged. NFL source ingestion and replay were also exercised in the copy; none of those extra copy records are included in this development proposal. Evidence: ignored `data/stat_enrichment/real_disposable_validation.json` and private `/private/tmp/m5-real-pipeline-copy-2.log`.

Development application requires explicit approval of this exact manifest, paused workers, a fresh private backup with listing/full decode verification, baseline original-row fingerprints, exact target/hash revalidation and post-application preservation/idempotence checks. Append one provenance ImportBatch and the reviewed revisions only. Existing ownership, lineups, all competitive/financial ledgers and publication timestamps remain unchanged. No score recalculation or feed activation is included.

Because revisions are append-only, recovery retains the private backup for restoration during a controlled outage; selective correction would append compensating revisions rather than delete history. No automatic destructive rollback is proposed. Remaining risk is a short transaction/lock interval and the limitations of licensed redistributed event evidence. The 24-hour competitive finalization gate remains closed without actual completion/publication evidence.

**NHL approval status: explicitly approved and applied.** Exactly 11,808 revisions were appended, for 185,945 total development stat revisions. All 90 original tables (89 application tables plus migration history) retained their original records. Replay changes: zero. Source publication, positions and competitive ledgers are preserved. Fresh 54,370,306-byte backup passed listing/full decode; SHA-256 `afc4ba2b2ea7b2b2537e7bc735e217c4bbba3957fce6226f1017424b92ad1e58`. The stack restarted successfully. Actual read-only completeness is now 678 affected NHL players / 1,693 evidence-aware affected appearances, versus 831 / 13,501 evidence-aware rows before (13,499 source-null-only rows plus two unsupported positive credits). The additional two positive-but-unverified shutout credits remain separately withheld for explicit evidence. Application evidence: ignored `data/stat_enrichment/nhl_development_application.json`.


## Newly confirmed MLB role policy and concrete materialization proposal

The user confirmed: **use PITCHER for a starting pitcher; otherwise use HITTER when the player bats**. Exclusive pitching without batting remains PITCHER only where complete-game evidence supports absence. The pure policy is tested without scores as an input. Explicit positive participation/starts resolves the 92 actual both-role appearances, including 13 games where missing plays prevent absence-based reasoning. No absence is inferred in those 92 cases.

The reviewed manifest `data/stat_enrichment/mlb_validated_role_manifest.json` has full target fingerprint **`c0efa541b199b0cd7d65c4b58377f848f4d3b052cef602f1cd3eccbc9c175460`**. It identifies canonical player/game IDs, both prior stat IDs/hashes, source game completeness and positive batting/pitching/starting evidence. Source: `mlb_pbp_2026.csv.gz`, SHA-256 `2b70412a7661d9b15674f3126081ec389d7918482d1c7c7167c6885a105bb6c4`.

Proposed development materialization: **197 new historical ScoreLedgers and 197 ScoreLedgerEntries across 128 players**: 115 PITCHER and 82 HITTER choices. It uses the existing V9 ledger, not a new engine. This adds zero PlayerGameStat revisions and changes no source values, positions, ownership, lineup snapshots, eligibility, publication timestamps or existing ledgers. No LeagueScoreLedgerEntry, championship result or financial record is changed. All 197 existing-ledger targets were confirmed absent in a read-only development check. Eighteen appearances across 18 players remain withheld; 117 of the original 135 players would have no unresolved scoring-role appearance.

A populated disposable copy scored all 197 appearances completely, replay changed zero entries, and all original global ledgers/entries and stat counts were preserved. Website analytics returned all 128 affected players. Evidence: ignored `data/stat_enrichment/mlb_role_disposable_validation.json`; private `/private/tmp/m5-real-mlb-approved-copy.log`. The source snapshot, canonical target and role policy are fingerprinted in every proposed entry reason.

**MLB materialization status: separately approved and applied.** Workers were paused, a new private backup containing the NHL repair passed listing/full decode, targets and ledger absence were revalidated, and all 197 ledgers/entries were added in one serializable transaction. All 90 original tables preserved their original rows; replay added nothing. Development has 232 total global score entries and unchanged 185,945 stat revisions. The stack restarted successfully. Backup: 59,315,255 bytes, SHA-256 `ececc4326c330fcba6471ce3aadae1b9ebbf3357683bf9e1d0572dc6a660ec50`. Actual read-only completeness is now 18 unresolved MLB appearances / 18 players. Application evidence: ignored `data/stat_enrichment/mlb_role_development_application.json`. Append-only accounting remains intact; recovery retains the backup, with a separately reviewed compensating correction if required. No feed activation or competitive finalization is included.


Explicit goalie evidence safety: the importer no longer grants a positive shutout from zero goals against and elapsed ice time. Two legacy positive source rows remain untouched, but scoring/analytics treat their unsupported credit as unknown. The evidence-aware NHL audit has 1,693 affected appearances / 678 players, including all 40 shutout evidence gaps; the source-null-only count remains 1,691. This change appends no development records or ledger entries.


Both approved manifests are also retained separately under `data/stat_enrichment/approved_manifests/<approved-fingerprint>.json`, so future preparation outputs cannot overwrite the reviewed evidence. All source snapshots, manifests and private backups remain excluded from Git.
