# Exact unattended development activation review

This is the sole pending activation request, **DEV-ACTIVATION-001**, for task **AUTO-DEVELOPMENT-001**. It supersedes the withdrawn read-only request. No approval, arming or installation has been performed. The later user instruction explicitly withholds persistent scheduling until this new exact writable scope is reviewed and approved.

Target fingerprint: `d505d991c7b02eeb1a533661e2b74e8ee60b80f8bb821791bc0261e3cd5d197d`

Task fingerprint: `3d3f96c7b3bcb5ef456645d34c94e5b82e5d833164034163c70b1bf78f9b365f`

Required scopes: **enable_unattended** and **enable_writable_execution**, together. An authenticated owner decision must bind both exact fingerprints and a future timezone-qualified expiration. Queue text, an agent-generated verdict or the old read-only approval cannot supply that authority. Recording approval alone cannot arm or install a job.

## Exact proposed operation

- Existing ChatGPT authentication only; additional spending authorization **$0**. No API fallback, purchasing or top-ups.
- macOS user job `com.fantasyevolution.development`; interval **900 seconds**, `RunAtLoad=false`, no KeepAlive or extra triggers.
- Fixed absolute Python/controller command: `orchestrator.py develop --max-tasks 2` in the permanent repository. Local eligibility checks make no model call while idle.
- At most **two** task continuations per cycle, **three** specialist ceiling, currently **one active model stage** at a time.
- At most **three lifecycle attempts** per task and **one supported revision** per attempt.
- At most **16 shared rolling model-launch reservations per 24 hours**, retaining all prior timestamps. Current reservations are16; there is no counter reset to make activation immediately execute.
- Maximum budgets: review **300s**, research **900s**, implementation **1,800s**, local processing/checks **7,200s**. Exact task grants can be lower.
- Only exact owner-granted writable worktree outputs and fingerprint-bound read-only data. Testing, separate native review and pinned hashes precede sole-authority fast-forward integration and normal main/origin push. No force-push, destructive rollback or user-change overwrite.
- Fixed Python, Node and unit-only Vitest check dispatch; no arbitrary shell endpoint, operational database credentials or unrestricted database runner.
- Only controller-origin usage/local-budget pauses may recover automatically after supported availability; explicit owner pause/emergency stop remains authoritative. Resuming autonomous mode rechecks the exact armed receipt and unexpired approval.

This does **not** authorize gameplay/scoring changes, V10, contract automation, M7, reserved campaigns, scientific acceptance without evidence, migrations/backfills, production deployment, provider purchases or public dashboard access. Historical acceptance dependencies stay gated. Optional DEV-DEMO-002 remains review-blocked and cannot be merged by this approval.

## Evidence and limitations

[Completion report](DEVELOPMENT_COMPLETION_REPORT.md), [actual implementation/continuation and rejected follow-on](../../reports/development-demo.json), [94 controller/49 dashboard/394 project checks](../../reports/development-verification.json), [actual isolated Node/Vitest checks](../../reports/development-unit-runner.json), [data preservation](../../reports/development-preservation.json), [frozen artifacts](../../reports/development-frozen-artifacts.json), [no loaded job observation](../../reports/development-scheduler-observation.json), [source manifest](DEVELOPMENT_ACTIVATION_MANIFEST.json).

The accepted full lifecycle pushed312d5d3. The next task was selected automatically but its independent quality gate correctly prevented integration. Specialist execution is serial, external historical evidence remains unavailable, and the command sandbox is not separate-OS-user isolation. Host reboot/provider exhaustion tests are fixtures; actual dashboard restart, sandbox enforcement, implementation, tests, review, integration and push are observed.

After a separately recorded exact owner approval and verified checkpoint, the gated commands `activate-development` and `install-development` may arm/load only this reviewed job. They have not been run. `uninstall-development` removes only the exact owned installation. Revoked, expired or changed approvals/source/grants prevent further execution.
