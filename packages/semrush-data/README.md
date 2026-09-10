# Semrush Data

Provider-neutral, read-only contracts for domain overview, organic keyword rankings, and keyword
overview data. The organic reporting engine depends on these normalized results rather than on a
specific MCP server or API transport.

Execution profiles may bind the official hosted Semrush MCP, a reviewed and pinned community MCP,
or a direct API adapter. Runtime installation is not part of report execution, and the allowlist
contains no Semrush project mutation or site-audit launch operation.

The concrete `SemrushMcpProvider` supports the reviewed community MCP's CSV response format. Its
stdio binding starts an already-installed absolute entrypoint only after checking its SHA-256. It
does not run `npx`, install a provider, or manage credentials. Keep the provider installation and
dependencies pinned separately; the entrypoint check is not a transitive dependency integrity
attestation. The optional read observer retains successful tool requests and complete responses.

Supported reads are domain overview, domain rank history, current domain organic keywords, and
keyword overview. Historical domain totals must match the exact requested snapshot date. This
binding does not support historical keyword-level rankings or mobile data and fails explicitly if
requested. Reaching the configured keyword limit is treated as possible truncation, not success.
Alternative providers must implement and pass the same normalized contracts; they are not bundled
into the organic engine.

See the [documentation hub](../../docs/README.md) and
[tool capability standard](../../standards/tool-capabilities.md).
