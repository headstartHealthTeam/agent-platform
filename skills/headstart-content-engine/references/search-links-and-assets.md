# Search, Links, Headings, And Image Guidance

## Authority And Freshness

This reference operationalizes current public guidance reviewed on 2026-08-31:

- [Google link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable),
  including crawlable anchors, contextual anchor text, internal linking, and the absence of a magic
  link count;
- [Google title-link guidance](https://developers.google.com/search/docs/appearance/title-link),
  including unique, descriptive, concise, non-boilerplate title text and a clearly prominent main
  page title;
- [Google snippet guidance](https://developers.google.com/search/docs/appearance/snippet), including
  accurate page-specific meta descriptions and Google's authority to select different snippet text;
- [Google image SEO guidance](https://developers.google.com/search/docs/appearance/google-images),
  including representative high-quality images, standard image elements, nearby relevant text,
  descriptive filenames, and contextual alt text without keyword stuffing;
- [W3C image-alt decision guidance](https://www.w3.org/WAI/tutorials/images/decision-tree/); and
- [W3C heading guidance](https://www.w3.org/WAI/tutorials/page-structure/headings/).

The Content Engine maintainers own this operational interpretation. Recheck the authoritative live
guidance before changing these rules, after a material Google or W3C update, or at least annually
while the workflow is active. If this reference is stale, use the live authoritative guidance and
record the discrepancy; do not silently invent replacement policy.

## Search And Heading Package

Every draft bundle and reviewer artifact must plainly expose:

1. `titleTag`: the proposed HTML `<title>`, unique and descriptive for this Resource. Keep it concise
   for readers, avoid repeated boilerplate and keyword stuffing, and treat character count as a
   diagnostic rather than a Google-enforced limit.
2. `metaDescription`: an accurate, page-specific summary written to help a searcher understand the
   value of the page. Do not write a keyword list or promise that Google will display it verbatim.
3. `visibleH1`: one clear main content heading under the Headstart Resource contract. It may differ
   from the title tag when the search-result and on-page reader jobs differ.
4. `headingOutline`: every proposed H2/H3 in order, with its level and reader purpose. Use semantic
   levels to express relationships, not to force exact-match queries or satisfy a heading quota.
5. `canonicalRoute`: the one proposed stable route for the Resource.

The finished body must use the marked hierarchy. A bold paragraph is not a substitute for a
heading, and a reviewer should not need to infer which text becomes the H1, H2, or H3.

## Internal-Link Architecture

Treat internal links as part of the page's reader journey and site architecture, not as a list of
URLs appended after drafting.

### Outbound links from the Resource

For each useful destination, record:

- exact canonical route or URL;
- destination title and page job;
- concise, descriptive anchor text;
- source section and sentence-level placement;
- why the destination helps the reader at that point;
- whether the destination is live, planned, redirected, unavailable, or unknown; and
- validation method and time, or an explicit `not_checked` state.

Insert approved links naturally into the body. The later implementation must use a real crawlable
`<a href>` link. Avoid generic anchors such as “click here,” forced exact-match anchors, adjacent
link chains, links to irrelevant pages, and needless redirect hops. Ordinary editorial internal
links do not need `nofollow`.

### Inbound links to the proposed Resource

Identify current or planned Headstart pages that should point to the new Resource. For each source,
record the source route and page job, insertion context, proposed anchor, reader rationale, source
state, and validation result. Every important Resource should have at least one defensible inbound
path. If no eligible source exists, record that as an unresolved architecture item rather than
inventing a link.

There is no fixed target count. Include each link only when it makes the next page easier for the
reader to discover or understand.

## Image Candidate And Alt Text

Every Resource has an explicit image state. A scene brief alone is not an actual candidate.

1. Define the image's purpose, intended placement, subject, action, emotional tone, exclusions,
   aspect needs, and responsive focal points.
2. Confirm whether selecting or generating a candidate is authorized. When authorized and the
   capability exists, create or select the candidate and record its provenance, timestamp,
   dimensions, filename proposal, and non-sensitive prompt or selection rationale.
3. Inspect the exact asset. Check relevance, realism, inclusivity, visible text or logos, image
   quality, faces, hands, body crops, interaction, mobile and desktop crop safety, and any accidental
   clinical or outcome implication. Permit one bounded correction for an objective defect.
4. Decide the text alternative from the inspected asset and its page function:
   - informative photograph or simple graphic: concise description of the meaning conveyed here;
   - linked or functional image without adequate adjacent link text: describe the destination or
     action;
   - decorative or redundant image: use an empty alt value and record why; or
   - complex image: provide the information in nearby page text and a concise alt value.
5. Avoid “image of” phrasing, keyword stuffing, facts that are not visibly present, and treating alt
   text as an SEO keyword field. Use a short descriptive filename rather than a generic asset name.
6. If a private reviewer artifact is authorized, embed the exact candidate and display its asset
   state, filename, intended placement, provenance, and alt decision next to it.

Generated or selected candidates still require the application's normal human image approval and
publication controls. Candidate creation does not establish rights for an external asset and does
not authorize CMS upload or publication.
