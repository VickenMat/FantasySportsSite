# Fantasy Evolution agent roles

Six logical native roles are defined in [`.codex/agents`](../../.codex/agents). Files use the current official standalone schema: `name`, `description`, `developer_instructions`. They inherit the parent's model and permissions; no global configuration or authentication changes are included.

| Native name | Responsibility | Default handoff |
| --- | --- | --- |
| `orchestrator` | Dependencies, authorization, scope, delegation, status and integration | Exact task/file ownership and reviewed integration result |
| `software_engineer` | Approved application and worker implementation | Isolated diff plus targeted test evidence |
| `data_engineer` | Identity, sources, historical completeness, Parquet and inventory | Immutable proofs, exact counts/hashes and conflicts |
| `simulation_scientist` | M6.1 methodology and M6.3 unchanged V9 evaluation | Reproducible artifacts and uncertainty/leakage review |
| `independent_reviewer` | Another agent's correctness, evidence, safety and tests | Read-only findings; never substitutes for user authorization |
| `operations_engineer` | Locks, bounded runs, recovery, health, resources and authorized Git | Execution evidence, persistent handoff and approval proposals |

One orchestrator holds the repository lease; at most three specialist threads may be active. Use distinct worktrees/file scopes for writers. One integration authority validates and integrates; one separately authorized process handles development database deployment. A native thread cap does not cap unrelated CLI processes; the runner must enforce its own lease and concurrency rules.

Current official parent configuration supports:

```toml
[agents]
max_concurrent_threads_per_session = 3
```

This counts spawned threads excluding the primary. This is a configuration suggestion, not a global setting installed by these role files. Roles cannot impose per-role sandbox/MCP overrides. Run researchers/reviewers under a read-only parent, implementers in isolated write-enabled parent worktrees. Separate parent processes must share the orchestration lease/task claims.

Each task handoff records ID, authorization, input commit/artifact hashes, worktree/files, deliverable, acceptance and deadline. Specialists return evidence; they cannot approve restricted actions or silently expand scope. The reviewer must be separate from the author. Product decisions, external evidence and exhausted retries are explicit blockers, never grounds to invent results.

No agents remain permanently running. Scheduling is inactive pending explicit approval. Native role discovery/model execution must be smoke-tested in the bounded demonstration; TOML parsing alone is not proof of delegation. The installed CLI's legacy deprecated multi-agent flag and disabled v2 flag are recorded in [capabilities](CODEX_CAPABILITIES.md). Do not enable undocumented feature combinations to force a demonstration. Use serial bounded handoffs if native spawning is unavailable and report that limitation.

Official source: [Subagents and custom agent schema](https://learn.chatgpt.com/docs/agent-configuration/subagents).
