# Control Center telemetry

The Control Center uses a separate Node24 `node:sqlite` store. It never connects to PostgreSQL or opens Codex authentication/configuration files. No AI calls are needed to collect local telemetry. The SQLite file is mode0600 and its newly created directory mode0700; logs/messages/commands are not stored in it.

## Interface

`new TelemetryStore(dbPath)` opens the private telemetry database; `collect(repo, options?)` reads allowed inputs and returns `snapshot(now?)`. `close()` closes SQLite. Options contain a finite `maxFiles` (default300, maximum1000), `maxBytesPerFile` (default16MiB, maximum32MiB), `maxTotalBytes` (default and maximum64MiB shared across state, queue metadata, managed logs and optional history), optional `now`, and opt-in `history: { enabled:true, root: <exact ~/.codex/sessions> }`.

`usage` contains nullable `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`, session/turn counts, `bySession`, `byAgent` (observed session identity), `byTask`, `byRole`, and partial `daily`/`weekly` buckets. A configured role does not create an observed run. Task/role associations come only from an actual run matched to nonsecret queue metadata; ambiguous shared-session task attribution is unavailable. Run state from the controller outranks a native completed turn, which might still require validation/review. Process liveness remains explicitly unverified; a persisted role/run is not reported active without independent server-side process verification.

`runs` exposes allowlisted run/session/parent IDs, associated task/role, state, timestamps when supplied, elapsed seconds, exposed model/reasoning configuration and recorded usage. Unknown fields remain null. `coverage` records collection time, bounds, source/status counts, warnings and unavailable metrics. Private file paths are retained as SQLite provenance, not exposed as raw execution logs in snapshots.

## Accounting and limits

Total tokens are **input + output**. Cached input is a subset of input; reasoning is a subset of output. Neither subset is added again. Invalid negative/noninteger counts and subset counts exceeding their parent are rejected. Partial metrics remain null rather than yielding an inconsistent apparently complete total.

Explicit global turn IDs deduplicate collector overlap and session resumption. Legacy CLI JSONL often supplies no global turn ID: the importer conservatively keys an unidentified turn by session, usage signature and within-file occurrence. Duplicate captures reconcile, but identical independent resumed turns may be undercounted. This limitation is explicit in coverage; do not present that result as an exact account-wide lifetime total. The collector does not fabricate a global identity from wall-clock guesses.

Cumulative `thread/tokenUsage/updated` and version-specific rollout `total_token_usage` samples use session maxima, not addition of repeated cumulative values. Cumulative and per-turn collectors reconcile by session maxima rather than being added. Parent and child session usage is counted separately once; parent session totals are never recursively expanded by child totals. Rows already imported remain stable on repeat collection and database reopen.

Daily/weekly buckets include only genuinely timestamped per-turn usage, not a run-start allocation estimate. Untimed CLI receipts and historical cumulative totals remain in recorded lifetime/session totals but are excluded from exact calendar allocation. Period coverage is partial. Recorded lifetime means this database's imported coverage, not every Codex execution or an account billing statement. Subscription allowance and remaining tokens are not inferred from recorded usage.

## Historical sources and privacy

Default collection reads only `.automation/runs/<run>/events.jsonl`, `.automation/state.json` and task-role metadata in `docs/automation/TASK_QUEUE.json`. Raw event text is parsed transiently; only explicitly allowlisted numeric/identifier metadata is retained. Raw messages, shell commands, outputs, stderr, tokens, authorization headers and database contents never enter the telemetry store or dashboard response.

Historical session import is **disabled by default**. The official Codex documentation describes `$CODEX_HOME/sessions/` rollout retention, but its on-disk `session_meta`/`event_msg token_count` schema is implementation-version-specific, not a stable public API. The optional reader accepts only the exact nonsymlink `~/.codex/sessions` directory, ignores symlinks and non-JSONL files, and applies finite depth/file/byte bounds. It never visits adjacent `auth.json`, config, sqlite indexes or other home directories. It reads but never modifies history. Unsupported formats, oversized files and truncated lines produce explicit partial-coverage warnings. Every collection shares a hard64MiB byte budget, including state/queue metadata; descriptor reads are capped to the bounded initial file prefix even if a log grows. Coverage exposes `maxTotalBytes`, `bytesRead`, `filesSkippedForTotalByteBudget` and `COLLECTION_TOTAL_BYTE_BUDGET_EXHAUSTED`, with per-source `SKIPPED_TOTAL_BYTE_BUDGET` status. Budget-excluded usage stays unavailable, never a fabricated zero. This keeps an HTTP-triggered import from synchronously parsing multi-gigabyte history. Historical `session_meta` and `turn_context` records retain only explicit session/parent IDs, exposed model/reasoning and valid timestamps. Historical-only sessions appear as `state:historical`, never running; managed runs with the same session receive available metadata without a second usage contribution. Current controller state overrides older execution-history entries. No actual home-history import was performed during implementation; fixtures exercised recognized metadata and the same pure extraction/historical-row helpers only. Prefer documented app-server structured usage captures for future clients. [Official rollout retention](https://learn.chatgpt.com/docs/environments/network-file-systems#run-independent-batch-jobs), [structured execution events](https://learn.chatgpt.com/docs/non-interactive-mode), [app-server protocol](https://learn.chatgpt.com/docs/app-server).

## Subscription metadata without model calls

Optional `probeSubscription(codexPath?, timeoutMs?)` starts a short-lived stdio app-server, sends only `initialize`, `initialized`, `account/read` with `refreshToken:false`, and `account/rateLimits/read`. It never creates a thread/turn, starts login, purchases credits, consumes reset credits or invokes private HTTP endpoints. It strips API/database/cloud credentials from the child environment. Saved CLI authentication is handled by Codex; this application never reads those credential files.

The probe returns only authentication method and validated primary/secondary windows (`usedPercent`, `windowMinutes`, `resetAt`), collection time, provenance and safe failure classifications. Account IDs, emails, OAuth tokens, plan-credit payloads and raw RPC errors are discarded. API-key or other authentication does not qualify for subscription execution. The caller should cache for30–60seconds and stop polling aggressively on failure. The process has a finite default8-second deadline (maximum15seconds),1MiB stdout bound and termination/kill cleanup. Unsupported/unavailable responses remain unavailable; percentages are not converted into guessed remaining token counts. [Documented account/rate APIs](https://learn.chatgpt.com/docs/app-server#authentication).

The probe implementation was tested with sanitized protocol fixtures and an unavailable executable. The root operator subsequently executed the actual installed app-server probe successfully, without model calls: ChatGPT authentication, a primary window35% used over10,080minutes, reset2026-12-02T20:25:07Z. The sanitized actual receipt is `/private/tmp/control-center-subscription-probe.json`. This is a dated observed window, not a permanent allowance or an inferred remaining token quantity; the server must poll/cache and label freshness.

## Actual receipt and verification

The existing successful managed execution session `01a2202a-e636-73c2-8acb-e42ef14e68cc` is imported from its retained run events and independently corroborated by automation state: input62,819 + output1,045 = **63,864**; cached36,864; reasoning0; elapsed28.497seconds. Cached input is not added. Another retained earlier session has125,509 recorded tokens; both observed sessions currently total189,373. This is actual retained telemetry, not an extra model run or proof that the earlier run passed controller acceptance.

Validation command:

```sh
npm run control-center:test -- --run control-center/telemetry.test.ts
```

Focused tests cover persistent collection, collector overlap, explicit resumed turns, parent/child accounting, cumulative reconciliation, absent metrics, partial totals, privacy sentinels, bounds/symlinks, controller-state precedence, role-versus-agent identity, subscription window sanitization and unavailable executables. They use only temporary SQLite stores and synthetic JSONL. No professional database, real credential canary, account purchase or AI model invocation is involved.
