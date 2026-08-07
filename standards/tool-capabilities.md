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

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Workflow composition](workflow-composition.md)
- [Security and data handling](security-and-data-handling.md)
- [Knowledge workflow sources](knowledge-workflow-sources.md)
