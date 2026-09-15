# OpenAI Platform Development Access

Local agent login and OpenAI API authentication are separate. This integration selects a Headstart
project using a private execution profile and obtains its key from 1Password. It does not alter the
desktop ChatGPT/Codex login. Access to Headstart APIs does not approve the current chat workspace for
PHI or transfer Headstart's data-handling policy to a personal account.

## Architecture And Scope

| Layer                                               | Responsibility                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `headstart-openai-platform` skill                   | Identity, project preflight, bounded inspection and evidence limits                                     |
| `headstart-openai-agent-development` workflow skill | Canonical source changes, preparation, review, approved lifecycle operations and verification           |
| `openai-platform` package                           | Shared official SDK adapter, approval-plan guard, credential resolver and pinned skill preparation      |
| Existing workflow contracts/runtime                 | Workflow identity, manifest, prompt and schema validation                                               |
| Future managed runtime/control plane                | Materialization, service identity, durable approvals, scheduling, recovery and business-write execution |

The last layer is not implemented by this access package. Existing runner and workflow activation
gates remain unchanged. Saved OpenAI agent configuration is not a deployed Headstart workflow.
Repository code, skills, prompts, schemas and deterministic packages remain canonical in Agent
Platform; remote IDs and environment templates are deployment references, not competing sources.

## Local Runtime Setup

Installing skills does not install this package, the official CLI, 1Password, credentials, or a
managed runtime. From a reviewed Agent Platform checkout, follow its workspace rules, then:

```sh
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm exec turbo run build --filter=@headstart-health/openai-platform...
node packages/openai-platform/dist/cli.js --help
```

Use the exact pnpm version in `packageManager`. The package requires Node 22 or later, Git for
source preparation, and 1Password CLI with desktop integration for local API access. A local
launcher may point to this explicit reviewed runtime. Refresh it intentionally after source changes;
the skills updater does not rebuild it. Do not install dependencies during an operational run.

The `headstart-openai` command is Headstart's bounded adapter, **not** the official OpenAI CLI.
The official CLI can cover additional independently authorized platform operations, but verify its
version and supported command before use. An older Python `openai` command is not the newer Go CLI.
Do not overwrite another installation implicitly, use debug output with credentials, or assume a
project key authenticates the Admin API. See the [official CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli).

## Private Configuration

Keep configuration outside Git in approved local storage. It contains references, never secret
values. Create a project credential with the capabilities the owner approves, including writes and
billable runs when needed; current test scope does not require permanently narrowing the key.
Expiration and rotation are owner decisions, not a hard-coded 30-day policy. An All-permissions
project credential still does not grant organization-admin APIs or another provider's access.

```json
{
  "profile": {
    "schemaVersion": "headstart-capability-profile/v1",
    "id": "synthetic-development",
    "revision": "v1",
    "bindings": [
      {
        "capabilityId": "openai.agents.read",
        "providerId": "openai-sdk",
        "adapterVersion": "0.1.0",
        "credentialRef": "developer",
        "options": { "organizationId": "org-synthetic", "projectId": "proj_synthetic" }
      }
    ]
  },
  "credentials": {
    "developer": {
      "account": "headstarthealth.1password.com",
      "expectedEmail": "developer@example.com",
      "vault": "synthetic-vault-id",
      "item": "synthetic-item-id",
      "field": "credential"
    }
  }
}
```

### Per-Developer Setup And Agent Instructions

Everyone can use the same shared project, package and skills with their **own** approved project
API key. Each operator must have access to the intended OpenAI project and their own authorized
Headstart 1Password account. Do not share one employee's key as the team default.

The `credentialRef` above is a logical alias within this private configuration, not a globally
registered secret or a literal 1Password URI. Every developer can use the alias `developer` while
mapping it to different `expectedEmail`, `vault`, `item` and `field` values. Organization/project
IDs stay the same when collaborating in the same environment; development and production have
separate explicitly selected configurations. Never copy another person's private configuration
unchanged.

Use stable vault/item IDs and the exact field identifier. These coordinates identify the same
secret location that 1Password expresses as `op://vault/item/field`; this adapter keeps them as
separate validated fields together with the expected account identity. See the
[1Password secret-reference guidance](https://www.1password.dev/cli/secret-references).
The runtime resolves only the selected reference, in memory, and never falls back to a different
person, an ambient `OPENAI_API_KEY`, or a discovered vault item.

Use one of these local discovery mechanisms:

- Pass `--config /absolute/path/to/private-config.json` on each command. This is the most explicit
  option and works without a desktop application's environment inheriting shell settings.
- Set `HEADSTART_OPENAI_CONFIG` to that path in the invoking process or a personal launcher. It
  contains a **file path, not the key or an `op://` reference**. Explicit `--config` takes precedence;
  a missing, blank, invalid or inaccessible selected configuration fails instead of selecting
  another credential. The CLI does not automatically load `.env` files or expand `~` in a path.

```sh
HEADSTART_OPENAI_CONFIG=/absolute/path/to/private-config.json headstart-openai preflight
```

The shared `headstart-openai-platform` skill owns first-use guidance: check for the configured
runtime/profile, ask for missing non-secret coordinates, and run the authorized read preflight.
After setup, an operator may authorize a short note in their **existing machine-local agent
instructions**, for example:

> For Headstart OpenAI development access, use the `headstart-openai-platform` skill and the local
> launcher `/absolute/path/to/headstart-openai` with `--config /absolute/path/to/private-config.json`.
> Do not use another operator's credentials or infer API identity from the desktop ChatGPT login.

Keep that personal path note out of shared repository instructions. Instructions make the setup
discoverable; executable configuration and identity/project checks enforce which credential is
actually selected. Neither local notes nor this skill grant blanket write or billing authority.
The adapter does not edit shell profiles, install personal instructions, or discover credentials
automatically. A future managed runner must use a separately provisioned service identity and
approved secret provider; it must not inherit an employee's interactive 1Password session.

The read binding verifies the target and minimum Agents access; it does not assert or grant write
permissions. Write authority comes from the credential's actual scopes and the separately approved
action. The supervised adapter does not expand the read-only `capability-runtime` contract.

Use `op user get --me --account headstarthealth.1password.com --format json` to confirm identity.
An unlocked app alone does not establish CLI access. Never print an item or credential field while
diagnosing access. The adapter captures these internally and emits only safe output.

```sh
headstart-openai preflight --config PRIVATE_CONFIG.json
headstart-openai read --config PRIVATE_CONFIG.json --request PRIVATE_READ.json
```

A read request is, for example, `{"operation":"agents.list","query":{"limit":20}}`.
Supported reads: `models.list`, `agents.list`, `agents.get`, `sessions.list`, `sessions.get`,
`sessions.turns`, `sessions.items`, `templates.list`, `templates.get`. Resource reads use `id`;
page reads accept `query.limit` and `query.after`. Inspect content only when authorized and needed,
using `--include-content`. Never persist raw private session items as routine diagnostics.

Repeat preflight in a fresh local session after changing the desktop login. Report that test
separately; a successful current-session probe does not prove both account configurations work.

## Approved Writes And Executions

Prepare a private action JSON, review its target and complete payload, then produce an offline plan:

```sh
headstart-openai plan --config PRIVATE_CONFIG.json --request PRIVATE_ACTION.json
headstart-openai apply --config PRIVATE_CONFIG.json --request PRIVATE_ACTION.json --approve APPROVED_DIGEST
```

Only execute the second command after explicit human authorization for that exact operation and
target. Add `--allow-billable` only when execution charges and the intended input are approved.
Planning, capability, and key scope are not that approval. Request files may contain private prompts;
keep them in approved local storage, out of Git and normal tool-output transcripts.

| Action                                  | Required request fields                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `agents.create`                         | `body.model`; optional name, instructions, metadata, reasoning, tools |
| `agents.update`                         | `id`, `expectedFingerprint` from a current read, nonempty `body`      |
| `agents.delete`                         | `id`, `expectedFingerprint` from a current read                       |
| `templates.create`                      | `body` with optional name, network and prepared inline skills         |
| `templates.update` / `templates.delete` | `id`, `expectedFingerprint`; update also takes `body`                 |
| `sessions.create`                       | `body.agent_id`, explicit environment, input; optional metadata       |
| `sessions.send`                         | `id`, input, stable `idempotencyKey`                                  |
| `sessions.cancel` / `sessions.delete`   | `id`                                                                  |

Example create: `{"operation":"agents.create","body":{"model":"APPROVED_MODEL","name":"Example","instructions":"Use synthetic inputs only."}}`.
Updates preserve omitted fields; supplied arrays/objects replace the whole field. Review existing
metadata/tools before replacing them. Tool schemas support web search, tool search, application
functions, and credential-free HTTPS MCP with explicit tool allowlists. Declaring a function does
not install its responder. Credential vault provisioning and secret-bearing tool configuration are
not implemented here.

The initial CLI environment surface supports `none` and `openai_hosted` with an optional approved
`environment_template_id` and explicit network policy. Templates can carry prepared inline skills.
No automatic fallback creates compute or widens network access. Additional SDK capabilities need
a reviewed typed adapter extension; unsupported fields fail clearly, not silently disappear.

## Canonical Source To Agent Environment

Use the existing Headstart authoring skills and normal repository worktree/PR workflow to update
canonical skills, workflow manifests, prompts, schemas and packages. Do not download remote agent
instructions and overwrite source automatically. Keep remote drift as a reviewable diff.

```sh
headstart-openai workflow WORKFLOW_DIRECTORY
headstart-openai bundle-skill AGENT_PLATFORM_CHECKOUT FULL_COMMIT_SHA SKILL_NAME --output PRIVATE_BUNDLE.json
```

Workflow inspection calls the existing workflow loader and reports manifest requirements and a
source fingerprint. It always reports `deploymentReady: false`: inspection is not activation.
Skill bundling reads only regular tracked files at the exact full commit, resolves declared skill
dependencies, and produces deterministic inline ZIPs. It never copies installed skills, ignored
files, auth caches, `node_modules`, dotfiles or symlinks. The current packager supports UTF-8 text
assets only and rejects unsupported binary assets rather than corrupting them.

After reviewing and approving the archive's **contents and source revision for external upload**,
use its `skills` array as `body.skills` in a template create/update action. Retain the source commit,
bundle digest, template ID, agent ID and later session/turn IDs in the approved deployment record.
Use the saved template ID in a separately approved session creation. Existing sessions do not reload
updated templates; use a new session to verify a revision. See [official plugin/skill environment guidance](https://developers.openai.com/api/docs/guides/agents-api/tools/plugins).

The archive carries skill source, not workspace packages or their installed dependencies. A skill
requiring an engine, executable, MCP, provider identity, or repository must have that dependency
materialized and verified in the execution environment. Prepare these through the owning package's
supported runtime artifact and the selected hosting adapter. Do not install the whole developer
checkout or inject the developer's broadly capable OpenAI key into an agent sandbox.

No existing managed workflow may be launched merely by copying its prompt into `sessions.create`.
Respect lifecycle, input/output schemas, pinned source, tool/network/data policies and acceptance
gates; missing enforcement keeps the managed deployment blocked. This package enables development
and synthetic compatibility work, not silent activation of the checked-in draft reference.

## Verification And Release Notes

Version 0.1.0 adds supervised read/write lifecycle operations, explicit-target preflight,
1Password-backed local authentication, revision-pinned text-skill archives and workflow inspection.
No runner, deployment, automatic update, production access, or existing integration behavior changes.

Run `corepack pnpm qa`. Unit tests use synthetic fetch responses and source fixtures; no keys,
network services, billable executions or real mutations belong in hooks/CI. Live verification is a
separate authorized lane. Report current-session read access, synthetic write coverage, untested
live writes, cross-login verification and second-operator handoff independently.

See the [documentation hub](README.md) and [provider package](../packages/openai-platform/README.md).
