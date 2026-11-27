# Approved conservative professional game events

This implementation follows sections 4–6 of the November 26 operational-completion instruction. The shared adoption floor is `2026-11-27T00:18:32.000Z`. Evidence predating that floor is not relabeled as a prospective observed-policy event. Permitted publishers use the shared evidence-policy registry; arbitrary fixture publishers work only in the authorized isolated test environment.

## Distinct clocks

`operational-game-events.ts` separates verified exact actual starts/completions from scheduled fallback, bounded event intervals and first observed in-progress/final state. Exact actual values remain null when unavailable. The shared SQL projection exposes `operationalCompletedAt` separately from exact `completedAt`. Existing `Game.startsAt` values, accepted V5 schedule observations and fantasy-period attribution are never rewritten by the observed-state promoter.

A verified schedule supplies the conservative lock even when no availability evidence or starter snapshot can be captured. An observed LIVE or SUSPENDED state locks immediately; an earlier verified actual start or supported lower interval boundary prevails. Once play is known, later schedule/status revisions cannot move that lock later. A verified pregame postponement/delay may move the fallback before play. A postponement never changes an existing fantasy-week assignment; NFL official-week handling is unchanged.

The server mutation guard independently checks relevant professional games for the moved player and both sides of a lineup swap. Relevant links are existing game statistics, explicit player-game availability and accepted professional team assignments, including approved snapshot team facets. It does not depend on successful snapshot creation. Postponed games remain guarded even outside their original fantasy-period dates.

## Immutable history and review

A late earlier start identifies affected immutable snapshots and assignment events. The accepted decision retains their IDs and `lockReviewPending`; snapshots and assignment events are not rewritten. Capture remains pending review and the competition layer must reject those unresolved inputs. A verified changed pregame boundary that conflicts with a previously captured fallback snapshot also requires review.

Reappearance of LIVE/SUSPENDED or another nonfinal state after accepted completion, differing verified completion instants, and an exact end later than the earlier observed-FINAL anchor require audited completion review. The clock keeps that review pending through subsequent routine FINAL refreshes; those refreshes cannot silently erase the correction issue. Previously accepted evidence remains immutable. The promoter invokes the shared correction-anchor invalidation helper for completion corrections, unresolved state contradictions and unsafe immutable locks; that helper appends its own audit record.

## Completion and waiver holds

A trustworthy uncontested FINAL state can create the first operational completion boundary. The canonical key `conservative-event-policy / operational-final:<game UUID>` is independent of publisher, artifact revision and worker process. Its immutable source record names policy, precision, source observation, publisher and actual completion (null when unknown). Unchanged responses, new FINAL revisions, failover and restart reuse that boundary. A supported later safe boundary may extend a hold; an earlier newly known exact end does not shorten an already communicated conservative hold.

`GameCompletionEvidence.completedAt` is deliberately treated as a hold boundary by waiver code. Its source metadata distinguishes exact verified completion from operational observed/bounded completion. The approved 24-hour game hold is added to that boundary; the independent release hold remains unchanged. Nonfinal or conflicting current state continues to block release conservatively. An observed FINAL alone does not establish complete statistics or start a competitive correction clock; that separate validation belongs to the complete-box publication policy.

## Verification scope

Twelve focused unit cases cover scheduled fallback, observed LIVE without an exact start, earlier actual starts, verified versus unverified pregame delays, suspension/rescheduling, bounded precision, persisted/refetched final anchors, exact completion preference, safe longer holds, nonfinal/cancelled states, invalid timestamps and persistent completion-review requirements.

The existing isolated game-state integration scenario was updated because its old assertions required missing exact timestamps to disable locks and later actual evidence to defer a scheduled fallback. Those expectations conflict with the newly approved policy. The replacement keeps postponement attribution, suspension, exact final completion, source-conflict and immutable-history coverage, and adds assignment/snapshot quarantine assertions. A second isolated scenario verifies first observed-FINAL persistence across refresh and publisher failover while exact actual timestamps remain unknown.

No development database writes or database-heavy tests were performed by this workstream. Parent-coordinated isolated integration execution remains required before the milestone is reported verified.

## Required starter coverage and first-capture safety

Capture now records source-linked ownership/assignment even if professional availability is UNKNOWN. It retains that UNKNOWN classification and game-link provenance; it does not infer health. Stats, explicit game availability and latest applicable accepted team snapshots can establish game membership. Eligibility remains queried strictly as of the lock.

`pendingGameStarterSnapshots` reconstructs every linked owned starter at the same safe lock and compares roster-entry IDs, starter status and locked timestamps. A partial QB-only snapshot set cannot hide other missing starters. The complete-box and period publication services must honor this guard.

Before first capture, `gameLockReview` detects actual slot/index/team changes after the supported boundary, including legacy schedule-only games. Unchanged duplicate administrative events are ignored. It writes an immutable internal `GAME_LOCK_REVIEW` observation with a quarantined decision and affected roster/event IDs, and capture returns pending review. The guard also detects the issue without requiring audit persistence. Existing snapshots and events remain untouched. Only an explicitly linked commissioner audit resolution can acknowledge the exact review fingerprint; no automatic starter choice or event rewrite is performed.
