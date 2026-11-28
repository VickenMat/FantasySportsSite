# Bounded autonomous development workflow

This extends the existing controller and Control Center rather than creating another queue or scheduler. The November 27 user request authorizes isolated writable implementation, local checks, independent review and ordinary integration/commit/push in bounded assisted cycles. Persistent unattended activation remains separately gated. The previous read-only proposal is withdrawn, not expanded or reused.

## Operate locally

```sh
npm run control-center:start
python3 scripts/automation/orchestrator.py develop --dry-run
python3 scripts/automation/orchestrator.py develop --max-tasks 2
python3 scripts/automation/orchestrator.py pause
python3 scripts/automation/orchestrator.py stop
python3 scripts/automation/orchestrator.py resume --acknowledge-stop
```

The owner-authenticated dashboard start dialog offers read-only review and development profiles. It launches fixed arguments only. Starting a bounded assisted cycle is not scheduler activation. State, leases, attempts, owner controls, tasks and approvals remain canonical to the primary repository's existing `.automation/` and committed queues. Six logical roles are retained; only useful work instantiates a model. Specialist stages are currently serial (one active model stage), below the maximum of three specialists. This is not a claim of concurrent three-agent throughput.

## Authority and lifecycle

Each writable task requires `execution_kind: writable_implementation`, explicit ordinary implement/test actions and an exact `development` profile. `DEVELOPMENT_TASKS.json` separately records its unchanged task fingerprint and profile. Only named source/test output files can change. Profiles name bounded checks, model/test budgets and exact path/SHA-256 read-only dataset grants. No arbitrary shell test string is accepted. Current checks are isolated Python unittest, a bounded Python script or Node's test runner. Additional test runners require reviewed controller support.

One integration authority holds the same repository lease through claim, real linked worktree creation, implementation, tests, independent review, at most one supported revision, verification, commit, fast-forward integration and ordinary push. It recalculates dependencies after each completed integration and selects the next eligible task without a prompt. Missing/invalid grants block only affected tasks. The dashboard cannot grant new product authority through guidance; authenticated unclaimed-task guidance may rebind its exact text fingerprint while retaining all path/action/profile scopes, invalidating the scheduler manifest for fresh review.

Before tests, the controller pins all output hashes. A trusted bounded diff and test receipts are supplied to the independent read-only reviewer. Hashes must match after tests, after review and before integration. Review and implementation have distinct run/session identities. A reviewer can accept ordinary code correctness, not gameplay, scoring, providers, database changes or milestone acceptance. Historical closure tasks remain in verification after ordinary code integration; the original evidence dependencies require separate supported scientific acceptance. D1–D6 remain approved; all unknown evidence stays unknown.

Integration refuses a dirty main checkout, a changed base, out-of-scope files, symlinks/submodules, oversized outputs, failed tests, unresolved review findings or product-decision flags. It commits only the verified named files with hooks/signing disabled and an explicit automation identity, then uses `merge --ff-only`. Push is to the existing authorized main/origin only, never forced, with at most three bounded transport attempts. A verified pending push can retry without another model call if main is still exactly its integrated clean commit. No user changes are stashed, reset or overwritten.

## Command and data isolation

Installed Codex named filesystem profiles grant baseline worktree reads, exact output writes and `.agent-output` scratch; independent reviewers receive read-only access. Git common metadata, the primary checkout, owner approvals, controller records, credentials, `.env` files, production scoring and database/migration code are protected. Only approved `.codex/agents/*.toml` files may enter a worktree; unreviewed project configuration, MCP configuration, skills/hooks surfaces and symlinks/submodules are rejected before a model starts. Apps/plugins/web and native child spawning are disabled for these managed specialist invocations. Roles are instantiated by the trusted controller as separate actual CLI sessions.

Dataset grants are verified against immutable fingerprints before phases and exposed read-only. Neither source datasets nor credentials are copied. Command network access, including TCP and Unix sockets, is denied; this blocks local PostgreSQL/socket access as well as internet commands. No shared development database client or deployment/backfill executor exists. Future network research must use separately reviewed permitted-source capabilities; this offline profile cannot acquire unavailable external facts.

Every implementation/review has an actual no-model probe, covering permitted reads, scoped writer/reviewer write policy, denied primary/credential/Git/controller/scoring/out-of-scope access, read-only data and TCP/Unix sockets. Unsupported/failed enforcement stops execution. These command sandbox boundaries do not provide OS-user isolation against arbitrary trusted owner processes. Do not run unreviewed controller modifications.

## Budgets, telemetry and recovery

Reviewed ceilings are review 300s, research 900s, implementation 1,800s and local processing/checks 7,200s. Task profiles may select lower limits. Local checks use an aggregate deadline and run without AI inference. Model stages are separately deadline/log/disk bounded; actual durations, phases, tests and supported native usage/session IDs persist. Cached input is a subset, not added to input again. No account-wide token balance is invented.

At most 16 actual model-launch reservations per rolling day are shared with earlier read-only reservations, with no counter reset. There are three lifecycle attempts maximum per task and at most one revision per attempt. Usage exhaustion pauses new AI work. Supported app-server metadata-only account/rate-limit checks require existing ChatGPT authentication; unavailable or exhausted availability fails closed. There is no API-key fallback, credit purchase, top-up or paid service. Additional spending authority is $0; the system cannot govern other applications' billing.

Pause/emergency stop persist and are checked during all phases; stop signals only verified owned groups. Canonical locks prevent duplicate work even if launchd fires during a long task. Saved session IDs are historical metadata, not proof of liveness or resumability. Interrupted worktree changes remain intact, and the task blocks for exact checkpoint inspection instead of replaying arbitrary commands. After inspecting the branch/diff, an owner can authorize a fresh scoped attempt from the unchanged checkpoint:

```sh
python3 scripts/automation/orchestrator.py recover-development --task-id TASK-ID --worktree EXACT-RECORDED-PATH --head EXACT-CHECKPOINT-HEAD
```

Do not blindly recover an integration interrupted mid-commit/merge. Preserve the branch and inspect main/commit receipts; no destructive rollback is attempted. Host/scheduler restart is tested with fresh controller instances and persisted fixtures, not claimed as an actual reboot. The local dashboard can restart manually with retained SQLite/auth records; no boot-time AI job is installed by delivery. Internet/push failures preserve verified state and bounded retries, while independent authorized tasks remain selectable.

## Separate unattended proposal

```sh
python3 scripts/automation/orchestrator.py prepare-development
python3 scripts/automation/orchestrator.py development-plan
```

These render an inactive exact manifest and launchd plist. New task `AUTO-DEVELOPMENT-001` and approval `DEV-ACTIVATION-001` require BOTH `enable_unattended` and `enable_writable_execution`, exact task/target hashes, authenticated human owner intent and a future explicit expiry. Queue/grant authority, code, sandbox, UI and actual resource configuration are bound. Old `AUTO-ACTIVATION-001` cannot satisfy it. Code/grant/authority changes invalidate the proposal. Recording approval alone cannot arm or install.

Only after separate approval can the gated `activate-development` and `install-development` commands arm and load the exact reviewed job; `uninstall-development` removes only the exact owned job. Per-stage validation checks current approval AND the exact armed receipt. Revocation, expiry or drift prevents further work. The prepared policy checks locally every 900s, runs at most two task continuations per cycle, and makes no inference calls while idle. Nothing in this delivery activates or installs it.

[Control Center](CONTROL_CENTER.md), [independent security review](DEVELOPMENT_SECURITY_REVIEW.md), and the final completion report contain observed evidence and remaining limitations.

## Linked-worktree instruction loading

The first real startup attempt reached passing sandbox probes but failed before inference because automatic AGENTS discovery traversed the denied parent checkout. Managed invocations now set documented `project_doc_max_bytes=0` and the controller supplies the exact root-to-leaf applicable worktree instructions explicitly, including override precedence. A no-inference `codex debug prompt-input` preflight verifies context construction with an empty probe home. No parent/credential read permission or project trust is added. Instruction files cannot be task outputs. The failed attempt/branch and its reserved budget remain recorded. Configuration reference: [project_doc_max_bytes](https://learn.chatgpt.com/docs/config-file/config-reference).

The live demonstration exposed the distinction between local launch reservations and provider allowance: two pre-inference failures and supported review revisions reached the original proposed 12-reservation ceiling. The reviewed configurable policy is now 16, with all prior counters preserved and no paid fallback; the new inactive activation manifest binds that exact limit. Local-budget exhaustion is classified separately from provider exhaustion. After an authorized recovery, changed controller/main code creates a fresh worktree and carries only scoped changes when those exact output paths are unchanged on main; the previous tree is retained. Conflicting target edits block recovery.
