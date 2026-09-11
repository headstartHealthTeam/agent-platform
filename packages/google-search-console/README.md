# Google Search Console

Reusable, read-only Search Console request validation, property preflight, pagination, response
normalization, and snapshot provenance. Authentication is injected through an access-token
provider; the included `gcloud` Application Default Credentials binding is for supervised local
execution, while managed runners can supply another binding without changing reporting logic.

The package deliberately exposes no sitemap submission or other write operation. See the
[documentation hub](../../docs/README.md) and
[tool capability standard](../../standards/tool-capabilities.md).

Search Analytics pagination exhausts the declared API query up to its configured row limit. Google
returns top rows and does not guarantee that every query is exposed, so a completed snapshot means
the extraction contract finished successfully; it does not claim an exhaustive census of all
search activity.

Each request respects both its selected `rowLimit` and the remaining `maxRows` budget. Oversized
provider pages fail rather than being appended or silently trimmed. A failed property preflight
returns `provider-unavailable` with a fixed diagnostic; without a typed authentication diagnosis,
network, quota, or malformed-response failures are not reported as confirmed login failures.
