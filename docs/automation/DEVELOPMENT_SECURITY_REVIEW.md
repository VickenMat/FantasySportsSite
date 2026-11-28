# Bounded development workflow: security review

## Scope and acceptance limit

The new development workflow is separate from the earlier read-only demonstration. This review covers the activation module/template, isolated lifecycle tests, and source inspection of `development.py`, `writable_sandbox.py` and their Control Center integration. It grants no restricted authorization.

The reviewer ran **12 isolated activation tests**, with a fresh temporary Git repository, simulated owner approvals, a fake owner launchd directory and mocked launchctl operations. No real scheduler was armed, installed, unloaded or removed. No model call, production/development database operation, credential read or external network request was made by the reviewer.

The integration owner separately reported passing workflow/dashboard tests and actual no-model sandbox canaries. Those reports must remain distinct from the actual writable end-to-end demonstration. **At this review checkpoint, the two-task implementation → tests → independent review → integration → push demonstration is pending.** Prior read-only success and synthetic tests alone do not establish autonomous development acceptance.

## Exact new policy

| Setting | Bound value |
| --- | --- |
| Activation task / approval | `AUTO-DEVELOPMENT-001` / `DEV-ACTIVATION-001` |
| Required restricted scopes | Both `enable_unattended` and `enable_writable_execution` |
| Armed controller mode | `development_autonomous` |
| Scheduler | `com.fantasyevolution.development`; 900-second interval; `RunAtLoad=false` |
| Fixed command | Absolute Python + repository `orchestrator.py develop --max-tasks 2` |
| Tasks per cycle | At most two |
| Specialist ceiling | Three; current implementation runs model stages serially, at most one active stage |
| Model budgets | Review 300s; research 900s; implementation 1800s |
| Local checks | At most 7200s per task; local processing does not require continuous inference |
| Attempts / rolling model budget | Three task attempts; twelve shared model-stage reservations per rolling 24 hours |
| Spending | $0 additional authorization; existing ChatGPT authentication; no paid API fallback/top-ups |

Old and new model reservations use the same persisted execution timestamps. Preparing or arming the new policy does not reset counters or erase prior consumption. These local ceilings are not remaining subscription credits or an account-wide spending guarantee.

The old `AUTO-ACTIVATION-001` read-only approval cannot arm or install this workflow. The new manifest is `docs/automation/DEVELOPMENT_ACTIVATION_MANIFEST.json`; preparation records pending targets only.

## Preparation and lifecycle safeguards

- Preparation is inert: it writes a private rendered plist and public hash manifest; optional binding leaves the new owner decision pending with no actor or expiration fabricated.
- The manifest binds security-critical controller/source/configuration files, public Control Center code, package manifests, reviewed role definitions, the explicit owner-grant file `DEVELOPMENT_TASKS.json`, queue authority fields and exact rendered plist bytes. Unexpected files, source changes, grant changes, altered authority or injected scheduler arguments invalidate it.
- Ordinary priority/progress changes do not create new permissions. Exact per-task fingerprints and development profiles must still match owner-maintained grants before execution. A guidance change is not an agent-created authorization.
- Approval verification requires the exact new task/target, both scopes, the project owner's recorded decision and an unexpired explicit expiration. Approval is necessary but is not arming: autonomous development additionally requires the matching armed receipt.
- Managed agents cannot bind owner approval records or invoke activation/install/uninstall lifecycle controls. The canonical repository lock serializes lifecycle operations with integration.
- Install requires valid approval, an exact armed receipt and the reviewed mode. It refuses an existing unknown launchd file and a previous read-only installation rather than overwriting either. Only fixed launchctl arguments are available.
- Uninstall can stop an exactly owned job after approval expiry or source drift; stopping must not require renewed execution authority. It checks the fixed label/path and recorded file hash, observes the job even after partial bootstrap, and refuses unknown or changed files. A failed ownership/launchd check retains records for owner inspection. It does not silently remove unrelated resources.

Local approval JSON is an audit record, not cryptographic human attestation against arbitrary code running as the same OS user. Managed specialists instead rely on the tested filesystem/network boundary: they cannot reach the owner's queue, credentials, Git common metadata or integration authority.

## Execution and integration review

Reviewed source enforces explicit output files, protected source/control paths, exact read-only historical dataset hashes, scrubbed child environments, subscription-only preflight and bounded permission canaries. Missing/failed enforcement blocks the phase; there is no unrestricted fallback. Unexpected tracked project agent/hook/MCP configuration is refused before worktree execution.

Local checks use fixed supported kinds and argv, not queue-supplied shell text. Their environment does not inherit database/API credentials. Output files are pinned immediately after implementation; they must remain identical after local checks, independent review and before integration. Review receives a trusted diff and check receipt. Actual model phases require completed structured output and session identity; implementation and review run/session receipts are distinct. Synthetic callbacks are test evidence only.

Only the trusted controller stages the exact verified files, commits and fast-forwards a clean unchanged main checkout. Models cannot alter Git common metadata. Push is restricted to the configured project main/upstream, without force. A failed verified push can recover without another model call; dirty main, conflicts, scope drift and stale worktrees preserve work rather than overwrite user changes.

Paused, emergency-stop, approval-required, manual and unknown execution states fail closed. Autonomous execution revalidates its armed policy at stage boundaries; interrupted work requires an exact preserved checkpoint instead of blindly resuming an arbitrary historical session ID. Invalid profiles affect their task rather than authorizing work or silently broadening permissions.

Code review does not authorize historical acceptance. The established M6 inventory/completion/participation/statistics/cohort and V9 acceptance tasks remain in verification when scientific evidence is still gated. D1–D6, all 56 V9 weights, protected datasets, operational database restrictions, V10/contract/M7 gates remain unchanged.

## Review findings addressed

Source rechecks confirmed corrections for: approval-versus-arming separation; queue/unknown mode checks; exact two-scope development approval handling; typed malformed-profile rejection; protected project configuration; budget derivation from the bound policy; output fingerprints pinned before checks/review; trusted review diffs; distinct phase/session evidence; and verified push recovery without inference.

The activation tests cover inert preparation, read-only approval rejection, expired/wrong actor/scope/task targets, source/grant/authority changes, symlinks and scheduler injection, unchanged shared counters, agent lifecycle rejection, unknown installation preservation and partial-bootstrap cleanup. Actual owner launchd installation remains deliberately unperformed pending the new exact approval.

Implementation: [activation module](../../scripts/automation/development_activation.py), [development controller](../../scripts/automation/development.py), [sandbox profiles](../../scripts/automation/writable_sandbox.py), [activation tests](../../tests/automation/test_development_activation.py). The integration owner's final acceptance report must add actual writable execution, independent review, task continuation, Git and dashboard receipts before claiming the full lifecycle succeeded.
