# Local automation operations

The default is assisted mode. The current executor supports bounded read-only project-memory reviews and isolated implementation-worktree handoffs. It does not automatically implement code, integrate main, deploy data, approve restricted actions, commit or push. Six logical roles are prepared; native child spawning is disabled in the bounded review invocation. The thread ceiling is explicitly three. This is not a claim that six native agents ran.

## Normal commands

Run from the permanent repository with the installed Python 3.12 interpreter:

```sh
python3 scripts/automation/orchestrator.py status
python3 scripts/automation/orchestrator.py tasks
python3 scripts/automation/orchestrator.py cycle
python3 scripts/automation/orchestrator.py cycle --execute-read-only --max-tasks 1 --timeout-seconds 180
python3 scripts/automation/orchestrator.py handoff
python3 scripts/automation/orchestrator.py pause
python3 scripts/automation/orchestrator.py resume
python3 scripts/automation/orchestrator.py stop
python3 scripts/automation/orchestrator.py resume --acknowledge-stop
python3 scripts/automation/orchestrator.py worktree --task-id TASK-ID
python3 scripts/automation/orchestrator.py fingerprint --task-id TASK-ID
python3 -m unittest discover -s tests/automation -v
```

`cycle` is a dry run unless `--execute-read-only` is supplied. Lower priority numbers run first. The owner-maintained queue is `TASK_QUEUE.json`; mutable attempts, claims and results live in ignored private `.automation/`. Locks/state are canonical to the primary Git common root, including related worktrees; runtime overrides cannot create a second lease. One orchestrator owns the lock. Top-level execution is serial and bounded to at most three tasks; approved unattended policy narrows this to one.

A successful model result enters `verification`, never `completed`. Dependencies remain blocked until an independent review is recorded. To accept or reject an ordinary task, first create a nonempty public review report under `reports/` or `docs/`, then use:

```sh
python3 scripts/automation/orchestrator.py review --task-id TASK-ID --task-fingerprint EXACT-TASK-SHA256 --reviewer orchestrator --reviewer-run-id DISTINCT-REVIEW-RUN --evidence reports/REVIEW.json --decision accept
```

The reviewer must differ from the producing role/run, and the task fingerprint must match both its claim and current definition. Restricted scopes cannot be approved through this command. Implementation handoffs additionally require `--associated-commit REVIEWED-INTEGRATED-COMMIT`, already present in main history. Review receipts are durable; they are ordinary acceptance records, not product authorization. Rejections remain blocked for a reviewed follow-up. No model result can accept its own work. Changed task definitions require a separately reviewed superseding task rather than deleting prior attempts.

## Execution and secret boundaries

Each review gets a fresh Git-initialized snapshot outside the primary checkout containing a fixed project-memory allowlist. It has no copied `.env`, datasets, Git remote, MCP configuration or authentication file. Child environments omit inherited database URLs, PG credentials, API keys, shell startup overrides and arbitrary PATH entries. Existing ChatGPT subscription authentication is required; there is no API-billing fallback.

The runner uses the installed CLI's named filesystem permissions, not a legacy sandbox flag that could override them: default filesystem denial, minimum system/runtime reads, snapshot reads, explicit primary-repository and credential-directory denials, and disabled command network access. Apps/plugins/web are disabled, global user configuration is ignored, and native child spawning is disabled. The CLI client retains its subscription authentication outside the command sandbox.

Before every model invocation, an actual no-model sandbox probe must show permitted snapshot reading and denied parent-canary reading, fake-auth-canary reading, snapshot writing and connection to a harmless local socket. No real credential, `.env` or authentication file is opened by the probe. It uses the installed controller interpreter rather than the `/usr/bin/python3` Xcode shim, with read access only to its runtime directory. Unsupported/failed enforcement prevents model execution; there is no permissive fallback.

These are verified command-sandbox controls, not OS-user isolation for the controller or a guarantee about arbitrary writable agents. The current engine has no database executor or arbitrary queue-provided shell command. Implementation remains a reviewed worktree handoff. A broader writable executor needs separately verified safeguards and authorization.

## Stop, recovery and resource bounds

`pause` writes a persistent marker that the active review observes. `stop` persists emergency stop and signals only the verified owned process group, escalating after a short grace period. It checks PID ownership/start/session/group, includes descendants after the leader exits, and never signals a reused/unrelated PID. Surviving groups retain active-run evidence and prevent new work. Emergency stop needs explicit acknowledgement before assisted mode resumes.

Interrupted claims retain attempts and acquire backoff. Live orphan groups block recovery until inspected or stopped. There are at most three attempts per task, six reserved read-only attempts per rolling day, and at most 600 seconds per manual invocation (180 by default). Backoff starts at sixty seconds. Usage-limit evidence pauses the controller; it does not continuously retry. Resuming the controller does not silently clear blocked usage/exhaustion tasks or reset their attempts. Such tasks require reviewed follow-up after the underlying condition changes.

Private execution records retain actual elapsed time, available native usage counters and `thread.started` session IDs even when final schema validation rejects output. Large-log telemetry examines bounded head/tail regions and marks truncation; absent counters are not reported as zero cost or unlimited remaining usage. Session IDs support owner inspection/manual recovery, not automatic replay into a broader working directory or permission profile. A new review is preferable when scope changes.

## Worktree handoffs

The helper creates an `automation/TASK-ID-fingerprint` branch from committed HEAD. It copies no untracked credentials/data, rejects tracked sensitive paths/configuration and archive symlinks, and allows reviewed `.codex/agents/*.toml` role definitions. Fixed local Git operations disable hooks and filesystem monitors. Primary tracked diffs are checked before/after; user changes are never stashed, reset, overwritten, force-pushed or automatically merged. Git common-directory sharing is not an OS security boundary. One integration authority reviews and integrates verified results.

## Product approvals

`APPROVAL_QUEUE.json` is externally owner-maintained. Agents have no approve/reject command. A valid approval requires the exact reviewed target and task fingerprints, required scopes, a future timezone-qualified expiration, `status: approved`, and a decision with `actor_kind: human`, `actor: project_owner`, and its actual recorded timestamp. Agent-origin, expired, rejected or changed decisions fail. Only affected tasks wait; independent work can continue. Even an approved restricted action only reaches an external-executor handoff here; it does not create a database or production capability.

This is not cryptographic proof of a human against arbitrary same-user write access. Future writable agents must not have access to owner approval files. Stronger threats need a trusted external approval authority. Sandbox/tool approval never substitutes for project authorization.

## Prepared scheduling, not activated

The committed plist is an uninstalled dry-run template with `RunAtLoad: false`. `prepare_activation.py` renders a concrete private proposal and public fingerprint manifest; it never approves, arms, installs or starts a job:

```sh
python3 scripts/automation/prepare_activation.py --bind-pending-queues
python3 scripts/automation/orchestrator.py activation-plan --approval-id AUTO-ACTIVATION-001
```

The exact proposed unattended mode permits one read-only task every 900 seconds, timeout 180 seconds, three task attempts and six daily reservations. Preparation binds only pending queue targets. No approved record is created. The manifest binds critical engine/schema/template/preparation code, public policy/roles, and the exact rendered plist. Extra launch triggers, KeepAlive, arbitrary environment/log paths or changed resources are rejected.

After subsequent explicit owner approval, the separately gated command `activate --approval-id AUTO-ACTIVATION-001` can arm only this bounded read-only policy. It never installs or loads launchd, and every autonomous cycle revalidates current task/target hashes, files, resource limits and approval expiration. Revocation or a changed target blocks further work. Independent owner installation/review remains required; current approval remains pending and mode remains assisted.

An eventual approved installation would copy the exact reviewed plist under `~/Library/LaunchAgents/` and use `launchctl bootstrap gui/$(id -u) APPROVED-PLIST`; removal uses `launchctl bootout gui/$(id -u) APPROVED-PLIST`. These examples are not authorization to execute them now. No power changes, paid subscriptions, remote service or external notifications are configured.

## Evidence and troubleshooting

Use `status` and private `.automation/runs/RUN-ID/{sandbox-probe.json,probe-stderr.log,events.jsonl,stderr.log,last-message.json}`. Local event summaries and independent-review receipts are private too. Do not commit raw logs, snapshots or credentials. The outer Codex sandbox may deny `/bin/ps` or nested `sandbox_apply`; ownership/probe tests then need a specifically reviewed host execution, never a weakened profile. Tests use temporary repositories, fake credentials and owned subprocesses, without a database or provider acquisition.
