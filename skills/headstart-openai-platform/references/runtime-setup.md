# Runtime Setup

The Agent Platform skill installer distributes instructions only. Obtain a reviewed checkout of
`headstartHealthTeam/agent-platform`, read its `AGENTS.md`, then follow
[`docs/openai-platform-access.md`](https://github.com/headstartHealthTeam/agent-platform/blob/main/docs/openai-platform-access.md).
For an explicitly authorized prerelease evaluation, read that document from the exact candidate
checkout; do not pretend it is already released on `main`.

The guide owns installation commands, the private capability profile format, the complete supported
operation contract and canonical-source preparation. The package is
`@headstart-health/openai-platform`; its local command is `headstart-openai`, not the official
OpenAI CLI. If no launcher exists, invoke `node packages/openai-platform/dist/cli.js` from the
verified checkout after building the package and dependencies.

Keep private configuration outside Git. Ask the owner to create/store a credential through the
approved secure flow if missing; never collect a plaintext credential in chat. Credential scope,
expiry and storage are explicit owner choices. An All-permissions project key may support reads,
agent management and billable execution, but operations still require authorization. A project key
does not replace an Admin API key, downstream provider identity or self-hosted executor key.

Each operator uses their own private profile, even when everyone targets the same OpenAI project.
The logical `credentialRef` may be identical across profiles; the expected user and 1Password
vault/item/field belong to that operator. Confirm the intended project and the expected signed-in
Headstart 1Password identity before configuring the reference. Do not enumerate unrelated secrets
to guess which one to use, overwrite another profile, or treat an API key as an onboarding input
that can be pasted into chat.

Follow the guide's per-developer setup section. Prefer an explicit absolute `--config` path or a
personal launcher; `HEADSTART_OPENAI_CONFIG` is an optional path-only alternative, not a plaintext
credential. Do not assume a desktop app inherits a shell profile. With the operator's permission,
record only the launcher/profile paths in their existing machine-local agent instructions; keep
the shared skill generic. Missing or mismatched configuration requires correction, not account
fallback. Future managed execution needs its own service identity, not this interactive login.

Verify the local runtime with `--help` before attempting the separately authorized `preflight`.
Following a skill update, recheck runtime compatibility; no automatic runtime refresh is implemented.
