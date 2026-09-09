# Approved Opportunity Intake

## Current Headstart Strategy Source

The current approved family-strategy foundation is the **Headstart Patient Content Pillars &
Journey Research** workbook:

- stable document ID: `1fvn1t1XQn-6aAfKFWE5l3e5HvldU_5Uoa95iF__cbsM`;
- owner role: Headstart organic acquisition leadership;
- role: approved audience, pillar, journey, keyword, Search TAM, and opportunity foundation; and
- limitation: approval of the pillar direction does not automatically approve every candidate page,
  claim, route, or publication.
- freshness trigger: re-resolve the exact opportunity before each new packet and whenever the
  workbook, approval state, or selected opportunity changes; and
- stale behavior: stop rather than relying on a previously copied row when its revision or approval
  cannot be reconciled with the current source.

A future application-owned opportunity record may replace the workbook as the operational source.
The workflow contract does not change: the caller must supply one stable opportunity identity, its
source revision, and evidence that it is approved for research and drafting.

Do not search an entire Drive or infer approval from a row's existence. Retrieve the exact document,
tab, row, range, record, or identifier supplied by the caller.

## Required Opportunity Fields

Record these fields before research:

| Field                     | Requirement                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `opportunityId`           | Stable record, row, or application identifier                              |
| `source`                  | Stable document or system identifier plus exact tab, row, range, or record |
| `sourceRevision`          | Revision, modified time, fingerprint, or application version               |
| `approval`                | Approved state, approver or owning role, and approval evidence             |
| `primaryAudience`         | Family, BCBA, RBT, or another explicitly approved audience                 |
| `secondaryAudiences`      | Optional additional audiences; never inferred from keyword overlap         |
| `primaryPillar`           | Approved durable topic cluster                                             |
| `secondaryPillar`         | Optional approved supporting cluster                                       |
| `primaryJourneyStage`     | Reader's primary stage or decision context                                 |
| `additionalJourneyStages` | Optional, only when supported by the approved source                       |
| `readerNeed`              | Question, decision, or task the Resource should help with                  |
| `conversionRole`          | Intended next action and how the Resource supports it                      |
| `seedCluster`             | Approved topic, query, and candidate keyword set when available            |
| `marketScope`             | Country/database, language, and any approved geographic scope              |
| `knownConstraints`        | Payer, clinical, legal, geographic, claim, format, or timing boundaries    |

## Intake Decision

Classify the opportunity as one of:

- **ready for research:** identity, approval, audience, page job, and scope are clear;
- **needs source clarification:** the opportunity exists but identity, revision, or approval is
  ambiguous;
- **needs strategy reconciliation:** current search or content evidence materially conflicts with
  the approved page job; or
- **duplicate or refresh candidate:** existing Headstart content may already satisfy the need.

Only `ready for research` proceeds automatically. The other outcomes return evidence and a focused
question or recommendation without inventing a new approved direction.
