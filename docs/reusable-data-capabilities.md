# Reusable Data Capabilities

Use this pattern when more than one engine may need the same external read without sharing business
workflow logic. It establishes a horizontal provider boundary; it is not a requirement to turn every
API call into a package.

## Layering

```text
workflow skill or managed workflow
  -> logical capability requirement
  -> private execution profile
  -> provider adapter and exact-target preflight
  -> normalized immutable source snapshot
  -> workflow-specific deterministic engine
  -> agent interpretation and human decision
```

Each layer has one owner:

- `capability-contracts` defines provider-neutral capability IDs, permission and target assertions,
  provider bindings, profile revisions, and sanitized preflight results.
- `capability-runtime` resolves a requirement against a profile and fails closed when the binding,
  permission, revision, side-effect class, target, or readiness evidence does not match.
- provider packages define bounded read request and response contracts plus provider-neutral
  interfaces and concrete provider bindings. Authentication and secrets remain in private execution
  profiles or the selected runtime.
- an engine owns calculations and invariants specific to one evidence product. It consumes
  normalized snapshots, not MCP tool output or credential details.
- a skill owns evidence selection, interpretation, exception handling, and human handoff.
- a managed workflow package is added only when independent execution is an actual requirement.

Capability declarations narrow access; they do not grant authority beyond the underlying provider
or the user's request.

## Current packages

| Package                                                                          | Reusable responsibility                                                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`capability-contracts`](../packages/capability-contracts/README.md)             | Logical capability, execution-profile, provider-binding, target, and preflight schemas                                     |
| [`capability-runtime`](../packages/capability-runtime/README.md)                 | Binding resolution and deterministic readiness verification                                                                |
| [`google-read-transport`](../packages/google-read-transport/README.md)           | Sanitized ADC resolution and read-operation-only Google HTTP transport                                                     |
| [`google-search-console`](../packages/google-search-console/README.md)           | Search Analytics validation, exact-property preflight, pagination, immutable snapshot metadata, and supervised ADC binding |
| [`google-analytics-data`](../packages/google-analytics-data/README.md)           | GA4 Data API report contract, exact-property preflight, and tabular normalization                                          |
| [`google-sheets-data`](../packages/google-sheets-data/README.md)                 | Exact read-only sheet ranges, revision evidence, and header-to-record mapping                                              |
| [`semrush-data`](../packages/semrush-data/README.md)                             | Domain and keyword read contracts independent of one MCP or API transport                                                  |
| [`organic-performance-engine`](../packages/organic-performance-engine/README.md) | Organic-specific KPI, reconciliation, route, outcome, and content-pillar/TAM analysis                                      |

Future engines should reuse a provider package only when its normalized contract fits. Do not add a
workflow-specific field to a shared adapter merely to avoid a small local transform.

## Reuse-first design review

Before creating an engine, adapter, provider, transport, utility, or contract:

1. Read the current package inventory above and the candidate packages' public exports and READMEs.
2. Separate external access and normalization from workflow-specific calculations, interpretation,
   and human decisions.
3. Reuse a package when its target, permission, request, response, completeness, and failure
   contracts fit the new consumer.
4. Extend a package only when the extension remains independently useful and does not weaken or
   special-case the existing contract.
5. Create a new shared package only for a coherent capability with credible reuse across workflows,
   engines, skills, execution contexts, or the runner.
6. Keep a small workflow-specific transform in the consuming engine instead of prematurely
   generalizing it.

Document the reuse, extend, or create decision in the implementation handoff or pull request. The
requirement is to consider and use the platform's existing architecture, not to manufacture a shared
abstraction for every possible future need.

All workflow-owned implementation remains in Agent Platform. A separate application repository is
appropriate only for independently owned application behavior such as durable state, authorization,
idempotent writes, or a user interface; expose it to workflows through a bounded capability.

## Execution profiles and provider bindings

Workflows name capabilities such as `google-search-console.performance.read` or
`semrush.domain-organic.read`. A private execution profile binds each capability to an adapter
revision and credential reference, then supplies non-secret options such as expected property,
domain, database, device, spreadsheet, or range.

Preflight must verify the actual target through a bounded read. A profile name or credential alias
is not proof of target identity. Preflight output is sanitized and may record IDs, scopes, revisions,
and failure classes, but never tokens or credential contents.

Provider substitution is allowed only when the replacement passes the same request, normalized
response, target, permission, completeness, and conformance tests. An MCP, SDK, REST adapter, or
managed identity is therefore an implementation choice rather than an engine dependency.

## Semrush boundary

Do not vendor or repackage a complete Semrush MCP into a business engine. Bind one of these options
in the execution profile:

- the official hosted Semrush MCP;
- a reviewed community MCP pinned to an immutable revision; or
- a direct Semrush API adapter.

Provision the provider before execution. A report run must not install an unpinned MCP from a moving
Git branch. Allowlist only domain overview, domain rank history, domain organic keyword, and keyword overview reads for
organic reporting; project mutation and site-audit launch tools are outside this capability.

## Content-pillar and TAM joins

Spreadsheet formulas such as `VLOOKUP` may render a presentation, but they do not own the mapping.
The deterministic contract is:

1. Read one approved spreadsheet ID and exact range with a recorded source content fingerprint.
   Keep the stakeholder approval date and scope separate from content identity.
2. Require keyword, pillar, search-volume, and serviceability columns for every retained row.
3. Normalize keyword keys with Unicode NFKC normalization, lowercasing, trimming, and whitespace
   collapse.
4. Fail when a normalized keyword occurs more than once, including duplicates assigned to the same
   pillar; source ambiguity must be resolved in the approved planning source.
5. Join every approved TAM row to the best exact-key Semrush ranking on the exact public hostname
   and to exact-query Search Console evidence.
6. Retain unmatched and unranked TAM rows in the denominator. Preserve `null` for unavailable
   comparisons and zero for measured absence.

This makes the mapping reproducible and testable while leaving pillar definitions, serviceability,
and source approval human-governed.

## Distribution and managed execution

The portable skills updater distributes `skills/` only. It does not install workspace packages.
The [organic reporting runtime guide](organic-reporting-runtime.md) supplies the supported
standalone `reporting:package` path, private profile contract, and end-to-end verification. The
runtime artifact includes the engine and its reusable provider dependencies, but not the external
Semrush MCP or credentials. Deploy reviewed revisions for team use. The skill must stop before
calculated reporting when its declared CLI dependency is absent.

A future managed workflow should pin the repository revision, engine version, provider-adapter
revisions, execution-profile revision, and immutable source snapshots. It should not copy provider
logic into its workflow package.
