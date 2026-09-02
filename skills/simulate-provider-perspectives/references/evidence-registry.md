# Provider Persona Evidence Registry

This registry stores anonymized, synthesized evidence supporting or challenging the model. It is not a transcript archive.

## Governance And Freshness

- **Owner:** Headstart Product.
- **Last reviewed:** July 21, 2026.
- **Authority:** This registry is derived research evidence, not approved product policy or a source
  of current product behavior. Current designs, requirements, code, and operating-system records
  remain authoritative within their respective boundaries.
- **Provenance limitation:** Records E-001 through E-012 retain the source type, period, and internal
  link when one was captured. Exact document revisions or source fingerprints were not retained in
  the original local registry. Re-verify a source before using it to justify a foundational persona
  change or a consequential product decision.
- **Freshness trigger:** Run Calibrate mode after a material workflow, tool, pricing, or service-
  ownership change; repeated contradictory evidence; a new provider cohort; or a quarterly review.
- **Stale behavior:** Preserve the record as dated evidence, lower confidence when current
  verification is unavailable, and do not silently rewrite the model or present a stale observation
  as current fact.

## Record Schema

For each new record capture:

- ID
- Date or evidence period
- Source type and internal link when appropriate
- Anonymized cohort
- Observation
- Inferred need or hypothesis
- Persona, overlay, scenario, or rubric dimension affected
- Supports, contradicts, or extends
- Confidence: low, medium, or high
- Privacy notes

## Initial Evidence

### E-001 — Operational checklists during launch

- Period: March 2026
- Source: Fireflies provider post-training conversation
- Cohort: Early solo practice owner retaining other work
- Observation: The provider created personal client-intake checklists and said a pre-first-client checklist would have helped. Available time decreased after returning to other work.
- Inference: Early providers benefit from explicit prerequisites, resumable sequences, and reusable workflow aids.
- Applies to: P1; guidance-needing; cognitive and time burden
- Relationship: Supports
- Confidence: High

### E-002 — Repeated follow-up under ambiguous status

- Period: Recent portal-chat sample through July 2026
- Source: Headstart provider portal chats
- Cohort: Providers awaiting payer, credentialing, or operational follow-up
- Observation: Providers repeatedly asked whether someone would call, what to do if no call occurred, and how much longer a process would take.
- Inference: Generic waiting states create uncertainty about ownership, timing, and intervention thresholds.
- Applies to: P2; status-anxious; ownership and timing
- Relationship: Supports
- Confidence: High

### E-003 — Cross-tool operational friction

- Period: Recent portal-chat sample through July 2026
- Source: Headstart provider portal chats
- Cohort: Active hands-on operators
- Observation: Providers asked how to reconcile or correct issues across Aloha, HiRasmus, payroll, billing reports, and the provider portal.
- Inference: Tool fluency is system-specific; experienced providers still need data provenance, consistent status, and exception paths.
- Applies to: P2–P5; tool-fragmented; status trust
- Relationship: Extends
- Confidence: High

### E-004 — Simultaneous staffing and intake coordination

- Period: Recent portal-chat sample through July 2026
- Source: Headstart provider portal chats
- Cohort: Growing practices
- Observation: Providers coordinated backup therapists, multiple hires, treatment-plan updates, candidate interviews, and several clients at once.
- Inference: Case-level workflows need portfolio visibility, delegation, and staffing-sensitive exceptions as practices grow.
- Applies to: P4; scale and delegation
- Relationship: Supports
- Confidence: High

### E-005 — Fit over speed

- Period: Recent portal-chat sample through July 2026
- Source: Headstart provider portal chats
- Cohort: Selective independent providers
- Observation: A provider preferred a slower search for the right RBT, weighed family preferences and experience, and updated availability around school schedules.
- Inference: Deliberate selection and schedule boundaries should not be modeled as disengagement.
- Applies to: P3; fit-first; autonomy and reversibility
- Relationship: Supports
- Confidence: Medium

### E-006 — Availability is short-horizon and autonomy-sensitive

- Date: 2026-04-20
- Source: Google Drive meeting notes, Provider availability nuances
- Link: https://docs.google.com/document/d/1ZQacSD8KLEIk67u9qvWRHtZtT67j7_djY6goEY0uw1Y
- Cohort: Providers across experience levels
- Observation: Provider availability may only be predictable one to two weeks ahead because of clinical volatility, not solely other employment. Experienced providers may be less willing to cede scheduling control.
- Inference: Availability capture should support rolling updates, historical suggestions, clear consent, and opt-outs.
- Applies to: P1, P3; capacity-constrained; autonomy and notification fit
- Relationship: Supports and corrects
- Confidence: High

### E-007 — Portal-checking behavior varies with Headstart intensity

- Date: 2026-02-03
- Source: Google Drive meeting notes, Provider Notifications and Client Roster feedback
- Link: https://docs.google.com/document/d/1DLXcP080algEYFE0k_AbGAxEvh0JyPtNzVlU5-gqOIs
- Cohort: Full-time and part-time Headstart providers
- Observation: The usefulness of email or SMS reminders varies with how frequently providers check the portal and whether Headstart is full-time or part-time for them.
- Inference: Notification channel and cadence should adapt to relationship intensity rather than treating portal use as uniform.
- Applies to: P1, P2; mobile-interrupted; notification fit
- Relationship: Extends
- Confidence: High

### E-008 — Financial health is a universal provider job

- Date: Reviewed 2026-07-21
- Source: Google Drive document, Top things providers care about
- Link: https://docs.google.com/document/d/1aI7mMAOxbnVTSeq2iirDgAugdG2W-Zs57l0p-dGj-vA
- Cohort: Providers across growth stages
- Observation: Reimbursement timing, payout amount, revenue leakage, cancellations, and loan repayment are described as primary concerns.
- Inference: Financial visibility must be evaluated across personas, with intensity varying by dependence and scale.
- Applies to: Shared provider jobs; financial and capacity implications
- Relationship: Supports
- Confidence: High

### E-009 — Caseload and staffing drive growth sentiment

- Date: Reviewed 2026-07-21
- Source: Google Drive document, Top things providers care about
- Link: https://docs.google.com/document/d/1aI7mMAOxbnVTSeq2iirDgAugdG2W-Zs57l0p-dGj-vA
- Cohort: New and growing providers
- Observation: Providers care about qualified client volume, authorization blockers, hiring speed, candidate quality, and unused authorized hours.
- Inference: P2 focuses on admission momentum; P4 focuses on staffing capacity and utilization.
- Applies to: P2, P4; intake and growth velocity
- Relationship: Supports differentiation
- Confidence: High

### E-010 — Value scrutiny rises with scale

- Date: Reviewed 2026-07-21
- Source: Google Drive document, Top things providers care about
- Link: https://docs.google.com/document/d/1aI7mMAOxbnVTSeq2iirDgAugdG2W-Zs57l0p-dGj-vA
- Cohort: Growing and mature practices
- Observation: As practices grow, providers may question Headstart's take rate when they believe their practice is performing work expected from Headstart.
- Inference: Mature-practice experiences should make service ownership, completed work, and partnership value visible.
- Applies to: P5; status trust; scale and delegation
- Relationship: Supports
- Confidence: High

### E-011 — Centralization and self-visibility reduce uncertainty

- Date: 2026-06-30
- Source: Google Drive meeting notes, Training and Onboarding — Problems, workflows, concepts
- Link: https://docs.google.com/document/d/1RTGJ-1lfe3XEggOGesrszYw0_6v-BT8VH1W36dKaKWU
- Cohort: Providers in onboarding
- Observation: Onboarding spans disjointed tools and manual task tracking; the desired portal gives providers direct progress, upcoming-task, and dependency visibility.
- Inference: P1 needs centralized progress and explicit dependencies; connected-tool complexity should not be hidden behind vague status.
- Applies to: P1; guidance-needing; tool and channel continuity
- Relationship: Supports
- Confidence: High

### E-012 — Delegated and multi-site operations exist

- Period: January–July 2026
- Source: Fireflies graduation and one-on-one conversations
- Cohort: Providers operating larger or multi-location practices
- Observation: Some providers manage multiple centers, clinical directors, distributed teams, payroll, and delegated staff coordination.
- Inference: The model needs a mature operator whose portal use may be delegated and whose needs differ from a solo clinician.
- Applies to: P5; scale and delegation
- Relationship: Supports
- Confidence: Medium

## Known Gaps

- Headstart-full-time needs a precise operational definition: share of caseload, share of income, or absence of other employment.
- Practice administrators and employed BCBAs have not yet been modeled as separate foundational users.
- Mobile behavior is inferred from terse and interrupted communication but needs direct usability observation.
- Evidence is stronger for onboarding and early growth than for stable mature practices.
- Aircall evidence is not included because available access is client-record-specific rather than suitable for broad provider research.
- The MVP brain dump is intentionally excluded.
