# Capability Runtime

Resolves logical capability requirements against a private execution profile and verifies sanitized
provider preflight evidence. It fails closed when a binding, permission, target assertion, adapter
revision, or readiness result does not match.

This package does not load credentials or call external systems. Provider packages own those
operations and return evidence conforming to `@headstart-health/capability-contracts`.

See the [documentation hub](../../docs/README.md) and
[tool capability standard](../../standards/tool-capabilities.md).
