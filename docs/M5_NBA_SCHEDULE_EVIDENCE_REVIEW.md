# Targeted NBA schedule and crosswalk evidence review

November 26, 2026. This review supplements accepted V5 evidence; it does not reacquire or overwrite V5, change a game timestamp, append a crosswalk or approve a historical game match. Development writes: **zero**.

## Bounded licensed evidence

| Product | Records | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `nba_schedule_crosswalk_2020.csv` | 1,162 | 152,994 | `8a9cd2167561570b65eff0a0a0a0cb20db2b2bb6017aa9285930e24bdf1ad607` |
| `nba_schedule_crosswalk_2027.csv` | 1,207 | 107,984 | `db7ed5252ea5e72f4811da5daa70dff78ffc8ea570d8b50c60ccb1c0f7819a58` |

Both artifacts were obtained from SportsDataverse's existing `nba_crosswalk` release. The data license is identified in its [README](https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md), distinct from the software MIT license. Initial retrieval used four successful HTTP attempts including redirects, 260,978 bytes total; replay reused verified local files with zero new requests. Artifact updates were October 12, 2026 19:29:16 UTC and November 26, 2026 16:31:13 UTC. Those are file metadata, not official game publication. Content-addressed copies are retained in ignored provider objects.

## Four historical identity candidates

The 2020 supplement lists all four exact NBA IDs, NBA team IDs, game codes, dates and Yahoo aliases. Each row is `stats_only`: its ESPN ID and match confidence are blank. The recovered archive independently supplies the same NBA IDs/date/team pairs. Summing explicit player PTS agrees exactly with one and only one same-home/away-team V5 record within one day:

| NBA archive ID | Source NBA date | Candidate ESPN ID | Exact home–away score | Existing V5 date/start UTC |
| --- | --- | --- | --- | --- |
| `0021900888` | 2020-02-29 | `401161530` | 129–117 | 2020-03-01 / 2020-03-01T11:00:00.000Z |
| `0021900894` | 2020-02-29 | `401161536` | 99–115 | 2020-03-01 / 2020-03-01T12:30:00.000Z |
| `0021900886` | 2020-02-28 | `401161528` | 132–103 | 2020-02-29 / 2020-02-29T13:30:00.000Z |
| `0021900848` | 2020-02-23 | `401161490` | 107–104 | 2020-02-24 / 2020-02-24T12:00:00.000Z |

The source/accepted dates differ by one day in all four cases. The accepted starts are not independently verified actual starts and do not establish the source NBA date. No date, timezone convention or correction is silently selected. The explicit NBA↔ESPN bridge is still absent from the redistribution product; teams/scores/nearby-date corroboration is evidence for review, not a fabricated source ID.

Read-only canonical inspection finds one existing `schedule-v5` Game for each candidate, zero imported statistical rows, zero league assignments, zero score ledgers and zero lineup snapshots for those games. No separate operational `v9-historical` Game exists for these four 2019 IDs. All four original `HistoricalGameCrosswalk` rows remain UNRESOLVED and unchanged.

The exact candidate manifest is `data/schedule_enrichment/nba_candidate_bridge_manifest.json`, fingerprint **`2c5a373aeca22b5b703015b8c484a8debb7cb0aa874c232cb1ff9b8a2e3071cd`** over its serialized `rows`. Status: **PROPOSED_CORROBORATED_NOT_APPROVED**. It includes prior crosswalk UUIDs, canonical game/season UUIDs, both provider team IDs, exact scores, source hashes, existing-reference counts and explicit retained date/start conflicts. Reproduction: `node --import tsx src/workers/review-nba-schedule-evidence.ts --canonical-targets`. Without that flag, the source/V5 review performs no database access. No application command is provided by this review. A separately reviewed append-only mapping and consumer test would be required before declaring these four accepted limitations resolved.

## Five future placeholders

| ESPN ID | Available source date | Source team IDs | NBA bridge | Start precision |
| --- | --- | --- | --- | --- |
| `401909450` | 2026-12-04 | -1 / -2 | Missing | Date only |
| `401909451` | 2026-12-04 | -1 / -2 | Missing | Date only |
| `401909452` | 2026-12-05 | -1 / -2 | Missing | Date only |
| `401909453` | 2026-12-05 | -1 / -2 | Missing | Date only |
| `401909454` | 2026-12-08 | -1 / -2 | Missing | Date only |

These records remain `espn_only`; both team IDs are negative placeholders and all NBA IDs/codes are blank. There is no scheduled UTC timestamp, actual-start instant, completion instant or publication instant in either crosswalk schema. Therefore **zero pending starts** and **zero authoritative boundaries/timing fields** are resolved. A date cannot be converted to an invented midnight tip-off.

## Closure classification

- Historical four: corroborated identity candidates with retained date/start conflicts; direct bridge absent and real consumer/backfill acceptance incomplete. Preserve accepted unresolved rows until a reviewed resolution is accepted.
- Future five: source lacks time granularity and actual team/identity evidence; wait for a published schedule update containing positive team IDs and an explicit timestamp.
- Season boundaries: these products provide game rows, not independently verified regular/postseason endpoints. Do not infer endpoints from min/max dates.
- Actual start/completion/publication: these fields are absent; file-update and retrieval timestamps do not substitute. See the dedicated evidence-policy report for any requested operational alternative.
