# M4 acceptance guide

Use the permanent workspace `~/Developer/FantasySportsSite`. Existing development records must not be reset or reseeded. All 26 approved development migrations are applied; there is no pending deployment or backfill approval.

## Start the local website

```sh
cd ~/Developer/FantasySportsSite
npm run dev:all
```

Open <http://localhost:3000>. One supervisor starts Webpack, the draft timer and minute gameplay processing. Stop its terminal with Ctrl+C before starting another supervisor. The existing Docker Compose project and PostgreSQL volume remain in use. Production compilation is `npm run build`; `npm run start` runs that build without installing a production worker scheduler.

## Fresh account and league

1. Register a new account. Click the Fantasy Evolution brand to return to the public landing page; Dashboard and Account remain available and the session persists. Sign out only through the explicit action.
2. Create a two-franchise NFL redraft H2H league, select Upcoming or Following and review the actual sport labels. League creation and Waivers must load without a runtime exception. Larger and odd capacities are covered by PostgreSQL regression.
3. Copy a private invitation from Overview, or use Public visibility and join from a second account. Confirm both members see the same draft schedule.
4. Open Draft. Save snake or auction configuration, order, UTC instant, displayed timezone, rounds and timer. Salary dynasty requires explicit salary policy and an auction. Review the saved configuration from both accounts.
5. The room opens exactly one hour before the scheduled instant. Search/filter players and prepare queues; actual selection and auction actions remain disabled until server activation. Random order persists; custom order includes every participant once.
6. Review Waivers with All, Free Agents, Waivers and Rostered filters, position/search and available points. Rostered players cannot be acquired. Unknown scores remain N/A rather than zero. My Team, Draft and Waivers share canonical identities and the selected sport season.
7. Review immutable completed selections on Board and Results, and current ownership separately on My Team. Later renames and trades cannot rewrite captured labels/prices. Legacy selections without name evidence identify the original franchise ID and explain the missing historical label.
8. Use Trades for revisioned player/pick/FAAB/cap/cut proposals. Every participant accepts identical terms. Check the saved review interval, deadline guards, veto, execution and history. Salary follows transferred players; cap/FAAB is conserved.
9. Commissioner controls are in Settings, Matchups and paused Draft rooms. Read their exact guards. Offseason removal archives history and requires every included sport offseason, completed championships and resolved assets/obligations. Reversible draft corrections preserve original snapshots; score corrections preserve V9 sources and use compensating adjustments.

Current development data lacks independently verified future boundaries, official rookie/availability evidence and score publication/completion instants. A normal draft or lifecycle action may therefore remain explicitly pending. The testing shortcut does not bypass these requirements. Do not fabricate development evidence to finish a manual scenario. Existing League1 roster noncompliance is also preserved; its blocked draft can produce a meaningful health 503 while workers remain healthy.

## Complete isolated gameplay acceptance

These commands use a fresh uniquely named schema in the authorized `fantasy_evolution_test` database. They do not write fixture data to development.

```sh
npm run test
npm run test:integration
npm run test:integration -- --sequence.shuffle --sequence.seed=20261129
npm run build
npm run test:e2e
npm run test:e2e:restart
npm run typecheck
npm run lint
npx prisma validate --config prisma7.config.ts
npm audit --audit-level=low
```

The six required journeys are:

| Journey | Browser evidence |
| --- | --- |
| NFL redraft H2H snake | `playable-workflow.spec.ts` REDRAFT; fresh registration/join, completed draft, opponent schedule, revisioned trade, waivers |
| Four-sport traditional dynasty H2H snake | `playable-workflow.spec.ts` DYNASTY; independent drafts, season pointers, trade and waiver persistence |
| Traditional dynasty cumulative auction | `auction-workflows.spec.ts`; fresh accounts, public bids, settlement, FAAB/player trade and conserved balances |
| Salary dynasty auction | `auction-workflows.spec.ts`; fresh accounts, salaries/payroll, salary-following player/cap trade and immutable prices |
| Redraft keeper transition | `keeper-workflow.spec.ts`; isolated league/player fixture, website keeper selection and independent transition, exact next-draft round cost |
| Traditional dynasty rookie and competitive rollover | `rookie-workflow.spec.ts`; isolated authoritative-boundary/placement/rookie fixtures, website competitive assignment/activation, other sport unchanged, scheduled reverse-placement draft and consumed entitlements |

Separate draft-center and correction browser tests cover member-visible UTC schedules, custom order, hour-boundary preparation, queues, worker activation and audited replacement. Integration tests cover persisted random order, universal snake/auction scopes, concurrency, the exact source-backed 24-hour finalization boundary, expiry, conflicts and idempotence. Actual restart acceptance interrupts/restarts both server and workers and verifies persisted sessions, drafts, trades and waivers.

Browser screenshots go to disposable Playwright output directories. The three preexisting user screenshot modifications remain unstaged and preserved. The optional development-writing browser test is intentionally skipped in the normal suite.
