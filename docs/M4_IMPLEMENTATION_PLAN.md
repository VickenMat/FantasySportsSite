# M4 additive implementation plan

## Baseline findings

The M3.7.2 schema has canonical games, seasons, raw revisions, score ledgers, independent `LeagueSport` records, sport rosters, serializable draft/waiver/trade services, and append-only scoring evidence. It does not yet model authoritative professional season boundaries, data provenance for scheduling, championship cycles, schedule assignment, league competition mode, three distinct league formats, financial ledgers, draft-pick assets, rookie evidence, or commissioner audit history.

## Migration sequence

1. **M4.1 scheduling foundation**: add source-backed professional schedule metadata, championship cycles, league-sport-season assignments, scheduling states, and game-to-cycle attribution. Preserve the existing `LeagueSport.seasonId` as the current pointer while assignments hold history. Add unique constraints preventing a game from scoring twice in one league.
2. **M4.2 competition**: use the competition mode persisted by M4.1; add provisional/final result revisions, sport result components, finalization deadlines, and championship records. Existing matchups are backfilled without fabricating finalization evidence.
3. **M4.3 waivers**: add waiver method/configuration, holds, reservations, immutable FAAB ledger, and Vickrey settlement metadata. Backfill existing balances as opening entries only when their provenance is explicit.
4. **M4.4 dynasty**: add verified rookie eligibility, rookie drafts, future-pick assets, and append-only pick ownership events. Generate assets only for dynasty formats.
5. **M4.5 salary**: extend format enumeration, add sport-season salary accounts, player salary assignments/history, reservations, budget-transfer ledger, compliance snapshots, and contract/dead-cap extension records. Use integer currency and database conservation checks.
6. **M4.6 advanced trades**: introduce typed trade assets referencing players, picks, FAAB, or salary budget. Keep the current player asset table during a compatibility migration, then backfill and switch atomically.
7. **M4.7 lifecycle**: add idempotent rollover jobs, retention decisions, commissioner audit events, and guarded settings versions.

Every migration is additive until its replacement path is proven. Historical rosters, transactions, trades, scoring periods, and finalized results remain addressable.

## Service boundaries

- `professional-schedule`: validates source-backed boundaries and games; never chooses dates from constants.
- `season-eligibility`: selects the first season whose authoritative regular-season start is after the draft-completion instant.
- `championship-cycles`: assigns one sport season to one league cycle and enforces unique game attribution.
- `competition`: calculates provisional cumulative/H2H results from eligible starter snapshots and latest ledger entries.
- `finalization`: freezes competitive outcomes after 24 hours while allowing statistical history to continue.
- `currency-ledger`: handles FAAB and salary as separate exact ledgers with reservations.
- `draft-assets`: owns rookie eligibility and rolling pick generation.
- `league-lifecycle`: coordinates independent sport rollover through idempotent job keys.

## Query and concurrency plan

Use compound unique constraints for assignment, pick identity, ownership state, ledger idempotency, and rollover application. Use serializable transactions plus existing advisory sport locks for competing ownership/financial changes. Pages query current projections through indexed assignment/status fields; historical analytics remain separate from live gameplay paths.

## Delivery gates

Each M4.x milestone requires Prisma validation, unit tests, isolated PostgreSQL integration tests, applicable Chromium tests, TypeScript, ESLint, production build, audits, development integrity checks, documentation, and a local commit. Behavior depending on a row in `M4_UNRESOLVED_RULES.md` stops at an explicit unavailable state.
