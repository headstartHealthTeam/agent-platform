# Content Engine V1 Architecture

## Purpose And Current Shape

Content Engine V1 is a portable, person-supervised workflow skill. It creates review-ready Resource
proposals while backend and admin work separately own durable workflow state, revisions,
permissions, previews, approvals, scheduling, publication, and notifications.

Do not add a managed `workflows/content-engine/` package until the supervised pilot demonstrates
value and reliability and Headstart explicitly approves independently managed execution. A future
package must reference this skill rather than fork its behavior.

## Artifact Flow

```text
Approved Opportunity
        |
        v
Versioned Research Packet
        |
        v
Draft Bundle ----> Verification Report
        |                  |
        |             one repair pass
        v                  v
Review-Ready Draft Bundle + Human Handoff
        |
        v
Application-Owned Review, Preview, Approval, And Publication
```

A revision run starts from the exact review-ready draft revision, its packet version, and structured
human feedback. It returns a new immutable revision plus a change ledger. It never mutates the prior
revision in place.

## Context Topology

Use one coordinator with three logical contexts:

1. **Research context:** resolves the opportunity and creates the packet. It may use approved
   internal sources, search data, and public pages.
2. **Writer context:** receives the frozen packet, `write-headstart-tone-and-voice`, and relevant
   `design-headstart-public-website` guidance. It does not inherit unrestricted research tools or
   the researcher's complete browsing history.
3. **Verifier context:** receives the packet, exact draft bundle, and quality rubric. It evaluates
   independently and returns structured findings rather than rewriting from intuition.

These may be separate model contexts or explicit artifact handoffs in one agent. They are not a
requirement to launch three persistent agents. Add more orchestration only when evaluation shows a
material quality or latency benefit.

## Quality Loop

The artifact under review is one exact draft or revision bundle. The verifier returns gate results,
claim-level findings, and actionable repairs. One repair pass is allowed. If the same substantive
failure remains, or a repair would require new evidence or a strategy change, stop and route the
item to a person.

Infrastructure retry and quality repair are separate. Retrying a failed read does not consume the
repair attempt; rewriting content does. No external write occurs inside either loop.

## Application Handoff

The final workflow output is shaped for the future backend/admin contract but remains a proposal.
The application must assign durable run and revision identity, authorize writes, enforce stale-write
protection and idempotency, bind approval to an exact content and image revision, and perform the
publication side effect. Slack remains notification and navigation, not approval authority.
