# Security And Data Handling

## Repository Content

Skills, managed workflows, evaluations, scripts, references, and fixtures must not contain:

- credentials, secrets, access tokens, refresh tokens, or private keys;
- PHI or identifiable client, patient, member, or family information;
- production database rows, raw documents, private file bytes, or unrestricted download URLs;
- machine-local account identifiers or absolute paths; or
- logs or screenshots that expose sensitive systems.

Use unmistakably synthetic fixtures and sanitized examples.

## Runtime Authority

A skill is instructional capability, not authorization. It inherits the active organization's and
repository's rules for PHI, production access, external writes, approvals, and auditability.

A managed workflow manifest is operating policy, but it still cannot grant authority beyond the
service identity and owning system. The runner receives an explicit environment allowlist and an
isolated workspace; it must never inherit a developer's complete environment or personal auth cache.

PHI-classified workflows must not persist raw Codex event streams. Persist only the minimum
PHI-safe operational events and approved artifacts needed for support and auditability.

Consequential workflows must distinguish read-only preparation from remote mutation. They must
default to the least consequential behavior, require explicit intent before writes, and report what
was actually changed.

Do not send internal or sensitive content to another model, external reviewer, or service merely to
add a second opinion. Cross-provider egress requires explicit user intent and confirmation that the
destination is permitted for the content.

## Tool Metadata

Tool descriptions must state whether an operation reads or writes, its required identifiers,
permissions, output shape, failure behavior, and prohibited uses. Vague metadata is an operational
risk because agents cannot reliably infer these boundaries.

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Managed workflow architecture](../docs/codex-managed-workflow-architecture.md)
- [Tool capabilities](tool-capabilities.md)
- [Testing and release](testing-and-release.md)
