---
name: design-headstart-public-website
description: Design, implement, or review public Headstart Health website pages using the approved human, photographic, editorial visual system. Use for audience landing pages, location pages, resource experiences, campaign pages, page sections, imagery, hierarchy, responsive composition, calls to action, testimonials, and visual quality checks. Do not use for internal product or admin interfaces.
compatibility: Works with agents that can inspect a design, screenshot, browser-rendered page, or frontend code and can identify the existing site design system when implementing changes.
metadata:
  author: headstart-health
  version: '1.0.0'
---

# Design Headstart Public Website

Create public Headstart pages that feel human, photographic, editorial, warm, spacious, and
confident. Make people and relationships the visual identity of the brand. Avoid turning the site
into a collection of interchangeable healthcare or software components.

Read [the approved aesthetic reference](references/approved-website-aesthetic.md) before designing,
implementing, or reviewing a page. Use it as the visual standard for this skill.

## Capability Boundary

Use this skill for the public marketing and editorial website, including:

- family, BCBA, and RBT audience pages;
- location and campaign pages;
- resource libraries, topic views, and article surfaces;
- page-level hierarchy, sections, imagery, proof, and calls to action; and
- responsive visual review of public pages.

Do not use it for admin panels, authenticated portals, clinical tools, dashboards, or other
work-focused product interfaces. Those surfaces should follow their own product design system.

This skill governs visual direction and page composition. It does not authorize new factual claims,
change business rules, select unapproved imagery, or replace accessibility and repository-specific
engineering requirements.

When a task also requires new or revised public copy, use `write-headstart-tone-and-voice` for the
writing. If that skill is unavailable, preserve supplied copy and limit this skill's work to visual
structure rather than inventing replacement language.

## Establish The Page Job

Before choosing components, identify:

1. the primary audience;
2. the question, decision, or action the page must support;
3. the one primary call to action;
4. the proof needed to make the message credible; and
5. the content objects the page actually contains.

Use these inputs to build a hierarchy. Do not begin by selecting a card grid or copying the shape of
another page.

## Compose The Page Around People

Use photography, typography, whitespace, and contrast as the primary design tools.

- Let real people and real interactions carry important moments.
- Use a full-bleed photographic hero for major audience or campaign pages when an appropriate image
  exists.
- Use 50/50 photo-and-text sections for human support, relationships, care philosophy, insurance
  help, mentorship, and who Headstart is.
- Use alternating photo-and-process rows when a process is both practical and relational.
- Use editorial testimonial treatments with a prominent quote, real attribution, and a photo when
  available.
- Vary the page's shape as the reader scrolls. A long page should not repeat one centered-heading
  and card-grid pattern.

Photography must support the claim next to it. A mentorship section should show people working
together; a family-support section should show a relevant human interaction. Decorative imagery
that does not clarify or prove the message is not a substitute.

## Choose Components By Content Type

Cards are appropriate when each item is a real distinct object, such as a job, article, provider,
location, or resource. They are not the default treatment for abstract ideas such as support,
quality, collaboration, flexibility, or guidance.

Prefer:

- open text hierarchy for abstract benefits;
- one large standalone number for a meaningful proof point;
- a logo band for insurance brands;
- an editorial quote with a photo for testimonial proof;
- detailed cards or rows for jobs and resources; and
- a photo-led or high-contrast full-width final call to action.

Use familiar site components and tokens when they fit. Introduce a new component only when the
content requires a genuinely different reusable structure.

## Keep Interactions Concrete

Calls to action must name a real action. Make the primary action visually obvious and keep secondary
actions subordinate.

Good patterns include `Get Started`, `Find a Provider`, `View Open Roles`, `Book a Fit Call`, and
`Explore Family Resources`. Avoid generic labels such as `Discover`, `Explore Solutions`, and
`Learn More` when a more specific action is available.

Controls must look interactive, provide hover and focus feedback, and retain stable dimensions.
Do not use decorative buttons or nonfunctional text that appears clickable.

## Use The Palette As Hierarchy

Keep the established Headstart palette and typography. Apply them with restraint:

- dark teal for strong full-width moments, professional sections, and final calls to action;
- white generously for clarity and breathing room;
- warm cream or off-white for stories, testimonials, and editorial relief;
- pale mint selectively for soft utility or reassuring moments, not every alternate section;
- coral for primary actions; and
- teal for links, small labels, and limited emphasis.

Typography should carry more of the hierarchy so fewer boxes are needed. Keep body text at a
readable measure, use page-scale type only for page-level messages, and keep eyebrows sparse and
nonredundant.

## Avoid The Generic Generated Pattern

Stop and reconsider when a page repeatedly uses:

- a centered headline and paragraph followed by three identical cards;
- generic line icons as the main visual identity;
- pale mint backgrounds on every other section;
- rounded containers around every idea;
- decorative gradients or blobs;
- multiple carousels where a static editorial layout would be clearer; or
- clean but emotionally empty sections that could belong to any company.

Any one pattern may be valid. Repetition without a content reason creates the generic generated
look this skill is designed to prevent. There should usually be more meaningful human photography
than decorative iconography on a major public page.

## Implement Responsively

Use stable responsive constraints rather than allowing content to determine unpredictable sizes.

- Define explicit aspect ratios and object positions for fixed-format imagery.
- Keep faces, heads, and important interactions visible at every supported viewport.
- Prevent text, buttons, controls, and navigation from overlapping or clipping.
- Preserve readable line lengths and intentional spacing as columns collapse.
- Convert grids and split layouts into a deliberate mobile sequence rather than a compressed
  desktop layout.
- Keep card heights and control placement consistent when repeated items need comparison.
- Preserve touch targets, keyboard focus, semantic headings, image alternatives, and reduced-motion
  behavior.

Do not consider a desktop screenshot sufficient evidence for a responsive page.

## Visual Verification

Before completion, inspect the rendered page rather than reasoning from code alone. At minimum,
check representative mobile, tablet, desktop, and wide-desktop viewports.

Verify:

- the hero and every meaningful image crop;
- navigation, calls to action, and interactive states;
- section rhythm, whitespace, alignment, and transitions;
- text wrapping, heading length, and readable measure;
- repeated-object consistency;
- no accidental empty cells, placeholder copy, or decorative dead space;
- no face, name, label, or control is obscured;
- focus and hover states do not shift layout; and
- the page still feels recognizably Headstart rather than like a generic template.

When reviewing rather than implementing, report objective defects first, then clearly label
judgment-based recommendations. Ground each finding in the rendered page, design requirement, or
existing system rather than taste alone.

## Completion Check

Confirm that:

- the page job and primary action are clear;
- photography supports the story instead of decorating it;
- components match the kind of content they contain;
- the page changes shape as the reader scrolls;
- cards, icons, borders, and pale backgrounds are not carrying the whole design;
- the established palette and component system remain coherent;
- supplied claims and copy have not been silently changed;
- all supported viewports have been visually inspected; and
- the result is human, useful, credible, and specific to Headstart.
