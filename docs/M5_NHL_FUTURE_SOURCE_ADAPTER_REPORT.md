# NHL source processing without an archive prerequisite

The adapter now supports fresh canonical V5 games even when no accepted historical PlayerGameStat row exists. `nhl-source-statistics.ts` normalizes actual skater/goalie box fields through the existing V9 normalizer, adds exact complete-event faceoff wins and complete scoring-strength credits, and validates goalie decisions using the existing complete same-game inventory proof. Field provenance and immutable source hashes remain explicit. It never converts faceoff percentages into integer wins or zero goals against into a shutout credit.

An existing historical head remains useful corroboration for older games; its 425 known-field conflicts are not overwritten. It is no longer a prerequisite for new game processing. The shared read-only collector uses the direct source path only for NHL games without a historical head and loads only the active sport's required products. Per-source semantic revision ordering is stable through unrelated source changes and replay. Original three-game and operational batch manifests were not regenerated.

Actual retained-source validation covered all 399 event/scoring games with zero rejected games. A separate read-only preview bound 26 canonical games previously lacking archived stats:

| Result | Actual count |
| --- | ---: |
| Fresh canonical games | 26 |
| Source box rows | 1,040 |
| Actual complete STAT candidates | 1,029 |
| Full source-box binding candidates | 15 |
| Held rows for missing canonical player IDs | 7 |
| Held rows for missing explicit shutout inputs | 4 |

The four distinct unknown IDs are `8477573`, `8479406`, `8482451` and `8484821`. They remain held; no identities or aliases were invented. The four shutout gaps remain unknown. Source wins are explicit or proven by a unique credited other winner in a complete canonical goalie inventory; blank decisions are not defaulted to zero.

A separate bounded future-game proposal is retained at `data/stat_enrichment/nhl_future_source/reviewed_future_game_manifest.json`, fingerprint `9fdd552390aaacbc84d3bc5b425401f35b55599eb29e4bd621aa2c3a1f5acf41`. It identifies source game `2026020374`, canonical game `681d9e71-56ef-447a-8b40-a2500ab7a081`, and 40 actual stat candidates. There is no historical-stat dependency, new game creation, game timestamp modification or automatic development promotion. Exact actual start/end/publication remain unknown; source OFF supplies only the separately labeled observed FINAL policy fact.

Two focused unit cases cover fresh direct-field/event derivation and unknown goalie shutouts. TypeScript and scoped ESLint passed. The preview performed read-only development binding and wrote ignored derived artifacts only. Database application/copy acceptance remains with the parent and requires its reviewed scope. This finite adapter proof does not claim every future game is complete, actual live updates or production fantasy chronology.
