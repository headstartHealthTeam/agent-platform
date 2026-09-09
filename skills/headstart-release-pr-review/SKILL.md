---
name: headstart-release-pr-review
description: Review Headstart dev-to-main production promotion pull requests without re-reviewing every approved implementation change. Use for release PRs when the agent must verify the exact promotion delta, source-PR approval and merge evidence, release metadata, Linear completion semantics, required checks, and whether any validated finding is critical enough to block production.
compatibility: Requires the headstart-dev-to-main-pr and headstart-pr-review skills, Git, authenticated read access to the release and source pull requests, and access to relevant Headstart Linear issues when completion semantics must be verified.
metadata:
  author: headstart-health
  version: '0.1.0'
  headstart-requires: headstart-dev-to-main-pr,headstart-pr-review
---

# Headstart Release PR Review

Review a Headstart production promotion as an integration and release gate. Do not treat it as a
second full implementation review of every source pull request already approved and merged into
`dev`.

Use this skill for direct `dev` to `main` release PRs. Use `headstart-pr-review` instead for normal
feature, fix, or implementation PRs. Use `headstart-dev-to-main-pr` directly when the task is to
create, update, or inventory a release PR rather than judge whether it is ready to promote.

Load and follow `headstart-dev-to-main-pr` for the exact release-delta evidence, Included PRs,
release-body conventions, and Linear reference rules. This skill owns the review-specific risk
triage, approval decision, and distinction between release blockers and follow-up work. Keep
`headstart-pr-review` available for the bounded source-level investigations described below; do not
run it across every included source PR by default. If either dependency is unavailable, stop before
claiming a complete release review and name the missing skill.

## Authority And Side Effects

- GitHub's live base, head, diff, commits, checks, source PRs, reviews, and conversations are the
  release evidence of record.
- The target repository's current instructions and validation checks govern its release format and
  merge requirements.
- Linear is authoritative for issue state and cross-repository completion dependencies. A PR body
  is evidence of intended automation, not proof that the issue relationship or state is correct.
- Review read-only by default. Updating PR metadata, replying to or resolving conversations,
  submitting a review, approving, requesting changes, merging, or changing Linear requires the
  user's explicit authorization for that action.
- Approval does not authorize merge. Before either action, confirm the release PR still has the
  exact head SHA that was reviewed.

## Review Model

An implementation PR asks whether a proposed code change is correct. A release PR asks whether the
already-integrated `dev` state is accurately packaged, traceable, validated, and safe to promote to
production now.

Source-PR approvals establish the normal code-review baseline. Do not reopen settled implementation
scope because an automated reviewer found a maintainability improvement, a more defensive option,
or a test refinement on the aggregate release diff. Validate every finding, but block only when the
current promotion creates a concrete production-critical risk that cannot safely wait for a
follow-up.

## Workflow

### 1. Confirm The Promotion Shape

- Verify the PR base is `main` and head is `dev` unless the repository documents a different
  production promotion model.
- Confirm there is only one active PR for that exact promotion pair.
- Record the PR number, repository, current head SHA, draft state, mergeability, and enabled merge
  methods.
- Stop if this is actually an implementation PR. Switch to `headstart-pr-review` rather than forcing
  the release model onto it.

### 2. Establish The Exact Release Delta

Use the complete evidence process in `headstart-dev-to-main-pr` to compare `origin/main` with
`origin/dev` and reconcile that with the live GitHub PR diff. The net tree diff is the source of
truth for what production will receive.

Produce an inventory that maps every changed file and patch-unique commit to an included source PR
or identifies it as unattributed. Exclude patch-equivalent work already live on `main`, even when it
still appears in noisy branch ancestry.

Do not approve when material changed files or commits remain unexplained.

### 3. Verify Source PR Evidence

For each source PR represented in the net release delta:

- confirm it merged into `dev`;
- confirm its final implementation review state and required checks were acceptable when merged;
- identify any documented production dependency, migration order, configuration step, feature gate,
  or coordinated repository release;
- confirm later commits did not materially alter its behavior without review; and
- distinguish an already-accepted source finding from new evidence that the combined release is
  unsafe.

Do not rerun the complete implementation-review workflow for every source PR by default. Load
`headstart-pr-review` for a bounded source-level investigation only when a plausible release blocker
requires deeper validation or when the source PR lacks reliable review evidence.

### 4. Validate Release Metadata And Linear Semantics

Compare the current title and body with the release evidence. Verify:

- the title identifies a production promotion and uses the repository's current convention;
- `Release Notes` summarize the actual user-facing or operational changes;
- Included PRs and commit inventory explain the complete net delta;
- risk, testing, rollout, migration, configuration, and coordinated-release notes are accurate;
- every included Linear issue appears exactly once with supported syntax; and
- `Fixes` versus explained `Refs` matches the real cross-repository production dependency order.

Treat inaccurate packaging, unsupported lifecycle language, missing source PRs, and an incorrect
Linear issue set as release defects. When authorized, correct metadata directly and rerun its
validator; do not create a code change merely to repair release bookkeeping.

### 5. Triage Checks And Automated Feedback

Inspect every required check and every unresolved human or automated review thread. Validate each
substantive claim against the actual release delta, source PR history, tests, and runtime contract.
Classify it as one of:

1. **Release blocker:** concrete evidence makes this production promotion unsafe now.
2. **Required release correction:** scope, metadata, Linear semantics, CI, or release instructions
   are wrong or incomplete, but implementation code need not change.
3. **Follow-up improvement:** valid hardening, maintainability, test-quality, observability, or
   performance work that can safely land after this release.
4. **Not applicable or unsupported:** the claim does not hold for the current code, configuration,
   delta, or production path.

Do not edit implementation code inside the `dev` to `main` PR to satisfy an automated comment. Do
not request changes solely because a bot proposes a cleaner implementation. Give every unresolved
thread an explicit evidence-backed disposition when repository policy requires conversations to be
resolved before merge.

### 6. Apply The Production-Critical Gate

A finding blocks the release only when evidence shows material risk such as:

- data loss, corruption, integrity failure, or an unsafe irreversible migration;
- authentication, authorization, privacy, PHI, secret, or security exposure;
- deployment, startup, routing, or runtime failure on a required production path;
- an incompatible contract between repositories that will be live together;
- an unguarded consequential external side effect, duplicate operation, or broken idempotency; or
- another defect with high user or operational impact and no safe containment, rollback, or staged
  release path.

The following are normally follow-up work unless repository-specific evidence raises their actual
impact:

- readability, naming, refactoring, duplication, or maintainability improvements;
- more specific tests when existing evidence covers the release-critical contract;
- optional defensive handling for a fail-closed or otherwise contained path;
- theoretical configuration hardening when deployed configuration has been verified;
- non-critical observability or performance improvements; and
- behavior changes already reviewed and intentionally accepted in a source PR.

Severity labels from an automated tool are inputs, not the decision. Base the gate on demonstrated
production consequence, likelihood, containment, and reversibility.

### 7. Route Corrections Correctly

- For a release blocker in implementation code, require a separate implementation PR targeting
  `dev`, review it under `headstart-pr-review`, merge it, and then refresh this release PR.
- Never use the release PR to patch `dev` or create a hidden release-only code variant.
- For a release metadata or Linear defect, correct the release or source PR metadata when authorized
  and rerun the relevant check.
- For follow-up work, identify the owner and tracking location when available. Do not claim it was
  filed unless the external write occurred.
- For unsupported findings, preserve the concise validation evidence needed to close or respond to
  the thread.

### 8. Run The Final Same-Head Gate

Immediately before recommending or submitting approval:

- refetch or reread the live PR and confirm the head SHA has not changed;
- confirm the exact release delta is still fully attributed;
- confirm required source PRs remain merged and no new unreviewed source change entered `dev`;
- confirm required checks pass;
- confirm release metadata and Linear validation pass;
- confirm conversations have the dispositions required by repository policy; and
- confirm no validated release blocker remains.

If the head changed, invalidate the prior approval decision and recheck the incremental delta before
acting.

## Decision Standard

Recommend or submit **Approve** when the exact promotion is traceable, required checks and metadata
are correct, source changes have adequate review evidence, and no production-critical blocker
remains.

Recommend or submit **Request changes** only for a validated production-critical blocker or a
required release correction that cannot be completed without the author. State the shortest safe
path: metadata correction, configuration/release prerequisite, or a separate implementation PR into
`dev` followed by a refreshed release.

Use **Comment** when the release can proceed but reviewers need a recorded follow-up, clarification,
or operational note.

## Completion Output

Report:

- repository, release PR, base, head, and reviewed head SHA;
- exact net delta and included source PRs;
- source-review and required-check status;
- release metadata and Linear classification result;
- automated and human feedback dispositions;
- blockers, required corrections, follow-ups, and residual production risk;
- approve, request-changes, or comment recommendation; and
- every remote write actually performed.

Never claim that a release was approved, merged, a thread was resolved, or follow-up work was filed
unless the corresponding system confirms that write.
