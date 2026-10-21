# Content Engine Quality Rubric

## Verification Order

Run objective contract and evidence checks before qualitative review. A polished draft fails when
its artifact contract, evidence, or safety boundary fails.

## Deterministic Or Direct Checks

Confirm:

- all required artifact fields and identifiers are present;
- opportunity, packet, and draft versions agree;
- every material claim maps to an existing packet claim ID;
- required URLs and internal-link targets are syntactically valid and have a recorded live,
  planned, unavailable, or failed-validation state;
- title tag, meta description, canonical route, visible H1, semantic H2/H3 outline, slug, taxonomy,
  CTA, outbound links, inbound opportunities, image, alt-text, and reviewer states are explicit;
- every proposed link records target or source, page job, anchor, placement, reader rationale, and
  validation result;
- every reader-facing hyperlink in a private review artifact remains natively clickable and is
  visually distinguishable from surrounding text without relying on color alone;
- alt text was written from the exact inspected asset or an empty-alt decision is justified;
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

- answers the approved reader need in a useful order and makes the topic's practical relevance clear
  near the beginning;
- gives the reader a practical decision, framework, example, checklist, or next step;
- makes the proposed action usable through a relevant explanation, example, or question rather than
  merely telling the reader to prepare, understand, or review;
- organizes questions and actions around the stage when the reader can use them instead of mixing
  unrelated phases;
- earns its structure: no competing numbering, unexplained extra steps, or forced framework; main
  guidance and supporting topics have appropriate depth without losing required coverage;
- translates unfamiliar or clinical concepts into concrete reader questions, routines, or examples
  and defines terms before relying on shorthand;
- delivers the packet's information-gain thesis;
- avoids generic summary sections that could be relabeled for any ABA company; and
- earns its proposed existence rather than duplicating current Headstart coverage.

## Search Quality

Confirm that:

- the primary query reflects the page job and appears naturally where useful;
- supporting concepts are covered without keyword stacking;
- separate-intent and excluded terms have not been forced into the page;
- the title tag is unique, descriptive, concise, non-boilerplate, and not keyword-stuffed;
- the meta description is a page-specific, accurate summary rather than a keyword list, with no
  promise that Google will use it verbatim;
- metadata, visible title, H1, heading hierarchy, and slug each serve their appropriate role;
- headings describe reader-useful sections and reflect document relationships rather than an
  exact-match keyword checklist;
- outbound internal links help the reader and fit the destination's intent;
- at least one defensible inbound opportunity helps prevent the proposed Resource from becoming
  orphaned, or the lack of an eligible source is explicitly unresolved;
- anchors are concise, descriptive, natural in context, and not generic or keyword-stuffed; and
- length and heading count follow content need rather than competitor averages.

## Headstart Voice And Role Clarity

Apply `write-headstart-tone-and-voice`. The draft should be human, clear, grounded, useful, and
respectful for the named audience. It must identify actors correctly, avoid institutional or
internal API language, preserve agency, and avoid hype or guarantees. Confirm that material
qualifiers remain intact without recurring as defensive filler, responsible actors are named
without legalistic repetition, contractions sound natural for the audience, and adjacent
paragraphs do not repeat one uniform setup-qualification-takeaway cadence. For family content,
confirm that care delivery, clinical oversight, and caregiver participation are distinct and that
positive explanation replaces lecture-like obligations. Direct, concrete actions can empower a
family; do not penalize `ask` or `compare` simply because the action is optional. Check whether
`you can` preserves a real choice or makes useful guidance evasive. The opening should orient the
family to the topic without assumed distress, formulaic reassurance, or procedural slogans.
Evaluate that opening as a paragraph: respectful facts about a child do not by themselves establish
warmth, and one overloaded sentence can make a useful introduction hard to follow. Apply the tone
skill's family-guidance examples without requiring their wording, a question hook, or a sentence
length quota. For a revision limited to the opening, assess its transition into the next unchanged
section without broadening the rewrite.

Assess the complete reader experience, not punctuation or phrase counts. The presence of a
checklist, a reassuring sentence, or an internal link is not proof of usefulness. Cite the exact
passage and reader consequence for qualitative findings. A factually careful draft can still fail
this gate when it reads like a risk-managed summary rather than a thoughtful person helping the
reader. Clinical and coverage claims still pass through the evidence gate; confident voice does
not establish their truth.

## Family Comprehension Check

For family content, evaluate the exact article as an adult reader with no prior clinical or
insurance knowledge. Apply the tone skill's approximate fourth-grade accessibility aim without
reducing this gate to a numerical threshold. Necessary terminology, connected prose, and material
qualifications must survive. A low score can still accompany unusable guidance.

Check the main answer, representative difficult explanations, and next action in their full
paragraph or section context:

- What can the reader now understand or decide? Explain that takeaway in ordinary language and
  trace it to the text. If doing so requires knowledge absent from the article, identify the gap.
- Are important terms explained before use and connected to a practical consequence, question,
  or example? Do not pass a glossary that leaves the reader unable to interpret a bill or act.
- Does a question name its subject and responsible actor without relying on a distant heading or
  ambiguous words such as `amounts`, `capacity`, or `the answer`?
- Does the article explain before assigning tasks, and does each useful link serve the family
  rather than merely prove the writer researched the topic?
- Do simplification and examples preserve evidence, payer scope, arithmetic, and role boundaries?

Record exact passages and reader consequences for both strengths and defects. Use human-reviewed
failure cases to calibrate judgment, not to require their wording or structure. Do not let an
earlier verifier pass, confident prose, a reading score, or artifact completeness override a
current comprehension failure. A material voice or usefulness defect requires `repair`, or
`blocked` when new evidence is needed; it is not a harmless human-review item. Keep the existing
one-repair boundary. Do not claim that model verification replaces the human editorial decision.

If a readability tool is available, record its name/version, text scope, score, and limitations as
diagnostic evidence. If none is used, say `not_checked`; do not estimate a grade or claim the
fourth-grade aim was numerically achieved. The passage-level comprehension judgment still applies.

## Visual And Accessibility Guidance

Apply `design-headstart-public-website` to the image brief, exact candidate when one exists, and
visible Resource presentation. Check that the candidate is relevant and representative, uses an
authorized asset class, is high quality, avoids baked-in text and extreme aspect ratios, preserves
faces, hands, and interactions, and anticipates responsive crops. Confirm a descriptive filename
and context-appropriate alt decision after inspecting the asset. An asset idea is not a candidate,
and a candidate is not an approved publication asset.

For an explicitly requested full review artifact, a brief-only image state cannot pass as complete.
It remains `human_review` or `blocked` until a candidate is embedded or the reviewer explicitly
accepts a no-image direction.

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
