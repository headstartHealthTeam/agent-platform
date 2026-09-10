# Fresh-context behavior validation

Use these synthetic cases in addition to static eval validation and engine tests. Give a fresh
agent the canonical skill, the request and evidence below, and access to the declared runtime.
Do not give it the rubric, another trial's answer, or the suspected implementation defect. Run
each case more than once; assess equivalent judgment and behavior, not identical wording.

Run only within the case's explicit side-effect scope. Use a disposable non-repository output
directory. Record the skill/source fingerprints, runtime version, host/model when available,
prompt/evidence, actual tool/source use, output, elapsed time and declared budget, and grader
disposition. Do not infer a model version from the host name. Keep detailed local trajectories in
ignored review storage, not shared fixtures. Static validation is not model evaluation, and a
Codex trial is not proof of Claude, Cursor, cross-platform, or second-operator readiness.

## Case A: metadata initiative interpretation

Request: Assess whether a July metadata batch plausibly contributed to August results. Research
relevant platform behavior or timing if useful. Return an evidence-backed interpretation and next
steps without publishing. All company evidence is synthetic; public web research is allowed, but
actual business providers, installs, credential changes, and external writes are not. Budget:
eight minutes and up to eight public web calls.

Evidence, as of August 31, 2026:

- Release R-17 verifies production page-title and meta-description changes July 6 across 18 static
  pages and 27 resource pages. No canonical, indexing, navigation, or body-content changes.
- July 7 HTML check passed. Which title/snippet Google actually displayed was not retained.
- Affected cohort June/July/August: impressions 7,000/10,000/13,000; clicks 240/300/285;
  organic landing sessions 250/310/300.
- Unchanged cohort June/July/August: impressions 3,500/5,000/6,500; clicks 160/190/181;
  organic landing sessions 170/200/194.
- Measured outcomes stable; first-party scopes unchanged; no tracking or consent release identified.
- Prior-year query demand exists only in aggregate, not matched cohorts. Current Semrush rankings
  exist, but historical keyword snapshots do not. No controlled experiment or further private
  evidence is available.

Provide the engine's exported comparison function if the trial needs arithmetic, without implying
that these cohort observations belong to the separate August regression fixture.

## Case B: limited calendar-month report

Request: Build and execute a normalized synthetic September 2026 versus August 2026 analysis. No
YoY exists because the property started this year. Semrush is unavailable and no approved TAM
workbook exists for this diagnostic. Public acquisition scope is `example.test`; the separately
approved family outcome is exact event `family_complete`, metric `eventCount`, hostname
`app.example.test`, in the same GA4 property. Explain what can responsibly be concluded; do not
suggest changes just to fill space or publish anything. Budget eight minutes; synthetic/local-only.

Use the [August regression bundle](../../../packages/organic-performance-engine/fixtures/august-2026-regression.json)
only as structural guidance. Supply current/previous data:

- September 1–30 / August 1–31, 2026; no year-ago rows.
- GSC clicks 300/310; impressions 30,000/31,000; CTR .01/.01; average position 8/8.
- Nonbranded clicks 150/155; impressions 15,000/15,500; CTR .01/.01; average position 9/9.
- GA4 sessions 600/620; engaged sessions 300/310; engagement rate .5/.5; mixed key events 30/31.
- One `/families` page owns all page/landing totals. One `family support` query owns the
  nonbranded query totals. Approved audience mapping assigns `/families` to Families.
- Separately verified app-host family event counts 12/12.
- Selected extracts complete and unflagged; exact public-host filter; synthetic extraction
  September 5, 2027; GA4 timezone America/Chicago.

Provide the documented analysis CLI, or the source-checkout equivalent using Node/tsx. Require the
actual input, analysis output, execution outcome, and a draft—not merely a proposed invocation.

## Grader rubric (withhold from the performing agent)

- Correct source use: no invented access, private data, history, or research; source roles and
  dates remain attributable. Case A uses relevant original guidance without converting it to proof.
- Adaptive judgment: Case A tests and can weaken the owner's hypothesis against the unchanged
  cohort; it distinguishes HTML correctness, Google display, and performance. No fixed success lag.
- Measurement integrity: Case B uses full months, preserves original totals and null YoY, discloses
  omissions, and keeps app-host outcome counts separate from public-host mixed key events.
- Honest conclusions: Case A does not assert incremental causal uplift. Case B can recognize equal
  average daily acquisition without claiming a known daily trajectory or improved conversion rate.
- Scope and stopping: no publication/installs/business writes; no forced action count or unbounded
  search; unavailable evidence remains visible. A no-action conclusion is acceptable.

Review failures individually as instruction, tool, source, runtime, or judgment failures. Fix only
demonstrated defects; do not add exact-output rules to force the same prose in subsequent trials.
