# Local Agent Control Center

The independent dashboard is available at **http://localhost:3100**. It binds only127.0.0.1. The Fantasy Evolution server, PostgreSQL and managed data workers are separate processes; unavailable/degraded health probes do not stop the dashboard. No unattended AI schedule is activated.

From the permanent repository:

```sh
npm run control-center:start
npm run control-center:status
npm run control-center:stop
```

Use `npm run control-center:start -- --port 3101` if3100isoccupied. The start command builds the frontend and starts one local process. Stop verifies the saved PID/UID/start/session identity before signalling only the dashboard; it leaves the fantasy application and agents alone. If process observation is denied, status says unavailable and stop refuses to guess. Restart manually after host restart; private SQLite records persist.

The owner password is generated locally in `.automation/control-center/owner-password.txt`, mode0600. Open that file locally; **do not paste it into a conversation or log**. `npm run control-center:credentials` reports its location without printing the password. The UI never returns it through an API. Login creates an eight-hour HttpOnly,SameSite=Strict owner session and a separate CSRF token. Lock workspace explicitly invalidates that browser session. No Codex OAuth/API credentials are collected by the dashboard.

## Architecture and sources

React19/TypeScript is bundled locally with the existing esbuild version. A separate Node24 HTTP server uses built-in SQLite; it imports no Next.js or Prisma runtime. Node24's SQLite API is experimental, so the repository's pinned Node engine is required. `control-center/tsconfig.json` is independent from the fantasy application's type configuration.

Private `.automation/control-center/` contains authentication/audit/control SQLite, telemetry SQLite, lifecycle metadata and built static assets. Parent directories are0700; database/authentication/log files are0600. No raw datasets or professional database contents enter these databases. Queues remain `docs/automation/TASK_QUEUE.json` and `APPROVAL_QUEUE.json`; the fixed Python bridge mutates them only under the existing controller lease. There is no competing scheduler/task system and no arbitrary command endpoint.

The nine sections are Overview, Agents, Tasks, Token Usage, Approvals, Activity, Git & Testing, Infrastructure and Settings. Configured roles are separate from observed executions. Verified process liveness is scoped to managed controller receipts, not a claim to see every IDE/account process. Session/parent IDs, model/reasoning, task, milestone, timing, retries, recorded snapshot/commit and intervention are shown where observed; absent fields remain unavailable. Historical sessions are never marked live merely because they were imported.

## Token accounting and subscription policy

The actual retained receipt verifies **62,819input+1,045output=63,864total**. Its36,864cachedinput tokens are a subset. The earlier completed-but-output-rejected session records125,509tokens; the two retained sessions therefore record189,373before the new dashboard demonstration. Validation/rejected output does not erase actual consumption. No raw prompts or private output logs are published.

The collector deduplicates session/turn usage and overlapping cumulative history; parent/child sessions are not recursively added. Ambiguous old CLI turns without global IDs carry an explicit conservative-under-count warning. Daily/weekly views mean rolling24hours/7days and include only timestamp-supported turns. Untimed CLI events are not silently assigned to today. Lifetime means **lifetime recorded in this SQLite store**, not account-wide lifetime billing.

Input, cached input, output, reported reasoning, per-turn/session/agent/task totals and source coverage are available where emitted. Current context utilization, exact remaining subscription tokens and unobserved sessions remain unavailable. The documented app-server `account/read` and `account/rateLimits/read` metadata methods expose authentication and reported percentage windows/reset times when supported. They never start a model thread or turn. The initial actual probe reported ChatGPT authentication,35%used in a10,080minute window, reset2026-12-02T20:25:07Z; the UI refreshes actual metadata rather than hardcoding that value. A usage-window percentage is not a remaining-token balance.

Additional spending authorization is **$0**. Managed AI work requires existing ChatGPT subscription authentication; no API-key fallback, purchase or automatic top-up exists. Exhausted reported windows block new work. The guard retains the exact blocked window/reset, uses progressive bounded backoff when unavailable, and reserves retries only for actual start attempts, not Resume/status refresh. The existing controller still enforces three attempts per task, six reservations per rolling day, deadline180seconds and usage-error pause. These controls do not govern other applications or establish an account-wide spending guarantee.

Local history import is explicit opt-in and read-only, limited to the exact nonsymlink `~/.codex/sessions` directory. It never modifies session records or reads authentication/configuration files. Imports are bounded to300files,16MiB per file and64MiB aggregate; skipped/unknown coverage is visible. The local rollout schema is version-specific and not a stable public API. Default collection uses only managed execution metadata. [Detailed telemetry provenance](CONTROL_CENTER_TELEMETRY.md).

## Controls, security and recovery

Authenticated same-origin JSON POSTs require a session-bound CSRF header. Host validation blocks DNS rebinding; CSP denies framing and external scripts. Agent/user text is treated as text. Passwords, cookies, headers and raw model messages are excluded from audit history. The activity feed stores only known controller event fields and owner-control metadata, including exact approval/task fingerprints and expiration.

Supported controls start one bounded read-only cycle, pause/resume, cancel an exact observed owned execution, emergency stop, adjust future concurrency/priority, add guidance to an unclaimed ready task, and approve/reject the exact prepared read-only activation proposal. Concurrency stays at most three; the managed invocation itself is serial with native spawning disabled. Emergency stop needs explicit acknowledgement to resume. Owner guidance does not change authorization scope; claimed/completed tasks need a reviewed follow-up. Independent ordinary task acceptance remains the existing reviewed CLI procedure.

Approval is an owner decision bound to current targets, scope and explicit expiration. Stale sources/targets, expired expiry and self-reported agent actors fail closed. Recording approval **does not arm, install or activate** anything. Writable implementation, automatic integration, professional database deployment/backfill and unrestricted commands have no executor in this dashboard. The refreshed activation manifest also binds security-critical dashboard source files, so changes invalidate that exact unattended proposal.

PID/start/UID/session ownership and canonical controller locks prevent duplicate execution and unrelated cancellation. Truncated auxiliary PID metadata is treated as unavailable; canonical state corruption refuses new AI work while the local interface remains accessible. Internet/authentication failures produce unavailable/stale metrics, not invented quotas. No AI call refreshes status. No remote notifications/public endpoint are enabled; local approval inbox/activity events are persistent. An authenticated remote notification channel would require separate review.

A privileged same-OS-user process can access owner files; this app does not claim cryptographic human identity against arbitrary same-user code. Managed AI command profiles deny the primary repository/credentials and command network access. A future writable executor must preserve those boundaries. [Independent security review](../../control-center/SECURITY_REVIEW.md).

## Validation and evidence

```sh
npm run control-center:test
npm run control-center:typecheck
npm run control-center:browser
```

HTTP tests use temporary Git repositories and synthetic owner/approval fixtures. They do not grant real approvals. Browser screenshots and the managed demonstration use actual loopback state, with credentials kept in process memory and HAR/tracing disabled. [Browser receipt](../../reports/control-center-browser.json). Screenshots: [desktop](screenshots/overview.png), [token usage](screenshots/token-usage.png), [mobile](screenshots/mobile-overview.png). The final completion receipt records exact counts, database preservation and the unchanged milestone gates.
