# V5 historical schedule integration report

## Accepted source bundle

The local `data/` directory is ignored by Git. V5 was validated and imported from four Parquet files plus `schedule_validation.json`; no raw dataset or cache is tracked.

| Artifact | Rows | SHA-256 |
| --- | ---: | --- |
| `game_schedules.parquet` | 57,352 | `1724f7cc6143615036aee574de27aced3b9789de046a68b4991c399b6816671c` |
| `season_calendar.parquet` | 45 | `25f322a5316f9690dd72d30ade7ff65be113adf77b05e5f34fb9ec50fb4ef160` |
| `game_id_crosswalk.parquet` | 52,862 | `70a4f633d2b9a9e6f17a456f8243ed941d3b16a7af1de12129230761515b1edb` |
| `team_master.parquet` | 1,396 | `1b219050df3f51f27f25a6c4d81d208c5f8318ecf359d0b50c831d5305593be7` |
| `schedule_validation.json` | n/a | `ec3571bdd0a2391edc1c62df20d0ef449ca95b5f813c082a603b36de4c7196e1` |

The importer validates required physical columns, sport/game identity, unique schedule keys, crosswalk references, accepted unresolved records, placeholder timestamps, and the `verified_complete: false` boundary assertion before writing.

## Coverage and limitations

- Historical archive IDs: 52,866.
- Accepted matches: 52,862 (99.9924%).
- NFL, MLB and NHL match coverage: 100% according to the accepted validation report.
- Four NBA archive games remain explicitly `UNRESOLVED`: `0021900888`, `0021900894`, `0021900886`, and `0021900848`. No dates, IDs, or mappings were fabricated. Their player statistics remain intact.
- All historical schedule rows have starts. Five future NBA placeholders (`401909450` through `401909454`) have no published start and are recorded as `PENDING_FUTURE_START`; they cannot drive lineup locks or time-sensitive simulation.
- Two restored MLB rows contain scheduled timestamps whose actual start remains unverified. Their raw source basis is preserved.
- Observed first/last games are stored as calendar observations and `INCOMPLETE` schedule revisions. None of the 45 observed boundaries is marked independently verified.
- Professional postseason boundaries, fantasy scoring periods, fantasy playoff dates, and championship dates remain separate concepts.

## Database changes

Migration `20261125070650_schedule_integration_v5` adds import batches, append-only schedule observations, observed season calendars, team-season observations, versioned archive crosswalks, and explicit import issues. Matched games reuse the canonical statistical game when it is uniquely present. Otherwise a schedule-backed canonical game is created so future statistical import can reconcile through the crosswalk. Existing non-null game timestamps are never overwritten.

Development import batch `a04645b4-4dd4-4ddc-a54f-d11f1171e6e6` completed with 57,352 observations, 52,862 matched crosswalks, four unresolved rows, and five pending starts. Existing users, leagues, rosters, drafts, player statistics, and score ledgers were preserved.

## Idempotency and verification

The bundle identity is SHA-256 `187d59109cf706685d8da47f8996fafd1102e9c47aa6a6a9f02699332421705f`. A second isolated import returned the original completed batch without adding records. Isolated PostgreSQL counts were exactly 57,352 observations, 52,862 matched crosswalks, four unresolved crosswalks, five pending-start issues, and zero independently verified calendar observations.

At this checkpoint, 133 unit tests and 19 PostgreSQL integration tests pass; TypeScript and ESLint pass. Browser/build/security gates remain part of the final M4 acceptance run.
