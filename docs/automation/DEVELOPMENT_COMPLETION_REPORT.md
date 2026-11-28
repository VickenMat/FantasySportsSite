# Bounded development system: completion report

The existing controller and Agent Control Center now support actual isolated implementation, local tests, independent review, verified integration and ordinary push. **One real task completed that lifecycle. Automatic continuation selected the next task without another user prompt; independent review subsequently blocked that optional task. Persistent unattended scheduling remains unapproved, unarmed and uninstalled.** This is evidence of a bounded working development pipeline, not a claim that every queued task or historical milestone is complete.

The delivery evidence is [the live demonstration](../../reports/development-demo.json), [verification](../../reports/development-verification.json), [preservation](../../reports/development-preservation.json), [frozen artifact hashes](../../reports/development-frozen-artifacts.json) and [scheduler observation](../../reports/development-scheduler-observation.json). These distinguish actual execution from isolated recovery fixtures.

## Local access

Open **http://localhost:3100**. The independent dashboard binds only to `127.0.0.1`; it does not replace the Fantasy Evolution application.

```sh
npm run control-center:start
npm run control-center:status
npm run control-center:credentials
npm run control-center:stop
```

The credentials command reports the private password-file location without printing its contents. Open `.automation/control-center/owner-password.txt` locally; do not paste its password into chat or logs. Owner authentication uses an HttpOnly, SameSite session and CSRF-protected controls. **Lock workspace** explicitly invalidates only the dashboard session. Starting the dashboard does not start AI execution or activate scheduling. Stopping it does not stop independently running agents or the fantasy application; use the controller's emergency stop when execution must stop.

The start dialog defaults to a bounded read-only review. Choosing development launches the fixed existing-controller command `orchestrator.py develop --max-tasks 2`, with no arbitrary command endpoint. Pause, resume, emergency stop, owned-process cancellation, priorities, guidance and concurrency controls retain the canonical queue, lease and persistent state.

Screenshots show the [overview](screenshots/overview.png), [live development](screenshots/development-live.png), [token usage](screenshots/token-usage.png) and [mobile overview](screenshots/mobile-overview.png). All nine dashboard sections use actual records, with unavailable and stale readings explicit. Configured roles, independent historical sessions, managed receipts and verified live processes are separate categories. Status polling does not invoke a model.

## Actual implementation and continuation

| Task | Observed result |
| --- | --- |
| `DEV-DEMO-001` | Completed implementation, four real Python unit tests, distinct independent review, a supported revision, accepted re-review, verified integration and push. Accepted commit: `312d5d3a758b555b6f9af9947c4ab8eb9843258b`. |
| `DEV-DEMO-002` | Selected automatically in the same bounded dashboard cycle after its dependency completed, without a new user prompt. Later independent reviewers gave conflicting purity/import guidance. The bounded recovery retained prior worktrees; the task remains **blocked**, and its optional implementation was **not integrated**. Passing local tests did not override review rejection. |

The first completion event was recorded at `2026-11-28T05:27:01.533683Z`; the next claim followed at `05:27:01.587384Z`. The accepted implementation and reviewer had different native sessions: `01a2209e-2d93-7990-aee5-b2664f9650bd` and `01a2209e-91d6-72d1-935b-048c2868e2c4`. The report retains actual run IDs, durations, native usage, check hashes, verdicts and sampled dashboard transitions. A saved session identifier is not treated as proof of a live or resumable process.

The demonstration also exposed failures. An early browser harness used an obsolete button label and stopped before launching work. Two subsequent pre-inference startup failures—on the demo and an independent inventory task—occurred because automatic ancestor instruction discovery encountered the denied parent checkout. The repair supplies applicable worktree instructions explicitly and performs a no-inference context preflight. It did not grant parent-checkout or credential access. Failed attempts and launch reservations were preserved.

The original conservative twelve-reservation local ceiling then paused work after those preserved failures and supported review revisions. The reviewed limit became sixteen; counters were not reset. This was **local policy exhaustion, not actual provider allowance exhaustion**. Optional task 2 was not marked complete to make the demonstration appear successful.

## Architecture and enforcement

The system extends the existing Python controller, committed task/approval queues and private `.automation/` state. It creates linked Git worktrees for exact owner-authorized output files. Historical dataset access requires explicit path/SHA-256 grants and remains read-only. Model stages use the installed Codex CLI with existing ChatGPT authentication; the six configured logical roles are instantiated only for useful work. Current specialist stages are **serial, at most one active model stage**, under a maximum of three specialists. No concurrent three-agent throughput is claimed.

One integration authority holds the repository lease. It enforces dependencies, unchanged task grants, task-specific budgets, local checks, distinct independent review and immutable reviewed-output hashes. Only verified named files are committed and fast-forward integrated against the exact clean main base. User changes are preserved; conflicts, dirty main, failed tests, unsupported evidence or rejected review block integration. Push uses the authorized upstream without force. Bounded verified push retries do not require another model call.

Writer and read-only reviewer profiles have actual no-model enforcement probes: scoped writes, protected primary/Git/controller/scoring access, credential-shaped canaries, read-only datasets, and denied TCP/Unix sockets. Failed probes stop execution. Credentials, unrestricted database access, migration/backfill execution and product authority are not provided to specialists. Ordinary code acceptance cannot authorize gameplay/scoring changes, V10, M7, contract automation or milestone acceptance. Approved D1–D6 and all 56 V9 weights remain intact.

Owner guidance applies only to unclaimed ready tasks. For writable tasks it first validates the exact existing grant, then changes the text-bound task fingerprint while preserving every granted path/action/profile. It invalidates the unattended proposal for fresh review. A partial two-file update leaves mismatched hashes and fails closed. Models cannot use owner controls to grant themselves approval.

The command sandbox and trusted owner controller are **not separate-OS-user isolation**. Unreviewed owner processes/controller changes remain outside that boundary. The managed offline profile cannot acquire missing external facts, so historical evidence gates remain real blockers.

## Budgets, usage and spending

Reviewed maximum budgets are 300 seconds for review, 900 for research, 1,800 for implementation and 7,200 for local processing/checks; exact task grants can be lower. Local checks run without continuous AI inference. Supported check kinds and their enforcement are documented in [the workflow](AUTONOMOUS_DEVELOPMENT.md) and [operations](OPERATIONS.md). Actual no-model checks also passed one Node test exercising nested scratch I/O and four existing roster-compliance Vitest tests using the original project configuration. Those capability checks are separate from the accepted Python implementation demonstration. [Runner evidence](../../reports/development-unit-runner.json).

There are at most three lifecycle attempts per task, at most one supported revision per attempt, two task continuations per cycle and sixteen shared model-launch reservations per rolling day. Pause, emergency stop, deadlines, disk/log bounds and persisted usage controls prevent unlimited retries. Local budget exhaustion and provider exhaustion are classified separately; fresh supported availability and exact retained controls govern recovery.

The recorded aggregate is **1,129,921 tokens across 13 sessions**: 252,701 previously recorded plus 877,220 known new tokens. Input plus output forms total usage; cached input and reasoning remain subsets. The original reference receipt still reconciles exactly: **62,819 input + 1,045 output = 63,864 total**, including 36,864 cached input tokens. Missing startup usage remains unknown, not zero. These totals describe retained coverage, not every account session or remaining allowance.

Supported subscription metadata exposes reported percentage windows/reset times when available. Exact remaining subscription tokens and current context utilization are unavailable; no balance is invented. Managed work requires ChatGPT authentication and pauses on exhausted or unavailable supported availability. Additional spending authorization is **$0**: no paid API fallback, top-up, credit purchase or new paid service was introduced. This does not claim account-wide control of other applications' billing.

## Verification and preservation

The published verification snapshot records:

- **94 controller tests, 49 Control Center tests and 394 project unit tests** passed.
- Both TypeScript configurations, ESLint and the production Webpack build passed.
- Nine dashboard sections, mobile rendering, actual dashboard restart and browser-offline behavior were checked.
- Actual writer/reviewer sandbox probes each covered eleven enforcement checks.
- Recovery fixtures covered interruption, duplicate claims, Git conflicts, stale worktrees, pause/stop, expired approvals, usage exhaustion and fresh-instance host/scheduler recovery.

Host restart and provider exhaustion were **fixtures**, not an actual reboot or deliberate exhaustion of the subscription. Browser-offline simulation is not a claim that the host's physical internet connection was disconnected. The full professional-database integration suite was not rerun for this controller-only delivery; production gameplay/Prisma/ingestion behavior was outside the change.

Read-only development preservation checked **90 tables**, **196 foreign keys** with zero violations, and **38 unchanged enabled triggers**. There were no unexpected differences. Normal background activity changed `BackgroundJobRun` and `ProfessionalSyncState`; the report identifies both instead of claiming every table fingerprint stayed identical. No new migration or operational backfill occurred; the applied count remains **28**, and the **56 V9 rules** remain preserved.

All **16 immutable recovered/archive/V5 source artifacts** and the three existing user screenshots matched their accepted hashes. The frozen-derived check preserved **55 historical/enriched partitions plus eleven scoring-gate artifacts**. This infrastructure work did not overwrite datasets or manufacture historical acceptance. M6.1/M6.3 evidence dependencies and the subsequent unchanged-V9 baseline acceptance remain gated.

## Exact unattended proposal remains separate

New task `AUTO-DEVELOPMENT-001` / approval **`DEV-ACTIVATION-001`** requires both restricted scopes: `enable_unattended` and `enable_writable_execution`. The [exact activation review](DEVELOPMENT_ACTIVATION_REVIEW.md) and [development activation manifest](DEVELOPMENT_ACTIVATION_MANIFEST.json) and `development-plan` bind exact source/configuration/grant hashes, task and target fingerprints, owner intent and an explicit future expiration. The withdrawn read-only proposal cannot authorize this workflow.

The prepared job is `com.fantasyevolution.development`, checks locally every 900 seconds, has `RunAtLoad=false`, and performs no inference while idle. Recording approval alone does not arm or install it; separate exact gated activation/installation remains required. The delivery observation records assisted mode, no armed receipt and neither the new nor legacy launchd job loaded. **No unattended scheduler was activated by this task.**

The supported result is therefore a demonstrated bounded writable pipeline with automatic task selection and enforced quality stops. The optional follow-on task, historical evidence closure, scientific acceptance and persistent unattended activation remain explicitly incomplete or gated as described above.
