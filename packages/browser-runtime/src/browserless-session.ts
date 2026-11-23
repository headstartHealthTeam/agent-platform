import { randomUUID } from 'node:crypto';

import type {} from './browserless-protocol.js';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { z } from 'zod';

import { NativeBrowserComputer, requireReviewedOrigin } from './native-computer.js';
import {
  browserDialog,
  observeBrowserDialogs,
  readWithDialogs,
  trackBrowserDialogClosure,
} from './native-dialog.js';
import { ObservedControls, observedBrowser } from './observed-controls.js';
import { openPortalPage, portalUrl, screenPortalPage } from './portal-navigation.js';
import { publicOriginAllowed } from './public-origin.js';
import {
  OwnedBrowserSession,
  BrowserSessionError,
  type BrowserAction,
  type BrowserConnection,
  type BrowserInspection,
} from './session.js';
import { disableFormSubmission } from './submission-guard.js';
import { openReviewedSyntheticPage, openNativeSyntheticPage } from './synthetic-page.js';
import { BrowserSocket } from './transport.js';
import { containsViewerToken, isBrowserlessViewerPath } from './viewer-path.js';

const privateInputSelector = 'input[type="password"], input[autocomplete~="one-time-code" i]';
const tabSelectionPhase = 'tab-selection';
const handoffObservation = 'handoff-observation';
const openTab = (page: Page): boolean => !page.isClosed() && page.url() !== 'about:blank';
function interruptedDocumentRead(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'Execution context was destroyed, most likely because of a navigation.' ||
      (error.name === 'ProtocolError' &&
        error.message.startsWith('Page.captureScreenshot timed out.')))
  );
}
const configSchema = z
  .object({
    origin: z.enum([
      'https://production-sfo.browserless.io',
      'https://production-lon.browserless.io',
      'https://production-ams.browserless.io',
    ]),
    interactionOrigin: z.url({ protocol: /^https$/ }).optional(),
    token: z.string().min(1).max(8192).regex(/^\S+$/),
    maximumSessionDurationMs: z.number().int().positive().max(86_400_000),
  })
  .strict();
export type BrowserlessSessionConfig = z.infer<typeof configSchema>;
const liveResponse = z.object({
  error: z.null(),
  liveURL: z.string().max(4096),
  liveURLId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  timeout: z.number().int().positive(),
});

/** Trusted synthetic content only. No source credentials, portal URL, script, or HTML from a model. */
export async function createBrowserlessSyntheticSession(
  providerConfig: unknown,
  html: string,
  notAfter: number,
  reviewedEntry = false,
  nativeComputer = false
): Promise<OwnedBrowserSession> {
  if (!html || html.length > 128_000) throw new BrowserSessionError('invalid_action');
  return createSession(
    providerConfig,
    { kind: 'synthetic', html, reviewedEntry, nativeComputer },
    notAfter
  );
}

/** Private login first; explicit application handoff enables native browser operation. */
export async function createBrowserlessPortalSession(
  providerConfig: unknown,
  targetUrl: string,
  notAfter: number
): Promise<OwnedBrowserSession> {
  const url = new URL(await validateBrowserPortalTarget(targetUrl));
  return createSession(providerConfig, { kind: 'portal', url }, notAfter);
}

/** Validate without creating a paid browser. Rechecked during actual creation. */
export async function validateBrowserPortalTarget(targetUrl: string): Promise<string> {
  const url = portalUrl(targetUrl);
  let allowed: boolean;
  try {
    allowed = await publicOriginAllowed(url.origin);
  } catch {
    throw new BrowserSessionError('read_failed');
  }
  if (!allowed) throw new BrowserSessionError('invalid_action');
  return url.href;
}

type BrowserContent =
  | { kind: 'synthetic'; html: string; reviewedEntry: boolean; nativeComputer: boolean }
  | { kind: 'portal'; url: URL };

async function openContent(page: Page, content: BrowserContent): Promise<void> {
  if (content.kind === 'portal') return openPortalPage(page, content.url);
  if (content.nativeComputer) return openNativeSyntheticPage(page, content.html);
  if (content.reviewedEntry) return openReviewedSyntheticPage(page, content.html);
  await page.setContent(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">${content.html}`
  );
}

async function createSession(
  providerConfig: unknown,
  content: BrowserContent,
  notAfter: number
): Promise<OwnedBrowserSession> {
  const parsed = configSchema.safeParse(providerConfig);
  if (!parsed.success || !Number.isSafeInteger(notAfter))
    throw new BrowserSessionError('invalid_action');
  const config = parsed.data;
  if (
    config.interactionOrigin &&
    (content.kind !== 'portal' || config.interactionOrigin !== content.url.origin)
  )
    throw new BrowserSessionError('invalid_action');
  const started = Date.now();
  const timeout = Math.min(config.maximumSessionDurationMs, notAfter - started);
  if (timeout <= 0) throw new BrowserSessionError('ended');
  const endpoint = new URL(config.origin);
  endpoint.protocol = 'wss:';
  endpoint.searchParams.set('token', config.token);
  endpoint.searchParams.set('timeout', String(timeout));
  let browser: Browser | undefined;
  let transport: BrowserSocket | undefined;
  let phase: 'connection' | 'protocol' | 'page' | 'fixture' = 'connection';
  try {
    transport = await BrowserSocket.connect(endpoint.href);
    phase = 'protocol';
    browser = await puppeteer.connect({
      transport,
      protocolTimeout: 15_000,
      defaultViewport: { width: 1200, height: 760 },
    });
    phase = 'page';
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    // Synthetic fixtures retain their closed-network CSP. Portal sessions instead screen public
    // HTTPS requests and prohibit automation for the entire initial private-login checkpoint.
    phase = 'fixture';
    const connection = new PuppeteerConnection(
      browser,
      page,
      config,
      transport,
      content.kind === 'portal' || content.reviewedEntry,
      content.kind === 'portal' || content.nativeComputer,
      content.kind === 'portal'
    );
    if (content.kind === 'portal') {
      observeBrowserDialogs(page);
      await trackBrowserDialogClosure(page);
    }
    await openContent(page, content);
    return new OwnedBrowserSession(connection, started + timeout, content.kind === 'portal');
  } catch {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* Unknown remote outcome remains journaled by the caller. */
      }
    }
    if (transport) {
      transport.close();
      await transport.closed;
    }
    throw new BrowserSessionError('dispatch_uncertain', phase);
  }
}

class PuppeteerConnection implements BrowserConnection {
  private readonly native: NativeBrowserComputer | undefined;
  private readonly observed: ObservedControls;
  private readonly tabs = new Map<string, Page>();
  private readonly navigated = new WeakSet<Page>();
  private selectedPage: Page;
  private observedPage?: Page;
  private readonly guarded = new WeakSet<Page>();
  constructor(
    private readonly browser: Browser,
    private readonly page: Page,
    private readonly config: BrowserlessSessionConfig,
    private readonly transport: BrowserSocket,
    private readonly portal: boolean,
    nativeComputer: boolean,
    private readonly nativePortal = false
  ) {
    this.selectedPage = page;
    this.registerTab(page);
    const observed = observedBrowser(browser, page);
    this.observed = new ObservedControls(observed.browser, observed.page);
    this.native = nativeComputer && !nativePortal ? new NativeBrowserComputer(page) : undefined;
    if (nativePortal)
      browser.on('targetcreated', (target) => {
        target
          .page()
          .then(async (opened) => {
            if (opened) {
              observeBrowserDialogs(opened);
              await trackBrowserDialogClosure(opened);
              await screenPortalPage(opened);
              this.registerTab(opened);
              this.selectedPage = opened;
            }
            return undefined;
          })
          .catch(() => {
            // A closed popup has no actionable surface; nativeDriver rechecks every surviving page.
          });
      });
  }

  private registerTab(page: Page): void {
    if ([...this.tabs.values()].includes(page)) return;
    this.tabs.set(randomUUID(), page);
    if (this.nativePortal)
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) this.navigated.add(page);
      });
  }

  private async nativeDriver(
    observing = false
  ): Promise<{ page: Page; driver: NativeBrowserComputer }> {
    await this.requireNonPrivatePage();
    if (!this.nativePortal) {
      if (!this.native) throw new BrowserSessionError('invalid_action');
      return { page: this.page, driver: this.native };
    }
    const pages = (await this.browser.pages()).filter(openTab);
    const available = pages.includes(this.selectedPage) ? this.selectedPage : pages.at(-1);
    const current = observing ? available : this.observedPage;
    if (!current || !pages.includes(current))
      throw new BrowserSessionError(
        observing ? 'read_failed' : 'invalid_action',
        tabSelectionPhase
      );
    for (const page of pages) {
      if (!(await publicOriginAllowed(new URL(page.url()).origin)))
        throw new BrowserSessionError('invalid_action');
      await screenPortalPage(page);
      this.registerTab(page);
    }
    requireReviewedOrigin(new URL(current.url()), this.config.interactionOrigin);
    if (observing && !pages.includes(this.selectedPage)) this.selectedPage = current;
    let inputAttempted = false;
    const assertSelected = (sendingInput = false): void => {
      this.assertSelectedTab(current, inputAttempted);
      if (sendingInput) inputAttempted = true;
    };
    if (!observing) assertSelected();
    await current.bringToFront();
    if (!observing) assertSelected();
    return {
      page: current,
      driver: new NativeBrowserComputer(
        current,
        'portal',
        this.config.interactionOrigin,
        assertSelected
      ),
    };
  }

  private assertSelectedTab(page: Page, inputAttempted: boolean): void {
    if (page.isClosed() || this.selectedPage !== page || this.observedPage !== page)
      throw new BrowserSessionError(
        inputAttempted ? 'dispatch_uncertain' : 'invalid_action',
        tabSelectionPhase
      );
  }

  private async tabList(
    inspected: Page
  ): Promise<{ tabId: string; title: string; current: boolean }[]> {
    const tabs: { tabId: string; title: string; current: boolean }[] = [];
    for (const [tabId, page] of this.tabs) {
      if (page.isClosed()) {
        this.tabs.delete(tabId);
        continue;
      }
      if (!this.reviewedTab(page)) continue;
      const title = browserDialog(page) ? 'Dialog open' : await page.title();
      if (this.reviewedTab(page)) tabs.push({ tabId, title, current: page === inspected });
    }
    return tabs;
  }

  async inspectComputer(afterInput = false): Promise<BrowserInspection> {
    const selected = this.selectedPage;
    try {
      return await this.readComputer();
    } catch (error) {
      // A completed input can navigate while the first read still holds its old CDP context.
      // Re-read the destination once, including every privacy check. Never replay the input.
      if (
        !afterInput ||
        !this.nativePortal ||
        selected !== this.selectedPage ||
        selected.isClosed() ||
        !interruptedDocumentRead(error)
      )
        throw error;
      // CDP can reject an evaluation before Puppeteer delivers the frame navigation event.
      if (!this.navigated.has(selected))
        await selected
          .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 })
          .catch(() => undefined);
      if (!this.navigated.has(selected) || selected !== this.selectedPage || selected.isClosed())
        throw error;
      const ready = await selected.waitForFunction(() => document.readyState !== 'loading', {
        timeout: 2000,
      });
      await ready.dispose();
      const fresh = await this.readComputer();
      if (selected !== this.selectedPage || selected !== this.observedPage || selected.isClosed())
        throw error;
      return fresh;
    }
  }

  private async readComputer(): Promise<BrowserInspection> {
    const { page: inspected, driver } = await this.nativeDriver(true);
    const captured = await driver.inspect();
    const tabs = this.nativePortal ? await this.tabList(inspected) : [];
    // The capture guards its pixels. Separately recheck current authority on every surviving tab.
    const clear = await this.requireNonPrivatePage(true, inspected);
    const result = driver.finishObservation(captured, clear);
    if (!this.nativePortal) return result;
    this.observedPage = inspected;
    this.navigated.delete(inspected);
    return {
      ...result,
      text: `${result.text}\nBrowser tabs (untrusted titles): ${JSON.stringify(tabs)}`,
    };
  }
  async validateComputer(action: unknown, values: readonly string[]): Promise<void> {
    if (this.tabAction(action)) return;
    await (await this.nativeDriver()).driver.validate(action, values);
  }
  async computer(
    action: unknown,
    values: readonly string[],
    beforeInput?: () => Promise<void>
  ): Promise<void> {
    const tab = this.tabAction(action);
    if (tab) {
      await beforeInput?.();
      if (tab.isClosed()) throw new BrowserSessionError('invalid_action', tabSelectionPhase);
      this.selectedPage = tab;
      await tab.bringToFront();
      return;
    }
    await (await this.nativeDriver()).driver.act(action, values, beforeInput);
  }
  private tabAction(action: unknown): Page | undefined {
    const parsed = z
      .object({ type: z.literal('select_tab'), tabId: z.uuid() })
      .strict()
      .safeParse(action);
    if (!parsed.success) return undefined;
    const page = this.tabs.get(parsed.data.tabId);
    if (!page || page.isClosed() || !this.reviewedTab(page))
      throw new BrowserSessionError('invalid_action', tabSelectionPhase);
    return page;
  }
  async uploadComputer(
    point: { x: number; y: number },
    files: Extract<BrowserAction, { kind: 'upload' }>['files'],
    beforeInput?: () => Promise<void>
  ): Promise<void> {
    await (await this.nativeDriver()).driver.upload(point, files, beforeInput);
  }

  async inspect(): Promise<BrowserInspection> {
    await this.requireNonPrivatePage();
    if (this.native || this.nativePortal) return this.inspectComputer();
    if (this.portal) {
      for (const page of await this.browser.pages()) {
        if (!this.guarded.has(page)) {
          await page.evaluateOnNewDocument(disableFormSubmission);
          this.guarded.add(page);
        }
      }
      const text = await this.observed.inspectText();
      await this.requireNonPrivatePage();
      const image = await this.observed
        .currentPage()
        .screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' });
      await this.requireNonPrivatePage();
      if (image.length > 3_500_000) throw new BrowserSessionError('read_failed');
      const readback = this.observed.readback();
      return { text, image: `data:image/jpeg;base64,${image}`, ...(readback ? { readback } : {}) };
    }
    const text = await this.page
      .locator('body')
      .map((body) => {
        // Finishing a handoff is not evidence that authentication finished. Never return password
        // or one-time-code controls, or capture their visible page, to the agent.
        if (
          Array.from(
            body.querySelectorAll('input[type="password"], input[autocomplete~="one-time-code" i]')
          ).some((element) => element.getClientRects().length > 0)
        )
          throw new Error('Private authentication page requires operator control');
        // Current DOM evidence, not preselected fixture selectors or a model-supplied script.
        const controls = Array.from(body.querySelectorAll('input, select, textarea, button, a'))
          .filter((element) => element.getClientRects().length > 0)
          .slice(0, 100)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            selector: element.id ? `#${CSS.escape(element.id)}` : null,
            label: element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, 500),
            type: element.getAttribute('type'),
            disabled: element.hasAttribute('disabled'),
            value: 'value' in element && typeof element.value === 'string' ? element.value : null,
            options: Array.from(element.querySelectorAll('option')).map((option) => ({
              value: option.value,
              label: option.textContent.trim(),
            })),
          }));
        return JSON.stringify({ text: body.innerText.slice(0, 20_000), controls }).slice(0, 32_000);
      })
      .wait();
    await this.requireNonPrivatePage();
    const image = await this.page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' });
    await this.requireNonPrivatePage();
    if (image.length > 3_500_000) throw new BrowserSessionError('read_failed');
    return { text, image: `data:image/jpeg;base64,${image}` };
  }

  async act(action: Exclude<BrowserAction, { kind: 'inspect' }>): Promise<void> {
    // Initial portal handoff grants observation, not population or arbitrary clicks. The
    // application must introduce reviewed action authority before extending this boundary.
    if (this.nativePortal) throw new BrowserSessionError('invalid_action');
    if (this.portal) {
      await this.requireNonPrivatePage();
      return this.observed.act(action);
    }
    if (action.kind === 'target' || action.kind === 'navigate' || action.kind === 'upload')
      throw new BrowserSessionError('invalid_action');
    // A premature handoff must not click or type on a still-private page before inspect rejects it.
    const authentication = await this.page.evaluate(
      (selector) =>
        Array.from(document.querySelectorAll(selector)).some(
          (element) => element.getClientRects().length > 0
        ),
      privateInputSelector
    );
    if (authentication) throw new BrowserSessionError('human_control');
    // Exactly one matched element; do not silently select the first ambiguous control.
    const elements = await this.page.$$(action.selector);
    try {
      const element = elements[0];
      if (elements.length !== 1 || !element) throw new BrowserSessionError('invalid_action');
      // ElementHandle operations have no Locator retry loop: a lost action result stays uncertain.
      switch (action.kind) {
        case 'fill':
          await element.click({ count: 3 });
          await element.press('Backspace');
          await element.type(action.value);
          break;
        case 'select':
          await element.select(action.value);
          break;
        case 'click':
          await element.click();
          break;
      }
    } finally {
      await Promise.all(elements.map((element) => element.dispose()));
    }
  }

  async validate(action: BrowserAction): Promise<void> {
    await this.requireNonPrivatePage();
    if (this.nativePortal && action.kind !== 'inspect')
      throw new BrowserSessionError('invalid_action');
    if (this.portal && !this.nativePortal) await this.observed.validate(action);
  }

  async hasPendingDialog(): Promise<boolean> {
    return (await this.browser.pages()).some((page) => browserDialog(page) !== null);
  }

  private reviewedTab(page: Page): boolean {
    return (
      !this.config.interactionOrigin || new URL(page.url()).origin === this.config.interactionOrigin
    );
  }

  async inspectHandoff(): Promise<BrowserInspection> {
    if (!this.nativePortal || !this.config.interactionOrigin) return this.inspect();
    const pages = (await this.browser.pages()).filter(openTab);
    // The operator can switch back to the reviewed portal without closing the sign-in popup.
    if (
      pages.some((page) => !this.reviewedTab(page)) &&
      pages.some((page) => this.reviewedTab(page))
    ) {
      const focused: Page[] = [];
      for (const page of pages) if (await this.operatorFocused(page)) focused.push(page);
      if (focused.length === 1 && focused[0]) this.selectedPage = focused[0];
      else {
        // With mixed destinations, do not bring an approved background tab forward on a guess.
        requireReviewedOrigin(new URL(this.selectedPage.url()), this.config.interactionOrigin);
        throw new BrowserSessionError('read_failed', tabSelectionPhase);
      }
    }
    return this.inspect();
  }

  private async operatorFocused(page: Page): Promise<boolean> {
    if (browserDialog(page)) throw new BrowserSessionError('human_control', handoffObservation);
    const focus = await readWithDialogs(page, () => page.evaluate(() => document.hasFocus()));
    if (focus.interrupted) throw new BrowserSessionError('human_control', handoffObservation);
    return focus.value;
  }

  async verifyHandoff(): Promise<void> {
    await this.requireNonPrivatePage(false);
    if (this.config.interactionOrigin)
      requireReviewedOrigin(
        new URL((await this.viewerPage()).url()),
        this.config.interactionOrigin
      );
  }

  private async requireNonPrivatePage(allowDialogs = true, inspected?: Page): Promise<boolean> {
    // Login can move to an iframe or a popup. Never treat a clean top document as proof that
    // the browser is clear of credentials. Unreadable/closed frames fail closed too.
    let inspectedClear = false;
    for (const page of await this.browser.pages()) {
      const clear = await this.checkPrivacyOnPage(page, allowDialogs);
      if (page === inspected) inspectedClear = clear;
    }
    return inspectedClear;
  }

  private async checkPrivacyOnPage(page: Page, allowDialogs: boolean): Promise<boolean> {
    // A modal blocks DOM evaluation. Its observation uses the last non-private screenshot.
    if (browserDialog(page)) {
      if (!allowDialogs) throw new BrowserSessionError('human_control', handoffObservation);
      return false;
    }
    for (const frame of page.frames()) {
      const authentication = await readWithDialogs(page, () =>
        frame.evaluate(
          (selector) =>
            Array.from(document.querySelectorAll(selector)).some(
              (element) => element.getClientRects().length > 0
            ),
          privateInputSelector
        )
      );
      if (authentication.interrupted) {
        if (!allowDialogs) throw new BrowserSessionError('human_control', handoffObservation);
        return false;
      }
      if (authentication.value) throw new BrowserSessionError('human_control', 'authentication');
    }
    return true;
  }

  async watch(timeoutMs: number): Promise<{ liveURL: string; liveURLId: string; timeout: number }> {
    return this.viewer(timeoutMs, false);
  }

  async human(timeoutMs: number): Promise<{ liveURL: string; liveURLId: string; timeout: number }> {
    return this.viewer(timeoutMs, true);
  }

  private async viewerPage(): Promise<Page> {
    if (!this.selectedPage.isClosed()) return this.selectedPage;
    const surviving = (await this.browser.pages()).find(openTab);
    if (!surviving) throw new BrowserSessionError('ended');
    return surviving;
  }

  async closeViewer(liveURLId: string): Promise<void> {
    const cdp = await (await this.viewerPage()).createCDPSession();
    try {
      const result = z.object({ error: z.null(), liveURLId: z.literal(liveURLId) });
      result.parse(await cdp.send('Browserless.closeLiveURL', { liveURLId }));
    } finally {
      await cdp.detach().catch(() => undefined);
    }
  }

  private async viewer(
    timeoutMs: number,
    interactable: boolean
  ): Promise<{ liveURL: string; liveURLId: string; timeout: number }> {
    const page = await this.viewerPage();
    const cdp = await page.createCDPSession();
    try {
      // Before asking Browserless for a watch link, recheck the exact target after CDP attachment.
      if (!interactable && this.config.interactionOrigin)
        requireReviewedOrigin(new URL(page.url()), this.config.interactionOrigin);
      const result = liveResponse.parse(
        await cdp.send('Browserless.liveURL', {
          timeout: timeoutMs,
          interactable,
          // Match the capture viewport to the viewer surface. With browser chrome,
          // a fixed capture can be stretched when a portal changes its window size.
          // Applications keep this surface stable and scale it uniformly for fit mode.
          resizable: true,
          showBrowserInterface: true,
          quality: 70,
          type: 'jpeg',
        })
      );
      const url = new URL(result.liveURL);
      if (
        url.origin !== this.config.origin ||
        !isBrowserlessViewerPath(url.pathname) ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll('i').length !== 1 ||
        url.searchParams.get('i') !== result.liveURLId ||
        url.searchParams.has('token') ||
        containsViewerToken(result.liveURL, url, this.config.token) ||
        result.timeout > timeoutMs
      )
        throw new BrowserSessionError('dispatch_uncertain');
      return { liveURL: url.href, liveURLId: result.liveURLId, timeout: result.timeout };
    } finally {
      await cdp.detach();
    }
  }

  async close(): Promise<void> {
    try {
      await this.browser.close();
    } finally {
      this.transport.close();
      await this.transport.closed;
    }
  }
}
