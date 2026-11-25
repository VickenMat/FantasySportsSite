# M4.7 commissioner audit and season assignment checkpoint

The commissioner settings workflow saves league and sport changes in one serializable transaction. PostgreSQL records the actor, action, effective instant, reason, and changed fields with their previous and updated values. The same audit captures capacity changes, draft-order changes, next-season assignments, and historical sport transitions. Direct updates and deletes of audit rows are rejected. Commissioners can review the latest 50 events in league settings.

Next-season assignment uses the sport's current season pointer. Repeating the assignment returns the existing next season, and other sports retain their own pointers. Historical replay retains its commissioner year control. Competitive rollover requires finalized results and a source-backed next-season assignment.

Versioned future-cycle settings, competitive activation and rollover, budget resets, commissioner transfer, and offseason franchise removal remain open. Published season boundaries and official corrections are prerequisites for live rollover acceptance. The append-only audit migration was validated in fresh disposable schemas.

The normal and shuffled PostgreSQL runs each passed 28 tests. Eight Chromium tests passed, including a commissioner saving a draft clock and reviewing the recorded change. TypeScript, ESLint, Prisma validation, the 136 unit tests, the production build, and both npm audits passed. The two new migrations were tested in disposable schemas. Development retained 17 applied migrations and matched every table fingerprint except the running worker's job log during the final regression.
