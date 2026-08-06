# Security And Data Handling

## Repository Content

Skills, evaluations, scripts, references, and fixtures must not contain:

- credentials, secrets, access tokens, refresh tokens, or private keys;
- PHI or identifiable client, patient, member, or family information;
- production database rows, raw documents, private file bytes, or unrestricted download URLs;
- machine-local account identifiers or absolute paths; or
- logs or screenshots that expose sensitive systems.

Use unmistakably synthetic fixtures and sanitized examples.

## Runtime Authority

A skill is instructional capability, not authorization. It inherits the active organization's and
repository's rules for PHI, production access, external writes, approvals, and auditability.

Consequential workflows must distinguish read-only preparation from remote mutation. They must
default to the least consequential behavior, require explicit intent before writes, and report what
was actually changed.

## Tool Metadata

Tool descriptions must state whether an operation reads or writes, its required identifiers,
permissions, output shape, failure behavior, and prohibited uses. Vague metadata is an operational
risk because agents cannot reliably infer these boundaries.
