# M5 MLB position holds: exact local audit

Reviewed November 26, 2026. All **537 withheld imported 2026 player-seasons** are reconciled below. This audit used existing immutable recovered inputs and cached reports only: no database connection, network request, V5 reacquisition, production eligibility grant or frozen accelerated-batch change. The local source cohort reconstructs the previously accepted 1,472 players / 72,510 statistical rows and exactly the 935 source IDs in the approved historical repair manifest. This is not a fresh canonical-database inventory.

## Mutually exclusive reasons for the original 537 holds

| Reason | Player-seasons | What remains unknown |
| --- | ---: | --- |
| Recorded pitching below each independently recorded team's role threshold | 362 | Cross-team totals may qualify, but overlapping totals cannot be added without distinct-game evidence |
| Fielding below 20 recorded appearances; fielding starts absent | 166 | The alternative 10-start rule cannot be evaluated from appearance totals |
| Possible multi-team fielding threshold | 8 | Counts might overlap; source endpoint references alone do not prove disjoint team splits |
| No recorded appearance counts | 1 | Maverick Handley, MLBAM `668974`, is explicitly unmatched |
| **Total** | **537** | |

All 537 retained candidate records have `INSUFFICIENT_THRESHOLD_EVIDENCE`, with no invalid-count or contradictory-same-team fatal reason. **19** have differing repaired position lists; these are an overlapping quality flag, not another 19 players. Repaired lists remain observations rather than eligibility authority. The eight fielding-scope cases are Austin Wynns (`642851`), Chadwick Tromp (`644433`), Yohel Pozo (`650968`), Christopher Morel (`666624`), Jarred Kelenic (`672284`), Nelson Velázquez (`676369`), Juan Brito (`682877`) and Dustin Harris (`687957`). Never sum possibly duplicated full-season counts, union positions across teams, or turn absent starts into zero.

## Additional evidence recovered without a new provider

**Nine players have independently supported 2026 SP/RP thresholds in the accepted statistical archive.** Their per-game pitching rows explicitly record `gamesPlayed=1`, `gamesPitched=1` and `gamesStarted=0` or `1`. Grouping by player and game, checking the team/counter tuple, and collapsing only equal tuples yields the following minimum counts. No conflicting pitching game tuple was encountered.

| MLBAM target ID | Player | Supported role | Exact qualifying count |
| --- | --- | --- | ---: |
| `518886` | Craig Kimbrel | RP | 46 relief appearances |
| `605280` | Clay Holmes | SP | 18 starts |
| `607481` | Aaron Bummer | RP | 21 relief appearances |
| `657756` | Connor Seabold | RP | 21 relief appearances |
| `676742` | Cam Sanders | RP | 28 relief appearances |
| `684974` | Craig Yoho | RP | 34 relief appearances |
| `686751` | Seth Johnson | RP | 27 relief appearances |
| `688297` | Chris Roycroft | RP | 27 relief appearances |
| `702021` | Will Dion | RP | 26 relief appearances |

These source IDs cover **251 historical statistical source rows**, including both batting/pitching categories where present. A subsequently authorized READ ONLY canonical binding resolved all nine real-player UUIDs and exactly **251 empty latest historical observations**, with every prior stat UUID/content hash retained. Exact target fingerprint: `ee09780d243fc11e0246e23678554109c3b717acaf746b78f15cc770218ddebc`; manifest source hash: `b23a06cc2cd91de5d421846bcc51b91898d9eb7aead6fa956b2a573d7b0c7bec`. Separate ignored `mlb_nine_role_historical_manifest.json` and `mlb_nine_role_historical_preview.json` preserve those bindings. Disposable-copy validation and exact approval remain pending; no development revisions were appended. `reconcileHistoricalPositions` can already append independently supported historical observed role positions while preserving source statistics, official-publication timestamps and old revisions. That mechanism deliberately grants **no current eligibility**. Prior-season carry does not justify rewriting 2026 observed positions.

**140 of the 537 have independently supported 2025 threshold evidence.** The confirmed current-plus-following-year rule makes these valid candidates for 2026 carry, without obtaining new source data. Three overlap the nine current SP/RP cases, so the union is **146**. Their 2025 position proofs include 51 RP, 34 SP, 14 3B, 12 RF, ten LF, nine 1B, eight 2B, seven C, five CF, four DH and four SS grants; multi-position players account for multiple grants. This is not approval to backdate current eligibility: recovery known-at, source season, effective precision and prospective validity must remain distinct.

A further distinction matters: **15** players have 10 explicit pitching starts or 20 distinct games as defensive **P**, including the nine role cases. Four of those 15 overlap the 140 carry candidates; their union is **151**. The six additional generic-P cases are Brady Basso (`669620`), Ben Brown (`676962`), Ty Madden (`680744`), Mason Barnett (`686930`), Alec Gamboa (`687941`) and Tyler Samaniego (`701719`). Five expand the 146-person union; Ben Brown already has prior-year carry. General pitching participation never manufactures SP or RP eligibility. These players cannot fill an SP-only slot merely because P reached a threshold.

Accordingly, **391/537 lack supported carry or current SP/RP evidence**, or **386/537 when generic P is counted separately**. These are residual source-evidence holds, not proof of ineligibility or inactivity. Complete fielding starts or independently scoped appearance evidence could change them. The existing 19-column MLB play-by-play contains batter/pitcher/base-runner IDs, not position-specific defensive lineups or fielding-start totals, so it cannot close those fielding gaps.

## Source and implementation boundary

The evidence is not irreducibly missing for every hold. The nine current role cases were a **local aggregation gap**, and the 140 prior-year cases were an **unmaterialized carry-evidence path**. Existing per-game `calculateEligibility` already accepts current/prior-year fielding thresholds with effective/known-at gates. Recovered aggregate season totals are not per-game evidence. The separately implemented `src/positions/aggregate-evidence.ts` and `src/ingestion/aggregate-positions.ts` now provide an audited aggregate-count path with complete source-season/team scope, strict effective/known/publication gates and revision/retraction semantics, independently merged by the existing position resolver. The older exact-time aggregate path still cannot supply missing source-effective/publication evidence. Under the subsequently confirmed conservative snapshot policy, all 140 recovered cases now have a separate prospective operational proposal with explicit source season, original unknown clocks and actual review/application knowledge boundaries. They remain pending the new exact operational batch approval; no retrospective eligibility is claimed. Never manufacture game IDs or label derived carry as an official current LISTED designation. SP/RP role evidence and generic defensive P remain distinct.

The timestamp/evidence-policy decision in [M5_EVIDENCE_POLICY_REVIEW.md](M5_EVIDENCE_POLICY_REVIEW.md) still gates current eligibility promotion. Source effective and official publication instants remain unknown; local recovery time is only known-at. The historical-only nine-player route can be prepared under the existing append-only mechanism, but still requires disposable-copy preservation/idempotence validation and a separate exact backfill review. The 146/151 eligibility-source proposals remain undated and cannot be approved as executable eligibility backfills. The separately bound nine-player historical-only target may be reviewed after its disposable-copy results are available. This review does not expand the frozen accelerated batch.

Reproduce with `python3 scripts/audit-mlb-position-holds.py`. The script verifies both immutable input hashes, the retained derived-candidate fingerprint, the exact approved 935-ID set, all 537 reason categories and duplicate-aware explicit pitching counters. It writes ignored `data/position_enrichment/mlb_position_holds_review.json` and `mlb_position_additional_source_proposal.json`, containing every held source ID, original repair-line proof, role-qualifying game/line hash and carry explanation.

- Statistical archive SHA-256: `a58fee138f99f825b9af9737e93cd6c512ee7ab6c43ca1fa23dffab2819211d0`.
- Repaired position archive SHA-256: `7d642767b45d9e26f31778ebbf0456715d785de3ad3d274ec7bee1f07b7aec72`.
- Complete hold-audit fingerprint: `34a178423b4dc65c2bc47b0c6e0a83bee995d53e69a4bdf98c004d81c3f25db7`.
- Source-only additional-proposal fingerprint: `ea5573973ed326316f4745932fa331b440af1494d80b3a409d1ebd43986601ef`.

Neither fingerprint is an executable development-target approval. All accepted V5 fingerprints, historical sources and 56 V9 weights remain unchanged.


Separate historical-only validation entry: `--verify-mlb-position-continuation` in the populated disposable-schema verifier. It verifies direct recovered CSV game proofs and all 89 original application tables, expects only 251 PlayerGameStat revisions plus one ImportBatch, preserves publication/normalized statistics and every current-eligibility record, and checks both dry and approved replay add nothing. Coverage is reported separately for distinct players, player/game appearances and role rows so two MLB roles cannot inflate appearance counts. The standalone prepared deployment worker requires `APPROVED_MLB_POSITION_CONTINUATION` to equal the exact target, a paused development stack, matching populated-copy evidence and a fresh private backup that passes full archive decoding. It preserves all 90 development tables including migration history; it has not been executed.
