# Knowledge Workflow Sources

## Separate Capability From Authority

A native connector, MCP server, browser, or CLI provides access. It does not decide whether a source
is authoritative or whether an agent may search, edit, send, or delete content.

Knowledge-work skills must state the purpose and scope of each source read. Prefer the active host's
authorized native connector for semantic operations, then use a documented fallback when the native
capability is unavailable. Never require a host-specific tool identifier in the portable workflow.

## Common Headstart Source Roles

### Google Docs

Google Docs commonly owns collaborative planning, stakeholder questions, procedures, and decision
records. Verify whether the referenced document is the current canonical version before editing it.
Preserve document structure and comments when a user explicitly requests a write.

### Gmail

Gmail provides dated communication evidence, decisions communicated in email, and context that may
not yet be reflected in a canonical artifact. Scope searches by initiative, people, subject, or date.
Do not inventory a mailbox broadly, and do not treat an email as approved policy merely because it is
recent.

### Linear

Linear owns execution state, issue relationships, assignment, prioritization, and delivery history.
It may contain requirements, but it is not automatically the canonical design or policy source.
Skills must separate reads from issue creation, comments, and status changes.

### Notion

Notion may own collaborative knowledge, plans, or procedures for teams that use it. When a Notion
page overlaps a Google Doc or repository document, establish the canonical owner before writing and
prefer links over duplicated prose.

### Repositories And GitHub

Repository files and current code own codebase behavior, repository instructions, validation, and
implementation history. GitHub owns current pull request, review, release, and issue metadata. A
repository cannot by itself prove an operational practice that lives outside the codebase.

### Meetings, Recordings, And Generated Notes

These are dated evidence about what participants said or demonstrated. Generated summaries are
secondary evidence. Verify material current-state claims against the current owning system or an
approved decision record when practical.

## Canonical Destination Rule

Choose one durable owner for a decision or learning. Other systems may hold links, implementation
tasks, status, or communication, but should not receive copied content that will drift independently.

## Derived Knowledge Artifacts

A condensed rule set, manifest, checklist, or source-specific reference is derived evidence, not a
new authority merely because an agent created it. Create one only when bounded retrieval at run time
is insufficient and a reviewed, stable artifact materially improves consistency, latency, or context
quality.

Every derived artifact must identify:

- the authoritative source, stable identifier, and exact revision, fingerprint, or effective date;
- when it was retrieved or verified, what scope was extracted, and what was intentionally excluded;
- citations that allow a reviewer to trace material rules back to the source;
- the owner, review cadence or freshness trigger, and behavior when the source is missing or stale;
  and
- any human-approved operational interpretation separately from the formal source requirement.

Prefer retrieving only the relevant source fragments over loading a broad corpus into every run.
The narrowing step may be agent-assisted or deterministic, but its output must preserve provenance
and must not silently replace the source of truth. Observed outcomes may identify a possible rule or
source problem; they must not automatically rewrite a shared artifact. Changes require human review,
a canonical repository update, and regression evidence.

## Write Boundary

Default knowledge discovery and review workflows to read-only. An external write requires explicit
user intent for the target system and action. Permission to edit one system does not authorize
corresponding edits in every linked system.

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Tool capabilities](tool-capabilities.md)
- [Security and data handling](security-and-data-handling.md)
