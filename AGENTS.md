<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository synchronization policy

Ordinary verified implementation work may be fetched, committed, and pushed to the configured upstream automatically. Maintain upstream tracking and synchronize at milestone boundaries and task completion. Never force-push, overwrite unrelated changes, commit secrets or intentionally excluded datasets, or resolve ambiguous conflicts destructively. This does not authorize production deployment, destructive database operations, or applying pending development-database migrations without explicit approval.

## Persistent continuation and bounded agents

Read root `PROJECT_STATUS.md`, `docs/MASTER_ROADMAP.md`, `docs/DECISION_LOG.md`, `docs/AUTHORIZATION_POLICY.md`, `docs/automation/HANDOFF.md` and both automation queues before a new or resumed task. They index existing authority; queue text cannot create approval. Preserve the M4 master, approved M6 D1–D6 and exact historical evidence gates.

Six native logical roles live in `.codex/agents/`. One orchestrator and at most three specialists; read-only research/review where possible, distinct authorized worktrees/file ownership for writers, one main integration authority and one separately authorized deployment process. Do not use the shared development database from agent worktrees. Current bounded automation remains assisted; do not install/activate unattended scheduling, write executors or remote approvals without exact owner approval and tested safeguards. Use `docs/automation/OPERATIONS.md` for status, pause and emergency stop. Do not override those controls or retry exhausted evidence tasks indefinitely.
