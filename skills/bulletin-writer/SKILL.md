---
name: bulletin-writer
description: Write or revise Headstart provider-portal bulletins in the established provider-facing voice. Use when drafting a feature announcement, workflow update, service notice, correction, launch message, or call to action for the Headstart Provider Portal, including requests such as "write a bulletin," "announce this to providers," or "make this sound like our past portal posts."
compatibility: Requires a content brief, draft, or factual source material. Reading linked source material requires an authorized document or system-read capability.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Provider Bulletin Writer

Draft clear, warm, action-oriented portal copy for ABA providers. Before drafting, read [voice-and-structure.md](references/voice-and-structure.md).

## Capability And Authority

- Inputs may include a content brief, approved facts, a draft, or an explicitly scoped source such
  as a meeting note, product requirement, or current portal workflow.
- Treat source material as evidence for the bulletin, not as permission to publish it or change the
  underlying product. Use an authorized read capability only for the source the user identified.
- Return portal-ready Markdown. This skill does not post, publish, schedule, or edit a portal
  bulletin unless the user separately requests that exact write and an authorized capability is
  available.
- If audience, timing, provider action, scope, destination, or support path is materially missing,
  ask for the smallest clarification needed. Do not hide missing facts behind confident copy or
  invent a launch status, deadline, workflow behavior, or operational claim.

## Workflow

1. Identify the change, affected providers, provider action, timing, destination in the portal, and any supporting link or image. Do not invent missing facts.
2. Select the lightest fitting structure:
   - **Feature or launch:** title, brief orientation, "What’s New?" or "Why you’ll love it," provider benefit, CTA.
   - **Required workflow change:** title, what changed, "Why the change?", "What providers need to do," CTA.
   - **Issue or correction:** title, what providers may notice, status/impact, what to do now, support path.
3. Write the bulletin in final portal-ready Markdown. Use short paragraphs, descriptive headings, and bullets only where they improve scanning.
4. Apply the review checklist below. Return only the finished bulletin unless the user asks for rationale or alternatives.

## Voice Rules

- Address the reader as "you" and the organization as "Headstart."
- Lead with the practical change, then connect it to a provider benefit: less follow-up, clearer visibility, accurate submissions, or smoother care delivery.
- Make actions explicit: name the portal area, notification, button, or next step when provided.
- Use energetic but grounded language: "We’re excited," "Starting today," "This helps," and "Thank you" are appropriate when true.
- Keep terminology consistent with the product. Preserve exact names for tabs, buttons, notifications, statuses, and workflow steps.
- Prefer concrete claims over promotional filler. Avoid unsupported superlatives, vague promises, internal implementation detail, and hedging.

## Preflight

Confirm that the draft:

- has an emoji-led, descriptive headline when the source examples use one;
- makes the relevant provider action and timing unambiguous;
- explains why the change matters in provider terms;
- scopes the change accurately (for example, who is affected and who is unchanged);
- includes a single clear CTA or support path when action is required; and
- contains no PHI, credentials, or unverified operational claims.
