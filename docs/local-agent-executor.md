# Retained local Agents API executor

**Optional fallback, not the default connected-test path.** Follow the
[hosted-first development decision](agent-workflow-development.md#hosted-first-connected-execution).
Normal local backend/admin can use an OpenAI-hosted sandbox directly. The implementation below is
retained for explicit local-execution needs or verified hosted limitations, not a prerequisite for
installing Agent Platform tools. This decision neither removes existing code nor changes resources.

The normal backend and authenticated admin application are the primary integration path. This
package adds a retained **local-development** `codex exec-server` provisioner, not another agent
runtime, API emulator, playground, or decision to host production on a laptop.

## Shared behavior versus environment-specific compute

The application saves one launch attempt and the exact provider session receipt before starting
compute. `reconcileEnvironment` reads that known session, starts initial compute or repairs a
current `environment_connection` request, and never resends input. Notifications are wake-up
hints; current provider state is authoritative. A pending function is not a compute-start request.
An idle turn is not permission to shut down a conversation that may receive a later message.

The backend owns admission, durable identity, recovery scheduling and serialization with operator
commands. Agent Platform owns the provider adapter and executor interface. OpenAI owns the agent
harness; the Docker container runs only its official execution server. Workflow reasoning does not
move into the backend. Shutdown of an observation stream does not shut down compute.

The launch receipt, observation, messages, exact answers, publication and Stop contracts carry to
OpenAI-hosted execution. Hosted environments do not use this Docker provisioner. They still need
managed credentials, source access, file retention and their own acceptance evidence. The current
backend composition remains deliberately local-only until that deployment work is verified.

## Build and configure the optional self-hosted path

Build from the reviewed package checkout, then pin the resulting local image ID:

```sh
corepack pnpm --filter @headstart-health/openai-platform build
docker build -f packages/openai-platform/executor.Dockerfile -t headstart-agent-executor:local packages/openai-platform
docker image inspect headstart-agent-executor:local --format '{{.Id}}'
```

The Dockerfile pins Node and the official Codex version. Provisioning never pulls an image or
installs dependencies. Supply the immutable `sha256:` image ID, not a mutable tag, in a private
JSON file selected by the backend's `AGENT_RUNTIME_EXECUTOR_CONFIG`:

```json
{
  "imageId": "sha256:<64 lowercase hex characters from the reviewed image>",
  "credential": {
    "account": "headstarthealth.1password.com",
    "expectedEmail": "mark@headstart.health",
    "vault": "approved-vault-id",
    "item": "separate-executor-item-id",
    "field": "credential"
  }
}
```

Use the existing private-profile credential schema and approved Headstart 1Password account;
the example is a shape illustration, not an executable credential. Keep the application profile
outside the container and use a separate restricted environment key for the same OpenAI target.
Do not include key values in committed files, command arguments, logs or Docker configuration.
The local factory resolves the environment credential only when bootstrap is needed and rejects
reuse of the application key.

The local launch profile must select `self_hosted` with `/workspace`. This executor permits only
native **service-origin** MCP connections in that profile: OpenAI accesses the configured MCP
service; the local container is not granted arbitrary source-system network access. Missing MCP
identity or approved file access remains a prerequisite, not a reason to copy employee tokens,
invent a service identity, or add a parallel backend source-query tool.

## Isolation and retention

- One deterministic container, named workspace volume and private network per target/session.
  Exact image, ownership and environment-binding checks prevent silent replacement or adoption
  of another session's files. The Docker daemon and application composition are trusted.
- Non-root, read-only root filesystem, dropped capabilities, no host bind mounts, no application
  credentials or host auth caches. Scratch home and temporary files are ephemeral.
- Only `/workspace` persists across executor/container restart. A separate CONNECT proxy permits
  the two documented OpenAI destinations; the executor uses an internal Docker network. This is
  not a promise that arbitrary MCP or browser automation will work under that network policy.
- A private stdin/socket bootstrap supplies the environment key to the exec-server child, not
  Docker's stored environment or process arguments. Container output logging is disabled.
- One supervisor child per retained binding, with an explicit development expiry. A `ready`
  bootstrap response confirms local handoff only, **not** API connection or successful model work.
- Stop compute separately from cancelling the provider session. Neither operation deletes files
  or undoes business effects. Retain stopped resources for diagnosis; cleanup is an explicit
  operation against verified identities, never automatic deletion after a failed test.

The backend records bounded recovery attempts before I/O and rechecks domain authority plus
durable Stop under the existing run lock. Permission denial, expiry or retained Stop prevents a
restart. Transient infrastructure errors retain the session and back off; exhausting recovery
requires investigation of that same session, never another create request. The development
deadline is not a production timeout policy, and an environment ID is not a filesystem backup.

## Verification and remaining gates

Ordinary package tests exercise the provider decision boundary, deterministic Docker identity,
single-child ownership, credential transport and expiry. Backend disposable-database tests cover
receipt-before-compute, restart, Stop, backoff and no input/create replay. An offline Docker check
can replace only the Codex binary with an invented worker to verify retained files and lifecycle;
that proves no provider connection, model behavior or source access.

Real-API acceptance must additionally verify normal-app launch, native source reads, exact source
files, review-driven correction, questions, unsolicited guidance, reload, recovery and Stop under
an explicitly authorized run. Hosted acceptance repeats the same operator/workflow cases in the
intended hosted environment. Neither check is replaced by an isolated playground. Keep the earlier
later-turn managed-function failures as a separate investigation; this provisioner is not their fix.

Official contracts checked September 21, 2026:
[environment lifecycle](https://developers.openai.com/api/docs/guides/agents-api/environments/lifecycle),
[self-hosted environments](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted).
See also [development sequence](agent-workflow-development.md),
[shared integration](shared-operator-integration.md) and
[provider package](../packages/openai-platform/README.md).
