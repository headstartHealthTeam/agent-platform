---
name: headstart-openai-agent-development
description: Develop and manage Headstart OpenAI agents from local coding agents, connecting canonical Agent Platform skills and workflow packages to reviewed agent configurations, environment templates and explicitly approved sessions. Use for creating, updating, deleting, running or preparing these agents; not for routine platform inventory.
compatibility: Requires the Headstart OpenAI runtime and authorized project access; Git and a reviewed Agent Platform checkout are required for canonical source preparation.
metadata:
  author: headstart-health
  version: '0.1.0'
  headstart-requires: headstart-openai-platform, headstart-agent-workflow-authoring
---

# Headstart OpenAI Agent Development

Connect source development, reviewed artifacts and platform lifecycle operations without treating a
saved agent as an automatically deployed managed workflow.

## Inputs, Dependencies And Authority

The user supplies the desired change, exact project/resources, source revision when applicable,
data constraints and whether execution charges are authorized. Missing material choices stop only
the affected action; do not default to another project, model, provider or deployment environment.

- Use `headstart-openai-platform` for runtime readiness, identity and exact-project preflight.
- Use `headstart-agent-workflow-authoring` when creating/changing canonical skills, workflows or
  runtime code. It owns shape selection and routes shared skill authoring. Read the affected
  repository instructions and existing package interfaces before editing.
- If a dependency is missing, retrieve its canonical source or report the missing prerequisite.

Reads, source edits, uploads, remote mutations and billable runs are distinct permissions. Broad key
scope is intentional capability, not standing approval. Preserve the owner's existing key scope and
expiration unless they request a change. Live read-only testing does not mean the tooling must be
read-only; test writes synthetically until actual live mutation is separately approved.

## Development And Preparation

1. Inspect the relevant repository workflow, prompts, schemas, skills, engines and provider
   adapters. Reuse typed contracts and canonical sources; do not copy workflow-owned code into a
   separate project or fork local/hosted prompts.
2. Make authorized source changes through the repository's feature-worktree and review workflow.
   Do not overwrite canonical source from remote configuration automatically. Show remote drift
   as a proposed change with its source and intended owner.
3. Use the runtime's `workflow` command to inspect a managed package's existing manifest and
   requirements. Draft or blocked lifecycle, missing service identity, undeployed engines and
   missing materialization remain blockers. Do not bypass them by launching only its prompt.
4. For a reviewed portable skill, use `bundle-skill` at an exact full Git commit. Review the
   dependency closure and archive contents before approving external upload. Use the resulting
   inline `skills` in a template action; keep the source revision and bundle digest with the remote
   template ID in the approved deployment record.
5. Distinguish skill source from runtime readiness. Packages, executables, MCP connections, schemas,
   repositories, network/data controls and service identities need their own materialization and
   verification. Never put the developer's platform key, local auth caches, or unrelated repository
   files in the agent environment.

The runtime setup and request contract are linked from `headstart-openai-platform`. SDK fields not
yet exposed by the adapter need a reviewed typed extension, not an unvalidated HTTP escape hatch.

## Review And Apply

1. Read the current resource and show the intended changes. Agent/template updates and deletions
   require the current fingerprint. Omitted fields remain unchanged; supplied objects and arrays
   replace the entire field. Serialize supervised writers: the recheck is not an atomic lock.
2. Prepare the exact private action request and run `plan`. Review the payload itself as well as
   the plan's organization, project, operation, digest and billing/deletion consequences.
3. Obtain explicit human authorization for the exact action and target. Only then run `apply`
   with the approved digest. Session creation/input also needs authorized execution charges and
   `--allow-billable`. Do not approve your own plan or treat skill invocation as permission for an
   unspecified mutation.
4. Read back the resource after mutation and report the actual outcome. Record remote IDs and
   source provenance, not secret values or raw private logs. A network failure may have occurred
   after the write: stop and reconcile before retrying. Preserve an event submission's original
   idempotency key and payload; never invent general idempotency for the other operations.
5. Use a new session to test changed templates/skills. Session creation, idleness or stream closure
   does not prove successful execution. Check the intended turn's terminal outcome and required
   tool evidence through turns/items, within the approved data scope.
6. Cancel or delete only the identified approved resources. Saved-agent deletion, workflow pause
   and session cancellation are different actions; do not invent a generic disable API. Preserve
   needed artifacts before authorized deletion and disclose asynchronous or unverified cleanup.

## Completion And Boundaries

Return source changes, source/bundle fingerprints, exact platform operations and resource IDs,
verification evidence, remaining blockers and resources. Separate synthetic write tests from live
read checks and actual live executions. Do not claim a new managed deployment, second-operator
handoff or cross-login verification unless it was performed.

The current runner still rejects managed writes and inactive workflows. This supervised lifecycle
tooling does not implement control-plane approvals, schedules, durable retries, policy enforcement
or an autonomous business-write executor. Future managed consumers may reuse the adapter and source
contracts but must supply their own accepted identity, isolation, approval and recovery boundaries.
