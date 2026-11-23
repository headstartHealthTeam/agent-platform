# Browser runtime

Reusable browser-provider transport, independent of payer, workflow, model and application UI.
It supplies **watch-only Live URLs, initial private control, synthetic sessions and private portal-login sessions**. A normal application
can expose its authorized browser through the standard function-tool definition without moving
the primary agent to another reasoning service. This is not acceptance of a live payer workflow.

## Ownership and reuse decision

The existing `openai-platform` package owns OpenAI SDK contracts, not another provider's browser
account. `headstart-mcp-data` and the data-provider packages intentionally expose read-only source
access. Widening those into browser-control authority would mix unrelated permission boundaries.
This separate package owns independently reusable browser transport. The owning application retains
business authorization, exact attempt/package/file bindings, durable receipts, dispatch journals,
exclusive controller ownership, Stop, and authentication. The native computer path delegates a
bounded browser task to `openai-platform`'s Responses computer loop. It uses the same configured
model and the existing application browser; it does not create a second hosted desktop or move
case ownership into the model.

## Documented viewer boundary

`BrowserlessViewerClient` follows the provider's
[REST Live URL contract](https://docs.browserless.io/baas/monitor-sessions/manage-live-url-over-rest).
Trusted composition supplies one exact HTTPS origin, its owning token and the verified provider-plan
maximum browser duration. Do not confuse persisted-profile TTL with this live-browser limit or take that
configuration or a browser ID from a model or unvalidated incoming request. Token lookup and account
selection are intentionally outside this package. No environment or personal credential discovery.

- `createWatchViewer` issues one POST with `interactable: false`, `resizable: false`, and browser
  controls visible. Its lifetime is at most 15 minutes and the remaining application authorization.
  It is additionally capped to the configured provider limit. The provider may shorten it to the
  browser's remaining lifetime. Read fresh status before exposure.
- `status` reads the exact browser/Live URL pair. It does not infer browser termination from a 404.
- `close` requires a documented 204 acknowledgement; a 404 is not silently reported as success.
- `watchViewerDecision` schedules refresh before an ordinary link expires. It refuses refresh after
  Stop, authorization expiry, explicit closure, foreign-browser correlation, an interactive link,
  or uncertain dispatch. It never creates or renews a browser or an inference window.

The returned `liveURL` is itself a bearer capability. Keep receipts in protected application state,
never tool results, telemetry, ticket text or ordinary activity events. An authenticated viewer
endpoint must reauthorize the bound application attempt, use no-store/referrer protections, verify
the fresh watch-only status, and expose only this validated same-origin viewer. It must not accept
arbitrary client-supplied iframe URLs. Changing CSS cannot make an interactive link watch-only.

Every request disables redirects and automatic retries and bounds body size and transport time.
Fetch and body cancellation are awaited; no abandoned Promise.race is used. A cancelled/failed
mutation after dispatch is **uncertain**, not proof that nothing happened. The application must
journal before dispatch, retain known receipts before display, and serialize renewal/control/Stop.
If receipt persistence fails, retain reconciliation evidence; do not create another link blindly.
Replace a renewed watch link only after that receipt is saved and validated, then retire the old
link only when it has a different ID. The provider's CDP mint can reuse a page's Live URL ID; blindly
closing the "old" matching ID would revoke the replacement too. A view-only link neither grants
portal mutation authority nor guarantees that the browser
agent cannot submit a form. Per-action authorization remains separate.

## Owned synthetic sessions and agent connection

The owned-session viewer keeps the provider's browser tabs/address bar and lets the remote
viewport match that viewer's surface. A fixed remote capture can be stretched by the provider's
browser-chrome layout after a portal changes its window dimensions. Consumers must keep the iframe
surface stable and scale the whole surface uniformly for fit mode, rather than independently
stretching its width and height. Viewport sizing does not grant interaction: watch viewers remain
non-interactive, private control still blocks agent observations, and every action retains its
normal authorization and fresh observed-control checks.

`createBrowserlessSyntheticSession` creates one bounded CDP connection using trusted application
HTML only. Its synthetic CSP blocks network access and form submission. This is not a security
policy for arbitrary payer pages. `OwnedBrowserSession` serializes inspect/fill/select/click,
returns fresh page text, observed controls and a screenshot, and closes its browser/viewer on Stop
or the absolute deadline. Actions do not use Locator retries; uncertainty prevents further writes.
Browserless Cloud can return an opaque `/e/<route>/live/index.html` path. Preserve that validated
same-origin URL rather than reconstructing it or placing it in model results.

`browserFunctionDefinition` is the standard Agents API function shape, independent of a workflow,
target site or model. Reviewed entry accepts an observation ID, opaque control ID and reviewed
requirement ID. The application resolves values and exact original bytes; the model cannot supply
replacement files, credentials, arbitrary URLs or JavaScript. Legacy free-form values/clicks remain
limited to the original isolated synthetic fixtures. The application must bind one authorized run/attempt, recheck current scope,
exclude competing controllers, persist dispatch before I/O and withhold results after revocation.
The canonical credentialing definition now declares this tool for new sessions; its presence alone
does not grant authority. The backend checks the retained launch capability, current case/run and
explicit private handoff. Older sessions are not hot-patched. The public-research child is separate.
Screenshots are protected model input, not ordinary activity/feed content.

### Private control and native browser operation

`startHumanControl` issues private interactive access to the original operator. All agent
observations and actions are withheld. `resumeAutomation` revokes that capability, checks for
visible password/one-time-code controls, and issues a watch-only viewer. An operator can return
to private control after the current task settles: the prior watch viewer must be revoked and
the provider must issue a different private capability. Reused viewer IDs/URLs fail closed rather
than upgrading a link already shared with other readers. Failed revocation remains uncertain.
Stop closes the owned browser. Neither handoff nor viewer reload extends its absolute deadline.

`operate_application_browser` exposes native tasks and inspection. The model delegates a
plain-language task plus released requirement/attachment IDs to `openai-platform`'s Responses
computer loop, using the same browser visible to Ops. The older observed-control implementation
is retained only for historical isolated fixtures; it is not the real portal's action engine.

The agent judges navigation, provider context, field formatting, ordinary dialogs, uploads and
Next/Save draft. No HTML form override, HTTP-method write ban or button-word filter attempts to
infer final submission. The agent must stop before final submission, signature, attestation,
certification, payment or ambiguous consequential actions and ask the operator. **This is agent
policy, not an infallible technical submission firewall.** The operator must follow the same
no-final-submission test scope. Authentication submission is distinct.

Dialogs are observed instead of automatically dismissed. A modal can hold Chrome's native input
command open; the adapter retains that command, returns the dialog and cached pre-dialog image,
and continues only after a separately journaled dialog response. It never repeats the click.
Observed tab IDs let the agent select a tab without guessing URL or provider IDs. Native typing
supports formatting, splitting supported facts and task-related search text; instructions prohibit
invented case facts. The application still controls exact-package release and exact original bytes.

Original transfer uses the documented
[Browserless.uploadFile contract](https://docs.browserless.io/baas/features/file-transfers), capped
at 50 MB decoded bytes. Selected file name, size and SHA-256 are independently read back. This
proves selected bytes, not portal acceptance. The provider command currently targets top-document
file inputs; frame upload support is not claimed. No model-supplied path, bytes or script is accepted.

The backend authorizes each action, journals before I/O, rejects duplicates, preserves unknown
outcomes without replay, and checks current case/run binding, Stop, private control and expiry.
Explicit package release is for draft use of supported information; it does not approve the entire
package. Package/version changes require a fresh explicit release/handoff before further actions.
Responses history and images remain in memory; durable journals retain fingerprints and lifecycle.
The 24-response delegation boundary returns progress for another focused task; it does not end or
replace the browser. Provider lifetime remains separate and visible in the UI.

Synthetic native fixtures have an observable, harmless final endpoint. A zero final-attempt count
is required in agent acceptance. A receiver rejecting a final request is not evidence that the
agent respected its instructions. `scripts/native-browser-proof.ts` tests adapter behavior in an
isolated Chrome profile; its deliberate final click checks receiver sensitivity, not agent policy.
Hosted synthetic trials separately test the real agent's decisions. Historical selector fixtures
retain their old closed receiver for compatibility and cannot establish native portal readiness.

Portal-page request interception screens HTTPS destinations and redirects against public DNS;
private addresses, lookup failures and credential-bearing URLs are rejected. The screen shares the
existing public-research origin policy. It is not a provider egress firewall, DNS-rebinding defense,
or verified multi-tab/worker/WebSocket isolation. Authentication compatibility, including identity
provider redirects and popups, requires connected acceptance before broader use. Do not claim that
human-controlled portal pages cannot submit: the operator must stop before application submission,
signing, attestation or payment. Authentication submission is distinct.

Synthetic tests verify the documented transport and renewal decisions, not a live provider account
or plan entitlement. Connected application acceptance and arbitrary portal compatibility remain the adopting application's gates. Provider
stored-secret filling can disable all Live URLs for that session; verify the actual login/handoff
path before claiming private-portal visibility. Do not substitute snapshots for the live viewer.

Run `corepack pnpm --filter @headstart-health/browser-runtime test:coverage` for this package and
`corepack pnpm qa` for the full repository gate. Ordinary tests use synthetic fetch responses and
never contact a provider or use credentials. See the [documentation hub](../../docs/README.md),
[workflow authoring guide](../../docs/workflow-authoring-guide.md), and
[application-connected development](../../docs/agent-workflow-development.md).
