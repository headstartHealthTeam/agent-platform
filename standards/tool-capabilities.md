# Tool Capabilities

## Capability-First Instructions

Skills should request capabilities such as:

- repository and Git history reads;
- authenticated pull request metadata and review-thread reads;
- issue-tracker reads or writes;
- read-only Salesforce schema discovery;
- document retrieval or browser control; and
- deterministic local command execution.

The active host chooses an available provider: native connector, MCP server, application plugin,
browser, or CLI. A skill may recommend a preferred provider when Headstart policy establishes one,
but it must document the fallback and any loss of fidelity.

Do not create a shared skill merely to restate a well-described tool's basic operations. Create a
skill when Headstart has a reusable procedure, decision model, safety boundary, or output contract
around one or more capabilities.

## Capability Checks

Before relying on a capability:

1. confirm that it is available and authenticated;
2. confirm that the requested operation is within its permission scope;
3. distinguish reads from writes and metadata from sensitive record access;
4. use the narrowest operation that can answer the question; and
5. report missing capability or partial evidence explicitly.

Never convert an unavailable connector into guessed output. Never infer authorization from successful
authentication.

## Reusable Provider Bindings

When multiple engines need the same external read, define the provider-neutral contract in a shared
package and keep provider selection in a private execution profile. The profile pins the adapter
revision, references credentials without containing them, and declares the exact target. A bounded
preflight read must verify target identity, permission scope, and response visibility before the
engine runs.

Engines consume normalized source snapshots rather than MCP-specific tool payloads. Provider
substitution requires conformance tests against the same request, response, completeness, and
preflight contract. Do not install an unpinned dependency during a workflow run or expose a
provider's write surface when the declared capability is read-only.

See [reusable data capabilities](../docs/reusable-data-capabilities.md) for the reference package
boundary and content-pillar/TAM join example.

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Workflow composition](workflow-composition.md)
- [Security and data handling](security-and-data-handling.md)
- [Knowledge workflow sources](knowledge-workflow-sources.md)
