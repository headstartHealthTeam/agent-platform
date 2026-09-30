# Credentialing hosted release

This is the release contract for the existing credentialing workflow, not a second workflow or
runtime service. The normal admin application and backend manage cases, review, messages, questions,
Stop, durable recovery and archives. OpenAI-hosted compute runs Agent Platform's workflow, canonical
skills, source tools and parsers. Desktop execution retains the same independently usable code.

## Two artifacts, one reviewed source

| Destination        | Contents                                                                                                                                                         | Excludes                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Hosted environment | Installed workflow package with production dependencies, canonical skill directories/supporting files, prompts/schemas, document/Drive/MCP CLIs, runtime receipt | Credentials, private profiles, fixtures, grading answers              |
| Backend image      | Bundled API adapter, canonical result validator, compact prepared launch definition, integrity manifest                                                          | Source readers, parsers, skill trees, executor and their dependencies |

The backend passes the case input, existing function contracts and short mandatory workflow entry.
It does not author the skill, orchestrate document investigation, install the hosted tools or send a
full instruction copy on every launch. The agent discovers its installed skill and can investigate
with all configured tools outside a rigid sequence. Native MCP and the installed document tools
receive the same per-run service grant. Google reading/parsing stays here; token renewal stays in
the owning application's existing issuer, outside compute. Full evidence and archive contracts are
unchanged. No cleanup schedule, retention period or automatic deletion is enabled.

### Build

Use the pinned Node/pnpm setup in the repository guide, a **clean reviewed exact commit**, and its
frozen lockfile. `pnpm build` builds the canonical workflow definition as well as the shared adapter.
From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm credentialing:release --expected-source <40-character-reviewed-SHA> --target /absolute/new-release-directory
```

This reuses the existing packagers and installed-reader verifier to create `runtime/`,
`backend-integration/` and, only after successful verification, `handoff.json`. The handoff records
the fresh dependency audit, exact backend source-pin JSON, runtime receipt and integration digests.
The output must be new and outside the checkout. A failed preparation may leave partial outputs;
without a handoff they are not a completed release. No cloud resources or backend files are changed.
The handoff is local/CI evidence, not a signed security attestation or permission to deploy. Recheck
the audit before merge if its 15-minute freshness window has elapsed.

The normal CI's **Hosted Linux runtime artifact** job runs the installed PDF page renderer and Office
worker outside the checkout, checks the whole dependency tree, and produces a Linux x64 tarball plus
receipt named `credentialing-linux-runtime-<exact-source-SHA>`. It enforces the hosted 50 MiB input
limit and also retains the matching application artifacts and handoff. Mac/Windows build output is
for that local platform, not a hosted release. The backend release
build independently produces its small integration artifacts from the same exact source SHA.

`runtimeRevision` binds source SHA, lockfile and canonical definition bytes. The runtime archive has
its own byte digest, because platform-specific native dependencies differ. A dirty local runtime is
marked as such and rejected by hosted bootstrap; application release packaging rejects dirty source.
Do not pin a mutable branch or assume the squash-merge SHA equals a reviewed feature SHA. Preserve
the reviewed commit and its CI artifact; changing the selected source requires rebuilding both
artifacts. Backend's committed `infra/agent-platform-release.json` owns its immutable source pin.

## Provision the hosted template (separate authorization)

No packaging or ordinary CI step uploads files, creates a template, changes credentials, or starts a
paid session. After approval, use the existing supervised OpenAI CLI's exact-target plan/apply flow
described in the [provider README](../packages/openai-platform/README.md). First verify organization
and project. Upload the CI-produced archive with this action:

```json
{
  "operation": "files.upload",
  "path": "/absolute/credentialing-runtime.tar.gz",
  "sha256": "<64-hex-archive-digest>"
}
```

The adapter verifies and captures approved bytes before upload, uses Files API `user_data`, and
does not automatically replay an uncertain mutation. Record the returned file ID privately. Build
the template action from a protected selection JSON containing `fileId`, `archiveSha256`,
`runtimeRevision`, exact `mcpUrl`, `googleTokenUrl`, `googleAccountEmail` and `allowedDomains`:

```sh
node --import tsx scripts/credentialing-hosted-template.ts --selection /absolute/selection.json --archive /absolute/credentialing-runtime.tar.gz
```

Use the deployed `/mcp` audience and `/service-access/google-drive/token` endpoint with the same
HTTPS host/port. Include the exact backend and Google API hosts required by the tools; no wildcard
hosts. These are credential destinations, not case-folder or field restrictions. Additional approved
investigation hosts remain a deployment selection. The template contains no access token or key.

Plan/apply the generated `templates.create` action. Setup checks Linux x64/Node 22+, archive bytes,
clean provenance and installed entries before the agent starts. Read `templates.get` afterward and
record the returned `fingerprint` together with its template ID and runtime revision. Configure the
application's launch `preparedRuntime: { revision, templateFingerprint }`. Each new launch checks
that exact provider template snapshot. Edit-by-ID is not immutable: any change requires a reviewed
new fingerprint/selection. This check does not block observation, messages or Stop on existing runs.

The prepared launch must not override template files, packages, setup commands or discovery
directories. Explicit per-run environment/network selections preserve renewable credential binding;
they must retain the required source hosts. Long-lived credentials never enter template files,
archive bytes, launch JSON or the agent conversation.

## Application configuration and acceptance

The backend's `docs/CREDENTIALING_HOSTED_RELEASE.md` owns real image construction, CloudFormation,
Secrets Manager references, identity provisioning, profile validation and normal admin acceptance.
Use that runbook alongside this one, not a new local playground. The backend derives its webhook
target from the configured OpenAI organization/project; no manually copied target hash is needed.

Three independent conclusions must remain explicit:

1. **Release verified:** clean exact artifacts, cross-platform QA, Linux reader smoke and the actual
   backend image/compiled-consumer checks pass. This is the pre-merge code gate.
2. **Environment configured:** the reviewed template, source identity, issuer, webhook, bucket and
   deployed profile are verified in the chosen environment. This needs authorized provisioning.
3. **Connected acceptance:** the normal dev admin launches the hosted workflow, the agent reads
   complete originals and publishes reviewable evidence, and messages/questions, correction,
   reload/background processing, recovery and Stop work. This needs an authorized run and source
   target; deterministic tests are not a substitute.

Payer-browser actions and broader business MVP acceptance remain the project's existing scope and
approval boundaries, not something this release verification silently declares complete.
