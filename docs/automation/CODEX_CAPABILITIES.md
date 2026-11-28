# Installed Codex capabilities

Verified 2026-11-27 for this workspace. These findings describe the installed client, not an entitlement or unlimited-usage guarantee. No global configuration, authentication, scheduler, database or service was changed during inspection.

## Local evidence

- Executable: `/opt/homebrew/bin/codex`; `codex --version`: **codex-cli 0.172.0**.
- `codex login status`: **Logged in using ChatGPT**. Credential files, tokens, account identifiers and environment secrets were not read or printed.
- Inspected `codex --help`, `exec --help`, `exec resume --help`, `agents --help`, `app-server --help` and `features list`.
- Feature listing reports legacy `multi_agent` deprecated/enabled and `multi_agent_v2` stable/disabled. This is local feature state, not proof of a completed native child-agent smoke test. The current documentation supports native subagents and standalone project agent files; activation must verify behavior on this installation rather than toggle experimental features blindly.
- Six role files parsed with Python `tomllib`, with exactly the three required standalone keys. This validates syntax, not native role execution. The global help advertises `--strict-config`, but this installation rejects it for `codex features`; do not treat that command as configuration acceptance.
- The official manual helper initially failed sandbox DNS; its scoped retry fetched the current official manual successfully. Documentation below was read from that manual. No provider other than OpenAI was consulted.

## Supported surfaces

| Capability | Evidence and chosen use |
| --- | --- |
| Native subagents | Current releases support parent delegation and collection. Six logical project roles live in `.codex/agents/*.toml`. One orchestrator plus at most three specialists; agents are not six permanent processes. |
| Custom roles | Standalone TOML requires `name`, `description`, `developer_instructions`. Parent permissions, provider and MCP are inherited; role files cannot override sandbox/approval/MCP. No model override is needed. |
| Noninteractive execution | `codex exec` accepts a prompt argument or stdin `-`. Use an external process deadline; installed help has no `--timeout`. |
| Structured output | `--json` emits JSONL events, not merely a final JSON object. `--output-schema` constrains final output; `-o` separately saves that final message. Validate both process status and final schema before recording success. |
| Resumption | `codex exec resume SESSION_ID PROMPT` is installed. Persist an explicit `thread.started` ID; never use `--last` in concurrent automation. Repository queues remain authoritative when old context is stale. |
| Project instructions | Repository `AGENTS.md` and narrower instructions are persistent context. Read current status/authorizations on every new or resumed task. |
| Skills | Supported reusable workflows; apply the installed skill's actual instructions. Do not assume the current app's tool access transfers to another CLI session. |
| MCP/plugins/apps | Supported, but can perform external side effects. No new server/connector is configured here. A filesystem sandbox alone does not authorize or fence these actions. |
| Approval handling | `-a never` rejects escalation requests rather than providing human interaction. It is safe only with an explicit restricted sandbox and independent project authorization. It does not turn restricted product actions into authorized ones. |
| SDK | Official `@openai/codex-sdk` supports local programmatic threads/resumption; Python SDK also exists. Not installed or needed for the initial bounded CLI architecture. |
| App-server | Installed experimental `codex app-server`, default stdio transport, offers history/auth/approval/event integration. More machinery than required here; no daemon, public service or remote-control endpoint started. |
| Scheduling | Official app/web Scheduled interfaces exist; CLI/IDE have no Scheduled management interface. Prepared macOS launchd can invoke the bounded repository runner, but remains uninstalled/inactive until explicit activation approval. |
| Notifications | Official `notify` supports `agent-turn-complete`; payloads may include prompt/output content. Prefer sanitized local status summaries. Remote issue/webhook notification needs separate explicit authorization and must not carry private data. |

The capability and schema details come from [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [SDK](https://learn.chatgpt.com/docs/codex-sdk), [app-server](https://learn.chatgpt.com/docs/app-server), [scheduled tasks](https://learn.chatgpt.com/docs/automations) and [notifications configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications).

## Legacy read-only invocation: insufficient credential boundary

The installed CLI supports this argument layout, but it is **not the credential-safe demonstration command**. Legacy `read-only` restricts writes; it does not hide the real home, authentication files or the main repository’s environment files. Environment scrubbing alone does not correct this. Paths below are supplied by the runner:

```sh
/opt/homebrew/bin/codex -a never exec \
  --sandbox read-only --ignore-user-config --json --color never \
  -c 'features.apps=false' -c 'features.plugins=false' \
  -c 'web_search="disabled"' \
  -C /Users/vicken/Developer/FantasySportsSite \
  --output-schema /absolute/path/to/reviewed-result.schema.json \
  -o /absolute/private/path/to/final.json -
```

Supply the reviewed task through stdin without shell interpolation. The runner supplies a finite process-group deadline, restricted environment, private log location, exclusive lease and accepted JSON schema. This example is a command template, not a claim that the particular schema/output paths already exist. Do not execute it as an unattended scheduler until the activation gates pass.

`--ignore-user-config` retains saved authentication, but does not establish that every trusted project integration is disabled. Preflight project configuration/hooks/MCP and reject unexpected changes. Do not use `--ignore-rules`, `--trust`, `--skip-git-repo-check`, unrestricted execution flags or an API-key fallback. Preserve managed requirements. `--full-auto` is no longer supported. `-a` belongs before `exec` in the installed command layout; `exec resume` has different options, so revalidate its effective sandbox and approval policy rather than copying flags blindly.

Read-only filesystem access is **not** a database safety boundary: a process may still discover readable credentials or contact network services. Remove database/API/cloud secrets from the child environment, keep sensitive files outside its allowed evidence inputs, audit hooks/MCP, and use isolated schemas/read-only credentials for any expressly approved database task. Native role instructions are behavioral guidance; mechanical isolation belongs to the parent runner/OS/credential boundary.

## Credential-safe command boundaries

Current [permission profiles](https://learn.chatgpt.com/docs/permissions#filesystem-permissions) support exact read denials and a minimal read allowlist on macOS. Profiles are beta. Model/authentication service requests are explicitly separate from local command policy: the CLI can load its saved authentication while a sandboxed command is denied the credential directory. This is a documented boundary, not an enforcement result measured by this task. [Scope and enforcement](https://learn.chatgpt.com/docs/permissions#scope-and-enforcement).

Use this per-invocation configuration for a separately created, sanitized snapshot outside the main checkout. No global configuration should be modified:

```toml
default_permissions = "automation-readonly"

[permissions.automation-readonly.filesystem]
":root" = "deny"
":minimal" = "read"
"/Users/vicken/.codex" = "deny"
"/Users/vicken/Developer/FantasySportsSite" = "deny"
"~/.ssh" = "deny"
"~/.aws" = "deny"
":tmpdir" = "deny"
":slash_tmp" = "deny"

[permissions.automation-readonly.filesystem.":workspace_roots"]
"." = "read"
".env" = "deny"
".env.*" = "deny"

[permissions.automation-readonly.network]
enabled = false
```

Deny the actual `CODEX_HOME` path as well if it differs from `/Users/vicken/.codex`. The snapshot must not contain secrets, symlinks or other references exposing the primary checkout. More specific filesystem grants can reopen descendants of broader denials, so review the full effective policy. `:minimal` grants runtime dependencies and is not a guarantee that every personal path is hidden without explicit denials.

**Do not pass `--sandbox` or load `sandbox_mode` / `sandbox_workspace_write` alongside `default_permissions`.** Legacy sandbox settings override permission profiles (apart from the documented managed-profile allowlist exception). `--ignore-user-config` avoids user configuration while retaining authentication; also inspect project/managed configuration rather than assuming it is absent. [Profile selection and legacy interaction](https://learn.chatgpt.com/docs/permissions#define-and-select-a-profile).

The profile can be supplied through supported `-c` arguments without writing a configuration file:

```sh
/opt/homebrew/bin/codex -a never exec --ignore-user-config --json --color never \
  -C /absolute/path/to/separate-sanitized-snapshot \
  -c 'default_permissions="automation-readonly"' \
  -c 'permissions.automation-readonly.filesystem={":root"="deny",":minimal"="read","/Users/vicken/.codex"="deny","/Users/vicken/Developer/FantasySportsSite"="deny","~/.ssh"="deny","~/.aws"="deny",":tmpdir"="deny",":slash_tmp"="deny",":workspace_roots"={"."="read",".env"="deny",".env.*"="deny"}}' \
  -c 'permissions.automation-readonly.network.enabled=false' \
  -c 'features.apps=false' -c 'features.plugins=false' \
  -c 'features.browser_use=false' -c 'features.browser_use_external=false' \
  -c 'features.computer_use=false' -c 'web_search="disabled"' \
  --output-schema /absolute/path/to/reviewed-result.schema.json \
  -o /absolute/private/path/to/final.json -
```

Permission profiles govern sandboxed local commands; they do not fence MCP, connector, browser or computer-use capabilities. A task must expose zero MCP tools and audit hooks/other tool surfaces separately. CLI service traffic remains outside command network policy; that distinction permits model authentication but must not be represented as universal network denial. Network `enabled=false` blocks sandboxed command networking; domain allowlists require the separate proxy when network access is enabled.

Before using this profile for implementation or unattended execution, demonstrate its effective policy with harmless credential-shaped canaries outside the snapshot: permitted evidence reads succeed; denied main-checkout/home paths and local network/socket probes fail. Never use real secrets as test inputs or print credential contents. This task did not run that proof: the nested session rejected a help-only macOS sandbox invocation with `sandbox_apply: Operation not permitted`. A refusal is a limitation, not evidence that the candidate profile successfully protects an operator-launched job.

For the initial harmless fixed-JSON status demonstration, use the stricter fallback: disable the shell with `-c 'features.shell_tool=false'`, expose no MCP/apps/plugins/browser/computer-use/web tools, and provide only reviewed nonsecret context through stdin. Validate the output schema and finite process exit. This demonstrates bounded authenticated inference, structured reporting and queue recovery; **it does not demonstrate native file-inspecting delegation, safe write-capable execution or readiness for unattended activation**. The repository runner must verify the actual available tools and record any limitation rather than rely only on instructions asking the model not to read secrets.

## Authentication, usage and version limits

Saved ChatGPT login supports subscription-authenticated local Codex execution; no new API key, purchase or hosting is required for this design. Authentication availability was checked, not remaining credits or exact plan entitlement. Subscription limits and workspace policy still apply. Stop on exhaustion/authentication failure; record available JSON usage measurements, elapsed time and bounded attempts. Never switch to API billing automatically. [Authentication](https://learn.chatgpt.com/docs/auth), [pricing and usage](https://learn.chatgpt.com/docs/pricing).

Recheck local help/config parsing after CLI updates. An installed feature flag being listed is not proof that it is enabled, accessible to this account or reliable for unattended operation. No model completion or native six-role deployment was executed by this documentation inspection; the separate bounded automation demonstration must provide that evidence.
