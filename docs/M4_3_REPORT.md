# M4.3 roster and lineup recovery checkpoint

The recovered foundation adds indexed sport and universal slots, append-only roster assignment and availability history, roster compliance snapshots, and immutable game-start lineup snapshots. All three recovered migrations were preserved. PostgreSQL coverage verifies that repeat capture is idempotent, that a later roster move leaves the snapshot unchanged, and that a direct snapshot update is rejected. Roster and acquisition coverage is still tracked in the master checklist.

## Disposable test isolation

The failing dashboard assertion found all eight seeded players plus 63 synthetic players left in the disposable database. Using a fresh schema exposed another fixture leak within a run. The lineup test marked its player as a demo and suppressed deletion errors even though immutable evidence retained that player. This fixture now uses a regular player, and its league teardown reports failures. The dashboard keeps its eight-player and four-sport assertions.

Each integration run deploys and seeds a unique schema inside `fantasy_evolution_test`. Both model queries and raw SQL use that schema. The temporary schemas were removed after success and failure. Existing rows in the disposable database's public schema were preserved.

## Verification

- Two consecutive PostgreSQL runs passed all 20 tests. A shuffled run also passed all 20, and the dashboard passed on its own.
- All 136 unit tests and eight Chromium tests passed. TypeScript, ESLint, Prisma validation, Turbopack, Git integrity and diff checks passed. The npm audit found zero vulnerabilities.
- All eight Parquet files were present. The five accepted V5 schedule artifact hashes matched the schedule integration report.

## Development data

Automated database tests used `fantasy_evolution_test`. Development inspection used read-only PostgreSQL transactions. All 17 development migrations were present and all 17 append-only triggers were enabled. The fingerprints of the historical schedules, crosswalks, player statistics, scoring ledgers, users and leagues matched before and after testing.

Development already had 45 roster entries and 45 roster assignment events before testing, compared with 40 of each in the handoff. The running development draft timer recorded automatic NBA picks 9 and 10 in the existing League1 during verification, bringing both counts to 47. Its periodic jobs and live application session activity also changed the all-table fingerprint. The recovery run left the development services and their records in place.

## Acquisition continuation

- The latest known designation governs universal IR. An active designation supersedes older injury evidence. An ineligible IR occupant blocks free-agent and waiver acquisitions until the roster manager corrects the slot.
- Releases start a 24-hour hold. Eligible waiver claims can reserve funds during the hold, and free-agent pickup cannot bypass pending claims.
- Pending claims reserve the sport's FAAB in the same serializable transaction that creates the bid. Cancellation frees the reservation, and an award debits funds and records the existing acquisition transaction atomically. The manager sees the spendable amount and reserved amount.
- The 24-test PostgreSQL suite covers release-clock boundaries, isolated sport balances, concurrent bids against one balance, idempotent settlement, and recovery from expired IR eligibility.
- The roster editor exposes the team's shared bench and IR slots on each sport tab. Exact slot selection and cross-sport swaps preserve each player's sport roster. Draft capacity counts the sport's own lineup and bench positions and checks roster compliance before a pick.
- The shared-slot continuation passed 27 PostgreSQL tests and eight Chromium tests. Chromium verified an exact shared bench position through the roster editor.

## Master-specification continuation

- FAAB now uses exact per-sport $100 accounts or an optional shared $500 championship-cycle account. Pending maximum bids are recorded as immutable reservations; cancellation, loss and settlement append balanced ledger entries and update compatibility mirrors atomically.
- Rolling priority is persistent per sport. Its initial snake order is reversed, equal FAAB bids use that order, and a successful claimant moves to the bottom. Auction-draft initialization remains gated until the league models an authoritative auction order.
- Source-backed completion evidence is append-only and starts a 24-hour player hold from the verified completion instant. Synthetic fixtures verify the boundary without converting scheduled starts into completion evidence.
- Dynasty acquisition remains available in the offseason. Competitive redraft free agency and waivers remain closed until that sport's applicable draft completes. Historical replay retains its separate behavior.
- Ordinary outgoing trade proposals now require a compliant proposing roster. Acceptance revalidates ownership, locks, exact cut counts and both franchises' final compliance inside the serializable execution transaction. The explicitly classified payroll-corrective exception remains gated.
- The additive waiver-accounting migration was exercised only in fresh disposable schemas. Production game-completion timestamps remain unavailable and no evidence was manufactured.

The verified-rookie block moves with the M4.4 evidence model; multi-party and financial trade assets move with M4.6; independent FAAB resets move with M4.7.
