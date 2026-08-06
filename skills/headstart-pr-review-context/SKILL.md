---
name: headstart-pr-review-context
description: Headstart Health-specific PR review context for backend, frontend, admin panel, HEA/SAL Linear work, Salesforce-backed features, Headstart MCP tools, local prod-data DB sync, AWS Secrets Manager configuration, Candid, Aloha, AppConfig, and operational smoke validation. Use with deep PR reviews in Headstart repos when reviewing GitHub PRs, Linear-linked work, paired backend/frontend changes, or any change where production data shape, third-party side effects, or local runtime validation matters.
compatibility: Requires access to the relevant Headstart repository and, for live validation, only the authenticated systems explicitly authorized for the reviewer.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart PR Review Context

Use this skill through the `headstart-pr-review` workflow as the Headstart-specific layer on top
of a generic PR review. Keep comments evidence-backed, friendly, and scoped to behavior that
affects users, operators, data integrity, privacy, or future maintainability.

## Required Context

- Read the repo `AGENTS.md` and relevant README/runbook docs before judging expected behavior.
- Follow the active repository and organization policy before accessing PHI, production records,
  secrets, or mutation-capable systems. Tool availability is not authorization.
- For `HEA-*` and `SAL-*` work, read the Linear issue, Linear comments, attached PR/review links, PR bodies, top-level PR comments, and inline review comments before deciding product intent.
- Treat Linear `/review/...` links as PR review mirrors unless the tool exposes separate issue content.
- For stacked backend/frontend/admin changes, review the runtime contract as a pair: backend source data, response shape, frontend state/control value, submitted payload, and downstream storage.
- Check whether prior AI review comments already flagged an issue. Do not assume they did; verify PR comments and inline review threads.

## Repository Guidance Comparison

- Treat the repository's applicable instructions as the source of truth. Read the relevant `AGENTS.md` hierarchy, changed-surface documentation and runbooks, and nearby implementation patterns. When the PR branch, base, and current target differ, inspect the guidance at the relevant revisions instead of relying on a stale checkout.
- Determine which guidance is triggered by the changed surfaces, then compare it with the actual implementation. Do not apply every repository rule as a blanket checklist.
- Look for Headstart-specific boundaries where relevant, including module versus shared ownership, established integration and data-access patterns, validation and test lanes, persistence and schema lifecycle, external side effects, privacy and access controls, and cross-repository contracts or deployment order.
- When a PR adds a helper or repeats behavior, search existing public shared utilities and module-local implementations. Suggest shared placement only when there is a concrete cross-module consumer or material duplication risk; keep domain-specific behavior with its owning module and avoid speculative extraction.
- Ground a convention finding in the instruction or established pattern it departs from and explain the resulting correctness, safety, contract, or maintenance impact. If the guidance is absent, contradictory, or still emerging, frame that as a question or documentation gap rather than a violation.
- Prefer discovering current guidance from the repository over restating mutable implementation rules in this skill.

## Validation Ladder

Use the lightest validation that proves or disproves the finding, then escalate when the behavior depends on live Headstart data.

1. Inspect final changed files and surrounding code.
2. Run focused unit/component tests from the local checkout.
3. Use Headstart MCP or Salesforce Hosted MCP for read-only schema and data-shape validation when Salesforce object names, field names, relationship fields, or representative records matter.
4. When practical and safe, validate through the actual local runtime: synced local Docker Postgres, repo `.env`, AWS SSO, Secrets Manager-backed credentials, and the real endpoint/UI path.
5. Record which path proved the finding: mocked test, MCP/read-only data check, local runtime, or deployed smoke.

MCP and direct Salesforce reads are strong evidence for data shape. Local runtime checks are stronger when the finding depends on Nest module initialization, `.env`, Secrets Manager, endpoint routing, DTOs, frontend consumption, or local DB state.

## Salesforce And MCP

- Prefer hosted/read-only MCP tools for Salesforce discovery before guessing object names, field API names, relationships, filter values, or sample row shape.
- For backend Salesforce endpoint reviews, compare the intended source object from Linear with the final implemented source object. A source change is not a bug by itself if PR history or comments show it was intentional.
- Validate the exact effective filter shape when possible. Include record type, status, state/code fields, null fallbacks, and ordering/pagination in the check.
- Distinguish full-name state fields from state-code fields. For example, check whether a route accepts `state=GA` but filters a full-name `BillingState` field.
- Do not print access tokens, refresh tokens, OAuth codes, raw file bytes, raw download URLs, or secrets from caches.

## Local Runtime Pattern

When a Headstart backend finding depends on live data or configured credentials, prefer reproducing through the local app if setup is available:

- Confirm the repo is on the PR branch and the working tree state is safe.
- Refresh AWS SSO with `aws sso login --profile headstart-root` when Secrets Manager access is needed.
- Confirm the local Postgres container is running, commonly `local-headstart`.
- Start the backend only when the user has asked for runtime validation.
- Hit the smallest read-only endpoint that proves the behavior.
- Stop dev servers after validation unless the user wants them left running.

Do not copy secrets into temp clones. Prefer checking out the PR in the real local repo or using a worktree with deliberate env handling.

## Third-Party Side Effects

- Candid, Aloha, Stripe, Inbox, Twilio, SES/email, AppConfig, and Salesforce mutations need explicit side-effect review.
- For Aloha-to-Candid work, never run a full/default sync while reviewing unless the user explicitly authorizes it and the code path is proven safe. Prefer documented smoke or dry-run modes.
- For Candid/Aloha smoke paths, verify the code skips writes before running it. Check whether a smoke path still reads live external systems.
- For email/SMS paths, confirm non-production suppression or redirection behavior before runtime testing.
- For AppConfig, distinguish read/verify actions from publishing or deploying configuration.

## Review Comment Framing

- Phrase product-intent ambiguity as a question only when code/data evidence cannot settle it.
- When Linear says to preserve an existing payload shape, suggest fixes that preserve that contract unless a contract change is explicitly needed.
- Prefer comments like: "I think we need to handle this edge case because..." over broad rewrites or style preferences.
- Call out when a finding is a current paired-flow blocker versus a public API contract risk.
- Mention live-data validation only at a useful level; do not paste PHI or sensitive records into review comments.
- Use `REQUEST_CHANGES` only for findings that can produce wrong user/operator behavior, unsafe writes, privacy exposure, or materially brittle contracts.

## Artifact Notes

For non-trivial Headstart reviews, add an artifact section for:

- Linear and PR intent checked.
- Applicable repository guidance and nearby patterns compared with the implementation.
- MCP/read-only data checks run.
- Local runtime checks run or skipped with reason.
- Side-effect risk assessment.
- Existing AI review findings considered.
- Final posted-review status, if comments are eventually submitted.
