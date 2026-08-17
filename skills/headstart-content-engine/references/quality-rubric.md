# Content Engine Quality Rubric

## Verification Order

Run objective contract and evidence checks before qualitative review. A polished draft fails when
its artifact contract, evidence, or safety boundary fails.

## Deterministic Or Direct Checks

Confirm:

- all required artifact fields and identifiers are present;
- opportunity, packet, and draft versions agree;
- every material claim maps to an existing packet claim ID;
- required URLs and internal-link targets are syntactically valid;
- title, slug, taxonomy, CTA, image, alt-text, and reviewer states are explicit;
- no placeholder, credential, PHI, raw private data, or unrestricted file URL appears;
- no field claims a rendered, link, accessibility, or publication check that was not performed; and
- the output states its proposal-only side-effect status.

## Evidence And Safety Gate

The draft passes only when:

- facts preserve source meaning and qualifiers;
- clinical, insurance, legal, geographic, availability, timing, outcome, and quantitative claims
  are supported or explicitly escalated;
- competitor observations are not presented as authoritative facts;
- conflicts and staleness remain visible; and
- no new claim was introduced during drafting or repair.

## Reader Usefulness And Information Gain

Evaluate whether the Resource:

- answers the approved reader need in a useful order;
- gives the reader a practical decision, framework, example, checklist, or next step;
- delivers the packet's information-gain thesis;
- avoids generic summary sections that could be relabeled for any ABA company; and
- earns its proposed existence rather than duplicating current Headstart coverage.

## Search Quality

Confirm that:

- the primary query reflects the page job and appears naturally where useful;
- supporting concepts are covered without keyword stacking;
- separate-intent and excluded terms have not been forced into the page;
- metadata, visible title, H1, and slug each serve their appropriate role;
- internal links help the reader and fit the destination's intent; and
- length and heading count follow content need rather than competitor averages.

## Headstart Voice And Role Clarity

Apply `write-headstart-tone-and-voice`. The draft should be human, clear, grounded, useful, and
respectful for the named audience. It must identify actors correctly, avoid institutional or
internal API language, preserve agency, and avoid hype or guarantees.

## Visual And Accessibility Guidance

Apply `design-headstart-public-website` to the image brief and visible Resource presentation. Check
that the visual idea supports the subject, uses approved human photography or another authorized
asset class, preserves faces and interactions, anticipates responsive crops, and includes accurate
alt-text requirements. An asset idea is not an approved asset.

Rendered visual, keyboard, link, responsive, structured-data, and performance checks remain
`not_checked` until the real preview or implementation is available.

## Decision

Return one of:

- **pass:** ready for human review with no blocking automated finding;
- **pass with review items:** useful draft with explicit human judgments or unavailable downstream
  checks;
- **repair:** bounded corrections can be made from current evidence; or
- **blocked:** needs new evidence, strategy resolution, asset approval, or application capability.

Permit one repair pass. Repeated or materially changed failures return to a person with exact
evidence; they do not trigger an open-ended refinement loop.
