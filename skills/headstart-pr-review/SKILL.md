---
name: headstart-pr-review
description: Run a complete, evidence-backed pull request review for Headstart Health by composing the generic deep review method with Headstart repository, Linear, integration, privacy, and side-effect context. Use when reviewing a Headstart GitHub PR or coordinated PR set.
compatibility: Requires the deep-pr-review and headstart-pr-review-context skills plus authenticated read access to the pull request and relevant Headstart planning sources.
metadata:
  author: headstart-health
  version: '0.1.1'
  headstart-requires: deep-pr-review,headstart-pr-review-context
---

# Headstart PR Review

Use this workflow as the normal entrypoint for reviewing Headstart pull requests. It composes two
bounded skills without replacing either one:

1. Load and follow the complete `deep-pr-review` skill as the primary review method, including its
   scope mapping, risk-based specialist passes, deterministic verification, validation ledger, and
   final review standard.
2. Load and apply `headstart-pr-review-context` to Headstart-specific intent, validation, privacy,
   integration, and side-effect questions.

Do not interpret this workflow entrypoint as a smaller alternative to `deep-pr-review`. It
coordinates the generic method and the Headstart overlay; it does not replace, summarize, or weaken
either dependency.

If either required skill is unavailable, stop before claiming a full Headstart review. Name the
missing skill and continue only if the user explicitly accepts a reduced-scope review.

## Composition Contract

- The generic skill owns and must execute scope mapping, risk-based specialist lenses,
  deterministic verification, finding validation, artifact structure, and final review format.
- The Headstart context skill owns repository guidance, Linear intent, cross-repository contracts,
  Salesforce and MCP discovery, PHI boundaries, live-data validation, and external side effects.
- The active repository's instructions remain authoritative when they are more specific.
- Tool availability never grants permission to read PHI, mutate production systems, post a review,
  or change shared planning state.

## Workflow

1. Confirm the PR, repository, base branch, head branch, and whether related Headstart PRs must be
   reviewed as one runtime contract.
2. Read the applicable repository instructions and the linked Linear issue before judging intent.
3. Run the generic scope map and choose review lenses based on the changed surfaces.
4. Add the Headstart validation ladder only where the candidate finding depends on live schema,
   configured integrations, production-shaped data, or side-effect behavior.
5. Reconcile all candidate findings in one validation ledger. Headstart-specific evidence does not
   bypass the generic confidence standard.
6. Present findings locally first. Post, approve, request changes, resolve threads, or otherwise
   write to GitHub only when the user explicitly requests that action.

## Completion Standard

A complete Headstart review states:

- which repository and Linear guidance was checked;
- which paired contracts or deployment dependencies were considered;
- which deterministic tests or runtime checks were run;
- whether any live-data or integration validation was required and authorized;
- what side-effect risks were evaluated;
- the final findings, questions, residual risk, and merge recommendation; and
- whether anything was posted remotely.
