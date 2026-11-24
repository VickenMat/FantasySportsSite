# M3.7.1 manual acceptance fixes

## Draft root causes and fixes

Automatic expiration existed only in the one-shot `fantasy:process` command. No continuously running local scheduler invoked it, so a browser countdown could reach zero while the database remained unchanged. `npm run fantasy:draft-timer` is now a long-running server-side worker that polls persisted deadlines, recovers overdue picks after restart, selects the first available private-queue player, and falls back to the deterministic positional-needs strategy. Serializable transactions and draft/player uniqueness constraints arbitrate manual-versus-automatic races.

Pause previously stored `pausedAt`, while resume set `pickStartedAt` to the resume time. That intentionally restarted the full configured duration. Drafts now persist `pickDeadlineAt` and exact `pausedRemainingMs`; pause clears the active deadline, and resume creates a new deadline using the saved remainder. Paused drafts cannot be auto-picked.

For local gameplay, run these in separate terminals:

```bash
npm run dev
npm run fantasy:draft-timer
```

The draft room now polls every three seconds while active or paused, keeps the pool/queue/board visible while paused, disables unauthorized selections, exposes round/current/next/my-next state, supports private queue add/remove/up/down controls, shows the configured roster structure, and provides a post-draft franchise summary without fabricated grades or projections.

## Gameplay refinements

- New draft picks receive a deterministic eligible open starter slot where possible, otherwise bench.
- Lineup changes atomically move into empty slots or swap occupants only when both directions are legal. Locked players cannot move.
- Normal draft, free-agent and waiver pools are scoped to the league sport's configured season. Historical player records remain intact.
- Waiver claims are private to the managing roster. Completed league transactions are separate and newest-first. Claims show bid, status, processing eligibility and Central time and can be cancelled by their manager while pending.
- Waiver projections display N/A because no verified projection source exists. Current-season UBP totals use the immutable ledger.
- Trade history uses two-sided asset presentation. Recipient overflow requires an exact, explicit set of unlocked cuts; trade movement and cuts commit in one serializable transaction. Proposals that would overflow the proposer are rejected before creation.

The local archives contain these distinct canonical player IDs for the requested season population: NFL 2026: 1,827; MLB 2026: 1,472; NBA 2026–27: 474; NHL 2026–27: 872. NFL validation still quarantines 186 rows without player IDs. These archive populations may be partial and are not authoritative current professional rosters.

## Cleanup status

A new validated backup exists at `/private/tmp/fantasy-evolution-pre-m371-cleanup-2026-11-23.dump`, SHA-256 `80c8b39331301f50c28500129f2dcbe77bb71aeee72d2af3bce9e84f9520d44f`. Cleanup did not begin. Revalidation found that the retained player is now also used by the manually accepted League1 draft and requires two import batches, two stat revisions, one game, one ledger and its entries for gameplay/scoring integrity. The exact-ID validator was stopped before `BEGIN`; no trigger or record changed. A final owner confirmation of this expanded retained graph is required before deleting the remaining authorized candidates.

## Remaining acceptance work

Native drag-and-drop queue ordering is not included; accessible up/down controls provide the persisted reorder operation. The roster UI still uses an explicit destination selector backed by the new bidirectional swap validator rather than a graphical two-click slot picker. Consistent cross-page toast notifications remain to be consolidated. Live schedules, availability and projections remain unavailable. V9 is unchanged, V10 is inactive, and the 0.5% balance target is unverified.
