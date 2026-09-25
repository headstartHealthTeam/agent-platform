# Headstart MCP document access

An agent-runtime client for the existing Headstart MCP original-file tool. It downloads an exact
Salesforce file into the agent's filesystem; it is not a second Salesforce connector, parser,
backend service or workflow engine. See the [documentation map](../../docs/README.md) and
[data capability boundaries](../../docs/reusable-data-capabilities.md).

The native MCP tools still handle schema/record/file discovery. After selecting exact record,
document and version IDs, use `downloadMcpOriginal(client, selection, directory)` with an existing
authenticated MCP client, or the CLI below. The backend enforces source authorization and exact
version access. This client checks the returned identity/digest/length and saves every original
byte, including unsupported formats. A summary, partial selection or metadata-only response fails
explicitly. Nothing here calls a model or writes to Salesforce.

## Runtime setup

Install the reviewed Agent Platform revision and its pinned dependencies in the agent environment;
build this package and `document-reading`. A new server or local executor is not required. Run the
same Node entrypoints in a local checkout or an OpenAI-hosted environment.

Provision a private connection profile and the **existing run's MCP authorization** before launch.
The profile contains `serverUrl` (the same verified MCP audience) and `authorizationEnv` (the name
of the environment variable containing its Authorization header). The CLI uses the official MCP
SDK over HTTP and refuses redirects. Do not put the token in arguments, source, logs or prompts.
This is a runtime binding, not authority to find personal credentials, mint another grant, or
expand the server's permissions. The agent gets the command/profile path, not a token to copy.

An example non-secret profile:

```json
{
  "serverUrl": "https://backend.example.com/mcp",
  "authorizationEnv": "HEADSTART_MCP_AUTHORIZATION"
}
```

The agent supplies a request JSON with `recordIdOrUrl`, optional Salesforce `object`,
`contentDocumentId`, and `contentVersionId`. These are exact IDs from MCP discovery, not URLs or
guessed case selectors. Then invoke the provisioned entrypoint:

```text
node <runtime>/packages/headstart-mcp-data/dist/cli.js --profile <private-profile.json> --request <selection.json> --output <fresh-evidence-directory>
```

Use absolute paths for profile, request and output. The CLI prints one JSON object,
`{"resultFile":"<absolute-receipt-path>"}`. Parse `resultFile`, then open that receipt and the
saved original. Use the runtime's existing file viewers or
[`headstart-document`](../document-reading/README.md#local-file-inspection) for full text and page
images. No model is asked to transcribe base64. The output directory must be fresh to preserve
earlier evidence. Local files are working evidence, not backend-retained reviewer artifacts.

## Acceptance boundary

Synthetic tests exercise the real MCP SDK over authenticated localhost HTTP, exact byte delivery,
late content, invalid/missing originals and non-overwrite behavior. They do not prove a particular
hosted environment has these tools or this credential binding installed. The current native
service-origin MCP binding **does not automatically populate this CLI's environment variable**.
Complete that runtime provisioning with the same run grant and verify a full document through the
actual agent before claiming connected full-evidence acceptance. Do not reintroduce backend
parsing or substitute a summary to avoid completing the handoff.

Run the standard package build, types, lint and coverage tests, then repository `pnpm qa`.
