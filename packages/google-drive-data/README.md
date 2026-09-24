# Google Drive Data

Reusable Drive discovery and full-evidence reads for any workflow. This is not a credentialing
engine, backend module or MCP server. It follows the existing
[provider-package pattern](../../docs/reusable-data-capabilities.md); see the
[documentation map](../../docs/README.md).

## Boundaries

- `GoogleDriveReadPort` is the narrow provider interface. `GoogleDriveRestProvider` implements it
  with the existing [Google read transport](../google-read-transport/README.md).
- `GoogleDriveReader` owns Drive identity checking, metadata, paginated search, version consistency,
  original downloads and explicitly labeled Google-native representations.
- [Document Reading](../document-reading/README.md) owns source-independent text, page and original
  views. The reader does not infer credentialing facts, reconcile contradictions or summarize.
- `headstart-drive-read` composes these packages for the agent runtime. It uses the same package
  locally and in a provisioned managed executor, with explicit environment credentials.
- Backend retains case/run authority, human controls, packages and durable reviewer evidence.
  Existing Salesforce/documents are still read using Headstart MCP; Drive is not added to that MCP.

No workflow or backend imports are present. The reporting engine and Drive tools share Google
authentication/HTTP mechanics, not business policy. The Sheets range adapter remains useful for
bounded reporting reads; it is not a replacement for complete Drive workbook evidence.

## Reading evidence

`verifyIdentity(expectedEmail)` checks the actual Google identity. `list({query?, driveId?,
pageToken?})` returns `nextPageToken` and `incompleteSearch`. Follow all pages; incomplete all-drive
search requires narrower drive/folder discovery and is not proof of absence. There is no
credentialing-folder or case-record filter. Google permissions determine visibility.

`metadata(fileId, resourceKey?)` discovers the current source version. `read({fileId, version,
mode, page?, offset?, resourceKey?, exportMimeType?})` requires that observed version.
The reader rechecks metadata after retrieval and validates original MD5 checksums when supplied.
Drive's `version` is a change counter, not a revision-download ID; this does not implement historic
revision selection. Follow shortcut targets using their own IDs, versions and resource keys.

For Google Docs, `mode: "text"` without an export returns a paginated view plus a complete JSON
file resource from the same Docs structure bytes, including all tabs/child tabs and inline
suggestions. The runtime writes `evidence-0.json` with the matching digest and byte length,
independently of the text offset. Retain that file rather than reconstructing JSON from text
chunks. It is labeled `google-docs-structure`, not an original binary or Google export.
Follow `nextOffset` until null when reading the text view; embedded
image references in the structure are not automatically downloaded images. Request an explicit
PDF export for page inspection. A native file has no original binary: its exported MIME type must
be explicitly selected and its receipt says `google-export`, never original. Spreadsheet exports
can omit features; use XLSX for all-sheet evidence and inspect originals when formatting matters.

Binary files retain their native format, with text/page/original views as supported by the
document package. No secondary model, preview-only output, PDF-only admission rule, silent
truncation or business-field redaction is introduced. Google download/export limits and parser
limitations remain operational failures to investigate, not evidence that a fact is absent.

## Runtime entrypoint

Build with Node 22 and pinned pnpm:

```sh
corepack pnpm --filter @headstart-health/google-drive-data... build
corepack pnpm drive:package --target /absolute/existing-parent/drive-runtime
```

The target must not exist and must be outside the checkout. This reuses reporting's standalone
`pnpm deploy --prod` packaging, verified internal dependency links and provenance receipt.
It contains built runtime code and production dependencies, not credentials or source evidence.
Skill updates do **not** install this runtime.
Build the artifact on the target executor OS/architecture: PDF rendering includes native
dependencies. The receipt records Node, OS and architecture. Reuse the same source and package
contract across environments; do not copy macOS native dependencies into a Linux executor.

A trusted runtime profile is separate from the artifact:

```json
{
  "expectedIdentity": "agent@example.com",
  "authentication": {
    "kind": "credential-file",
    "path": "/run/secrets/google-credentials.json"
  }
}
```

The file is an explicitly provisioned Google-auth-library credential; the environment owns its
secret storage/mount and Google sharing. Use the approved organization identity, not an unrelated
SEO, Candid or advertising account. The library handles access-token refresh. No AWS client,
implicit ADC fallback, employee OAuth prompt per run or secret in workflow instructions is added.
An explicitly selected `{"kind":"operator-adc"}` is supported for approved supervised desktop use,
not a managed default. It follows the existing organization's ADC recovery procedure.

The agent writes a request file, then invokes the same CLI:

```sh
node /absolute/existing-parent/drive-runtime/dist/cli.js \
  --profile /private/runtime/drive-profile.json \
  --request /private/work/request.json \
  --output /private/work/new-evidence-directory
```

Requests are one of:

```text
{"action":"list","input":{"query":"'folder_id' in parents"}}
{"action":"metadata","fileId":"file_id"}
{"action":"read","input":{"fileId":"file_id","version":"5","mode":"text","offset":0}}
{"action":"read","input":{"fileId":"file_id","version":"5","mode":"original"}}
```

Use one JSON object per request file. Output is a new private directory containing `result.json`
and actual image/original/Docs-structure files, not just base64 on stdout. The CLI prints the result-file path;
the primary agent must open it, follow text continuations and inspect appropriate image/original
artifacts. The output directory is runtime evidence, **not** a backend retention receipt.
Reuse discovered versions and keep source/representation/byte-digest provenance with artifacts.

## Integration status and acceptance

The selected credentialing integration uses OpenAI-hosted environment setup for this runtime,
even while backend/admin run locally. Supply the reviewed artifact and dependencies through supported files/packages/setup
configuration; do not expand the local Docker executor merely to install this tool. The private
Google binding must match an authentication mode the reader actually supports. Hosted secret
delivery and native dependencies still need verification; this is the selected path, not readiness.

The package and CLI are implemented and tested with synthetic source responses and real format
fixtures. No Google runtime identity is activated by installing or building them. The credentialing
executor still needs this artifact installed/mounted, an approved Google profile, and tool
availability in its runtime instructions. Neither an unrelated desktop connector nor adding names
to Headstart's MCP tool list provides that binding.

Headstart MCP's per-run grants govern MCP calls, not this direct Google credential. Managed
composition must protect the Google secret and terminate runtime work when Stop ends the executor.
Connected verification must establish that behavior; this package does not claim per-run Google
credential revocation or retract already delivered evidence.

Credentialing's named capture function remains Salesforce-specific. Drive originals/exports and
runtime-derived files use the source-neutral [evidence manifest](../workflow-contracts/src/evidence.ts)
alongside their actual bytes at the application's trusted retention boundary. An original names
the discovered file/version; a Google export additionally names its source and exported media
types. Complete Docs JSON uses `google-docs-structure` and retained media type `application/json`,
not a mislabeled PDF export. A derived file names exact retained parents and the transformation. Each materialized file
has its own digest, including rendered pages. Runtime-reported provenance is not independent
source verification or proof of retention. Hosted artifact delivery must still bind files to the
actual session/turn and await the application's receipt; never fabricate one from a local path.
Do not make backend retrieve Drive or parse the document again. Normal backend/admin/Agents API acceptance must verify the primary agent's actual file
access, saved review evidence and stop/recovery behavior; isolated package tests do not prove that
connected workflow.

Run standard package checks plus root `corepack pnpm qa`. Existing reporting provider and
packaging regressions guard shared infrastructure compatibility.
