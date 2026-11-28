# Agent Control Center completion

November 27, 2026 (Pacific). Implementation checkpoint: `c872797`. The local application is running at **http://localhost:3100** independently of Fantasy Evolution. Start with `npm run control-center:start`; stop with `npm run control-center:stop`; inspect with `npm run control-center:status`. Run commands from the permanent repository. `npm run control-center:credentials` reports the private owner-password file location without printing its contents.

All nine requested sections connect to the existing automation queues, actual managed receipts and observed host/service state. React/TypeScript, a loopback Node server and separate private SQLite telemetry/control databases provide authenticated owner controls, a persistent approval inbox and sanitized audit history. No competing scheduler or arbitrary command endpoint was added. [Architecture, controls and recovery instructions](CONTROL_CENTER.md).

## Verified execution and accounting

The authenticated dashboard started CONTROL-CENTER-DEMO-001 once at `c872797eaebd95dbda469a6469fa303ace6d3e1c`. Its owned running process was observed. It completed in **24.34 seconds**, produced strict structured output and entered independent review. A separate native reviewer verified all eight permitted snapshot files against execution HEAD, checked actual command evidence, and accepted the ordinary read-only review. The controller then recorded distinct acceptance; the model did not self-complete.

All five real permission canaries passed: permitted snapshot read; denied parent read, credential-shaped canary read, write and command network access. No actual credential was opened by those probes. The new run recorded **62,448 input + 880 output = 63,328 tokens**; 36,608 cached input is a subset, and reported reasoning tokens are zero. The original successful receipt remains **62,819 + 1,045 = 63,864**, including 36,864 cached input. The rejected earlier output still contributes its actual 125,509 tokens. All three sessions total **252,701**, with no double counting of state/event receipts. [Execution evidence](../../reports/control-center-demo.json).

Model/reasoning configuration, current context utilization, exact subscription token allowance and unobserved sessions remain unavailable where not emitted. The initial actual documented app-server metadata probe reported ChatGPT authentication and a 35%-used 10,080-minute window; the UI refreshes supported metadata without a model call. This is a reported usage window, not a remaining-token estimate. Existing ChatGPT authentication is required for managed execution; no API-key billing fallback, purchases, top-ups or paid services are implemented. Additional spending authorization stays **$0**. These local safeguards are not an account-wide billing audit or guarantee.

## Validation

- **41** isolated Control Center tests and **32** existing automation safeguard tests passed.
- **394** project unit tests, both TypeScript configurations, root ESLint and the production Webpack build passed.
- Actual Chromium covered nine desktop views, mobile navigation, authentication/logout and zero horizontal overflow; no browser runtime errors occurred. The client-offline recovery check is explicitly a simulated outage fixture.
- Temporary synthetic approval/repository/process fixtures verified CSRF/Host/Origin enforcement, exact/expired/stale approvals, duplicate starts, owned cancellation, private-data DTOs, malformed state, usage exhaustion/backoff and interruption recovery. They granted no real approval.
- Process restart preserved owner authentication configuration and SQLite records. Missing process visibility fails closed; stale saved PIDs do not establish liveness. Manual dashboard restart after host reboot is documented; no boot-time AI schedule was installed.

No gameplay or production ingestion implementation changed. Full Fantasy database/browser suites were not rerun as new acceptance claims; targeted independent-app, controller and all project-unit checks plus build/browser verification cover this change. [Verification scope and frozen hashes](../../reports/control-center-verification.json), [browser receipt](../../reports/control-center-browser.json), [independent security review](../../control-center/SECURITY_REVIEW.md).

## Preservation and remaining gates

Read-only before/after checks verified **90 tables, 196 foreign keys, 38 enabled unchanged triggers, 16 accepted source artifacts, 56 V9 weights, 28 migrations and three pre-existing user screenshots**. No unexpected database differences occurred; only existing BackgroundJobRun and ProfessionalSyncState runtime bookkeeping changed. Separately rehashed **55 prepared partitions and 11 frozen gates** match accepted fingerprints. No new operational migration or backfill occurred. [Exact counts and fingerprints](../../reports/control-center-preservation.json).

M4/M5/M6 acceptance boundaries remain unchanged: M6.1/M6.3, unavailable historical evidence, V10, contract automation, M7 and reserved campaigns remain gated. The existing Fantasy health endpoint reported degradation during monitoring; this delivery does not claim to repair or newly accept it. PostgreSQL monitoring is a TCP reachability probe, and an observed worker supervisor PID is not proof of every worker's health.

Unattended scheduling remains **uninstalled and inactive**. AUTO-ACTIVATION-001 remains pending, bound to target `995aadb384044d0181453252630a8a6e0c461fc3ff6e4e4a08b19e1216d5cbb2` and task `585f6a89620872603a48a2c6a895ef5d240f43de85fece7e33b8627d4e8c2ad4`. Recording a future owner decision in the dashboard alone cannot install/activate the job. No writable executor or automatic implementation integration is claimed. Remote notification options are documented for separate review; none is enabled.

Screenshots: [overview](screenshots/overview.png), [token usage](screenshots/token-usage.png), [mobile](screenshots/mobile-overview.png). They show actual local observations, captured before independent completion of the new demo; private credentials, cookies, raw model logs and database contents are excluded.
