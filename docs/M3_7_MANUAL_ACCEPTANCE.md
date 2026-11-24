# M3.7 manual acceptance guide

Run this guide only after starting PostgreSQL and Mailpit, deploying migrations, and restarting the application at `http://localhost:3000`. Use two existing owner-approved accounts. Do not create fixtures in an existing league unless the owner intends to keep them. For destructive or repeatable exploration, create a new acceptance league.

## Preflight

1. Run `npm run db:deploy`, `npm run db:generate`, and `npm run dev`.
2. Sign in to account A at **Sign in**. Open **Dashboard**, then sign out and sign in to account B in a private browser window.
3. Confirm both dashboards load and existing leagues remain present. Trigger **Forgot password** only for an inbox you control; confirm the Mailpit link resets the password and revokes the prior session.
4. For every test, record account, league name, sport tab, expected result, actual result, and screenshots or console/network errors. A failed request should display an actionable error and must not partially change a roster or draft.

## Resize the existing 2-of-12 league

Prerequisite: explicit owner approval to modify League0 and exactly two franchises currently exist.

1. Account A opens **Dashboard → League0 → Settings**.
2. Under **League capacity**, enter `2` and select **Save league settings**.
3. Expect the overview to show two of two teams, both existing memberships and franchise identities unchanged. Refresh and restart the server; expect capacity `2` to persist.
4. Try `1` and `17`; expect client/server validation and no persisted change. If resizing is rejected at `2`, check that no third franchise exists and the league is still in setup.

## Two-account, two-team draft

1. Each account opens **League0 → Draft** and selects the NFL tab.
2. Commissioner sets a short approved timer, confirms the two-team order, and starts the draft.
3. Account A makes pick 1.1. Account B refreshes or reconnects and must see the same pick and its own 1.2 turn.
4. Verify snake order is A, B, B, A for the first two rounds. Let one timer expire; expect one legal automatic pick, an `automatic` audit marker, and no duplicated player.
5. Pause as commissioner; expect the clock and automatic picks to stop. A manager must not be able to pause. Resume and finish.
6. Expect the draft to become complete, both NFL rosters to contain their picks, and refresh/restart not to lose state. Do not restart an already completed sport-season draft.

## Four-sport Dynasty league

1. Open **Dashboard → Create league**. Enter a unique name, choose **Dynasty**, choose desired visibility, leave NFL, MLB, NBA and NHL selected, choose 2–16 teams, and create.
2. No season selector should be required. Expect four sport tabs, one stable franchise, and separate roster/draft/waiver/matchup/standings areas for each sport.
3. Draft or add one player in one sport. Switch tabs; expect no cross-sport ownership leakage and no aggregate championship claim.

## Twelve teams: two humans and ten computers

1. Account A creates a 12-team league with **Fill open teams with computer franchises** enabled.
2. Expect one human franchise and eleven computer franchises. Account B joins through invitation or Public discovery; expect one computer franchise to be replaced, leaving two humans and ten computers without creating fake user accounts.
3. Restart and verify manager assignments, draft slots and franchise IDs persist.

## Independent NFL, NBA, MLB and NHL drafts

For each sport tab, configure rounds, 15–600-second timer and draft order, then start and complete its draft. Expect a distinct board, clock, queue, picks and roster. A player from another sport must be rejected. Completing NFL must not complete NBA/MLB/NHL. Reconnect mid-draft and verify current pick, elapsed clock, queue and prior selections. Computer franchises should make deterministic legal picks when due.

## Public and Private access

Public:

1. Account A creates a **Public** setup league with an open slot.
2. Account B opens **Dashboard → Discover public leagues**, finds it, and joins.
3. Expect membership and franchise creation/replacement exactly once. A repeat join must be rejected. Full or active leagues must not accept another manager.

Private:

1. Account A creates a **Private** league.
2. Account B must not see it in discovery and must receive no league data by directly opening its URL.
3. Join through a valid invitation. Expect a single membership. An expired, reused or wrong-recipient invitation must fail without exposing member details.

## Redraft with optional keepers

1. Create **Redraft** and set a nonzero keeper limit for one sport while leaving another at zero.
2. Complete a sport draft. In **Settings** or the team keeper control, select no more than the configured limit before the deadline.
3. Transition the sport season as commissioner. Expect selected keepers to receive new-season roster tenure, non-keepers to be released, FAAB reset, old roster history retained, and a new sport-season draft available.
4. A zero-keeper sport must release all active ownership. Late, over-limit, wrong-team and wrong-sport keeper requests must fail atomically.

## Rosters, players, waivers and trades

1. **My team:** move eligible players among starter, flex/util and bench slots. Expect ineligible slots and post-lock moves to fail; refresh to confirm persistence.
2. **Player pool:** search and paginate. Add an unowned free agent; expect one ownership and an audit transaction. Have two managers attempt the same player; exactly one may succeed.
3. **Waiver wire:** both teams claim the same player with valid FAAB. Process after the due time. Expect deterministic priority/bid resolution, one winner, losing claims resolved without a second owner, and correct budgets/transactions.
4. **Trades:** propose sport-scoped assets to the other team. The recipient can reject without roster changes. Submit another and accept; expect both rosters and audit transactions to change in one operation. Nonparticipants and cross-sport/invalid assets must be rejected.

## Historical replay, matchups, standings and playoffs

1. Open a league configured for historical replay and select a sport with imported data.
2. Advance a scoring period explicitly; the UI must label reconstructed historical results rather than live evidence.
3. Open **Matchups** and recalculate as commissioner. Expect the latest immutable ledger revisions to determine scores. A manager must not recalculate.
4. Open **Standings**. Verify wins/losses/ties, points-for/against and deterministic tiebreak ordering against the finalized matchups.
5. Generate playoffs only after qualifying regular-season results. Expect seeded playoff matchups, no duplicate team in one period, and stable results after refresh.

## Season transitions and permissions

Dynasty transition: record active owners, transition one sport, and expect those players retained with new-season tenure while other sports remain unchanged. Redraft transition: verify only approved keepers survive. In both cases, franchise ID and manager membership must persist.

Repeat commissioner-only actions (resize, draft configuration/start/pause/resume, waiver processing, matchup recalculation and season transition) as account B. Expect authorization failure and no database change. Repeat team actions against the other manager's roster, queue, claim or trade response; expect the same.

## Restart persistence

Record league/franchise IDs, draft status/current pick, roster players/slots, pending claims/trades, matchup scores and standings. Stop only the Next.js process, start it again, sign back in, and compare every value. Do not delete volumes or reset PostgreSQL. Pending clocks should resume from persisted timestamps; completed transactions must not replay.

## Known acceptance limits

There is no authoritative live schedule, injury, availability, pitching-rotation or professional transaction feed. Therefore live locks, current injuries, probable pitchers and real-world availability cannot be accepted as production-live behavior. Historical sources also lack independently timestamped preseason ranks and complete pregame evidence, so simulated decisions are reconstructed—not verified historical actions. V9 remains experimental, V10 is inactive, and the 0.5% cross-sport balance target remains unverified.

Troubleshooting: confirm the canonical URL is `http://localhost:3000`, restart after environment or Prisma generation changes, inspect the browser Network response and server log, verify the selected sport tab and league state, and confirm the worker was run for due timers/waivers. Never resolve an acceptance failure by resetting the development database.
