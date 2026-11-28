# Agent Control Center security review

This independent review covers the local Control Center and its connection to the existing automation controller. It does not authorize unattended scheduling, writable execution, a migration, a backfill, a paid service, or a new simulation milestone.

The reviewer inspected source and test fixtures without starting the service, making network/model calls, querying SQLite/PostgreSQL, opening actual credentials, or modifying application code. Actual test runs, authenticated browser checks and process demonstrations must be read alongside this source review; fixture coverage is not a claim that those operations occurred against the live workspace.

The final source recheck found no remaining blocking issue in the reviewed scope. The separately recorded [browser report](../reports/control-center-browser.json) covers the nine sections, desktop/mobile authentication and logout, and a simulated client-offline recovery check; the independent reviewer read that report rather than executing those checks.

## Reviewed boundaries

| Boundary | Reviewed implementation |
| --- | --- |
| Local exposure | The executable server binds to `127.0.0.1`; request Host values must match the configured loopback port. No remote listener, proxy, webhook or generic command endpoint is provided. |
| Authentication | A random owner password is stored in a private local file; the server stores a salted scrypt verifier. Session cookies are random, HttpOnly, SameSite=Strict and expire. Session lookup uses a hash of the cookie. The password is not returned by HTTP, included in frontend assets or printed by the credentials command. |
| Request protection | Mutations require POST, matching Origin, JSON content type, an authenticated session and its CSRF token. Login has matching-Origin checks and bounded failed attempts. Invalid URLs and request bodies are refused. |
| Public data | Task/run and approval responses use explicit field projections. Private result paths, unexpected state fields, raw authorization data, database records and raw execution messages are excluded. User/agent text is bounded and rendered as React text, without unsafe HTML. |
| Owner actions | The bridge accepts fixed actions and structured stdin; user input is never interpolated into shell commands. Guidance cannot enlarge authorization and applies only to unclaimed ready work. Unknown control fields and credential-shaped guidance are refused. |
| Approvals | The canonical controller lock protects approval updates. Approval requires explicit confirmation, exact current target/task fingerprints and a future expiration. Activation proposals are checked against their source and rendered scheduler hashes, including the Control Center security-critical files, TypeScript configuration and package manifests/lockfile. Recording an approval does not arm or install a scheduler. |
| Process ownership | Observed process identity and the controller's exact active run govern cancellation. Configured roles, old session records and persisted running status alone do not prove liveness. Denied/unavailable process observations remain unavailable, including fresh-run fallback rows; they do not become proof of interruption. The canonical repository lease remains the execution exclusion mechanism. |
| Recovery | Existing controller backoff, bounded attempts, process-group cleanup, interrupted-run recovery and emergency-stop acknowledgment remain authoritative. Dashboard shutdown is distinct from emergency stopping agents. |
| Fantasy application | The Control Center has separate local SQLite storage. PostgreSQL monitoring uses reachability only; application monitoring uses a bounded health request. No fantasy database client, scoring mutation or unrestricted query endpoint is exposed. |
| Spending | Managed execution uses existing subscription authentication, a scrubbed environment and no API-key billing fallback. Exhausted windows and reset evidence persist by window identity. Resume eligibility does not consume an execution retry; a bounded start reserves it. These controls cannot enforce spending by unrelated programs or other account sessions. |

## Telemetry accounting and privacy

The managed receipt records **62,819 input + 1,045 output = 63,864 tokens**. Its 36,864 cached input tokens are a subset of input, not an additional charge to the recorded token total. Reasoning tokens likewise remain a reported subset; absent metrics remain unavailable.

Turn identities and session identities reconcile overlapping collectors and resumed sessions. Session cumulative usage corroborates observed turns rather than being added a second time. Parent/child sessions are not recursively summed. Per-session/agent metrics are distinct from role aggregates; shared-session task attribution is marked unavailable where it cannot be established.

CLI events lacking an observed turn timestamp do not become exact daily/weekly usage merely from an execution start time. Missing global turn identifiers can make identical resumed turns indistinguishable; that conservative undercount limitation is explicitly reported. Recorded coverage is not an account-wide lifetime balance or remaining subscription allowance.

Optional history import is restricted to the exact nonsymlink local sessions directory, with file/count bounds and a shared **64 MiB maximum per collection** across state, queue, managed events and history. Budget-skipped files are explicitly reported; absent usage does not become zero. Bounded descriptor reads avoid following leaf symlinks or reading beyond the initial file-size budget when an active log grows. Import never modifies source sessions. Version-specific rollout parsing is disclosed. Message text, commands, working-directory contents and credentials are not stored as telemetry. History-only sessions remain historical and inactive.

The optional subscription probe uses documented account/rate-limit metadata RPCs. It does not start a model turn, log in, buy credits or retain account identifiers/email. Remaining allowance and current context utilization are unavailable when the supported interfaces do not expose them.

The public per-turn table is a bounded projection of existing structured turn records, not another additive collector. Controller activity import reads at most a 1 MiB tail, refuses nonregular/symlink sources, accepts six fixed event kinds with validated task/status fields and canonical timestamps, and deduplicates those metadata observations. It does not ingest raw model messages or promise an exhaustive history predating collection. Snapshot location and event-file modification time are labeled execution metadata; an unknown branch stays unknown.

## Findings addressed during review

- Replaced raw private-state/approval HTTP responses with allowlisted DTOs.
- Guarded malformed request URLs and attached process error listeners before awaiting registration.
- Recorded exact approval identities/fingerprints/expiration in audit metadata instead of generic decision summaries.
- Connected cancellation to the exact observed owned run; historical sessions remain distinct from managed processes.
- Preserved controller verification/failure state over native turn completion and separated role aggregates from agent usage.
- Kept partial token metrics unknown, rejected malformed reset timestamps, and excluded unsupported timestamp allocation.
- Added an explicit workspace lock/logout action with the same JSON/CSRF requirements as other mutations.
- Removed password printing from the lifecycle credentials command.
- Separated resume checks from actual retry reservation, retained blocked-window identity, and incorporated newly exposed or extended reset evidence.
- Added an aggregate telemetry-read budget so per-file limits cannot multiply into a multi-gigabyte synchronous import.

## Limits that remain intentional

This is an owner-controlled local application, not protection against a malicious process already running with the owner's full OS privileges. Owner-maintained approval records are an audit trail of explicit intent, not cryptographic proof of a human click. Managed model jobs retain the separately tested filesystem/network profile; the dashboard does not bypass Codex permissions.

No remote notifications, writable executor, automatic integration, unrestricted database access or unattended scheduler installation is enabled by this delivery. Existing gameplay, data-preservation and milestone gates continue to apply. Private credentials, cookies, raw logs, session records and SQLite files must remain outside Git and public reports; live browser evidence must not capture them in traces or network archives.

Relevant implementation and verification sources: [server](server.ts), [public DTOs](security.ts), [owner bridge](bridge.py), [usage guard](policy.ts), [telemetry](telemetry.ts), [activity importer](observations.ts), [HTTP security tests](server.test.ts), [telemetry tests](telemetry.test.ts), [activity privacy tests](observations.test.ts), [policy tests](policy.test.ts), and [DTO/control validation tests](security.test.ts).
