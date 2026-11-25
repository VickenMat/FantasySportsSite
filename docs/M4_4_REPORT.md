# M4.4 future-pick inventory checkpoint

A dynasty commissioner can grant the next three seasons of four-round rookie pick entitlements from the selected sport's future-picks page once league setup is complete. Each entitlement records the originating franchise and current owner. The grant and its first ownership event are atomic. Repeat grants preserve existing entitlements and their history. A sport that advances to its next season can extend the inventory without changing the other sports.

The inventory uses start years without creating professional season records or guessing draft dates. PostgreSQL rejects redraft grants and picks owned by a franchise from another league. Direct ownership history changes are rejected.

The new migration is additive and has been exercised in the disposable test environment. The development database remains on the original 17 migrations.

Both the regular and shuffled 26-test PostgreSQL suites passed. The eight Chromium tests include granting 48 four-round NBA picks for four franchises and repeating the grant through the browser. TypeScript, ESLint, Prisma validation, the 136 unit tests, and the Turbopack build passed. Read-only development fingerprints matched for every table except the running development worker's job log.

Live rookie eligibility needs authoritative sport-specific evidence. Linear rookie draft execution, acquisition gates, pick transfer and consumption, automated rollover, and keeper history and costs remain open. The November 24 master specification will resolve details omitted from the recovered summaries.
