# Capability Contracts

Runtime-neutral schemas for logical capabilities, execution profiles, provider bindings, target
assertions, and sanitized preflight results. Workflows declare these contracts without embedding
machine-local aliases, provider commands, credentials, or business-specific policy.

This package grants no authority and performs no external operations. A private execution profile
selects a provider, while the capability runtime verifies the binding before an agent or engine
uses it.

Use the [documentation hub](../../docs/README.md), [workflow authoring guide](../../docs/workflow-authoring-guide.md),
and [tool capability standard](../../standards/tool-capabilities.md) for the surrounding architecture.
