import { createHash, randomUUID } from 'node:crypto';

import type { Browser, Page, Frame, ElementHandle } from 'puppeteer-core';
import { z } from 'zod';

import type {} from './browserless-protocol.js';
import { BrowserSessionError, type BrowserAction, type BrowserInspection } from './session.js';
import { disableFormSubmission } from './submission-guard.js';

/** Narrow structural transport seam; Puppeteer satisfies it without casts or credential access. */
export interface ObservedElement {
  evaluate<Result>(
    function_: (element: Node, argument: string) => Result | Promise<Result>,
    argument?: string
  ): Promise<Result>;
  select(...values: string[]): Promise<string[]>;
  dispose(): Promise<void>;
}
export interface ObservedFrame {
  url(): string;
  $$(selector: string): Promise<ObservedElement[]>;
  evaluate<Result>(function_: () => Result | Promise<Result>): Promise<Result>;
  goto(
    url: string,
    options: { waitUntil: 'domcontentloaded'; timeout: number }
  ): Promise<{ status(): number } | null>;
}
export interface ObservedCDP {
  send(
    method: 'Browserless.uploadFile',
    params: { selector: string; files: { name: string; content: string; mimeType: string }[] }
  ): Promise<unknown>;
  detach(): Promise<void>;
}
export interface ObservedPage {
  url(): string;
  frames(): ObservedFrame[];
  mainFrame(): ObservedFrame;
  bringToFront(): Promise<void>;
  createCDPSession(): Promise<ObservedCDP>;
  screenshot(options: { type: 'jpeg'; quality: number; encoding: 'base64' }): Promise<string>;
}
export interface ObservedBrowser {
  pages(): Promise<ObservedPage[]>;
}

/** Adapt only documented Puppeteer operations, preserving node/frame/page identity. */
export function observedBrowser(
  browser: Browser,
  initial: Page
): { browser: ObservedBrowser; page: ObservedPage } {
  const elements = new WeakMap<ElementHandle, ObservedElement>();
  const frames = new WeakMap<Frame, ObservedFrame>();
  const pages = new WeakMap<Page, ObservedPage>();
  function element(value: ElementHandle): ObservedElement {
    const prior = elements.get(value);
    if (prior) return prior;
    const result: ObservedElement = {
      evaluate: async (function_, argument = '') => await value.evaluate(function_, argument),
      select: (...values) => value.select(...values),
      dispose: () => value.dispose(),
    };
    elements.set(value, result);
    return result;
  }
  function frame(value: Frame): ObservedFrame {
    const prior = frames.get(value);
    if (prior) return prior;
    const result: ObservedFrame = {
      url: () => value.url(),
      $$: async (selector) => (await value.$$(selector)).map(element),
      evaluate: async (function_) => await value.evaluate(function_),
      goto: (url, options) => value.goto(url, options),
    };
    frames.set(value, result);
    return result;
  }
  function page(value: Page): ObservedPage {
    const prior = pages.get(value);
    if (prior) return prior;
    const result: ObservedPage = {
      url: () => value.url(),
      frames: () => value.frames().map(frame),
      mainFrame: () => frame(value.mainFrame()),
      bringToFront: () => value.bringToFront(),
      createCDPSession: () => value.createCDPSession(),
      screenshot: (options) => value.screenshot(options),
    };
    pages.set(value, result);
    return result;
  }
  return { browser: { pages: async () => (await browser.pages()).map(page) }, page: page(initial) };
}
export interface ControlDescription {
  tag: string;
  type: string;
  label: string;
  value: string | null;
  disabled: boolean;
  visible: boolean;
  href: string | null;
  scripted: boolean;
  multiple: boolean;
  options: { value: string; label: string }[];
}
const protectedText =
  /\b(submit|finish|finali[sz]e|send|certif\w*|attest\w*|sign(?:ature)?|agree|accept|payment|pay|enroll\s+now)\b/i;

/** Negative signals are additional guards, never proof of a button's effects. No generic clicks. */
export function allowedControl(control: ControlDescription, kind: BrowserAction['kind']): boolean {
  if (!control.visible || control.disabled || protectedText.test(control.label)) return false;
  if (kind === 'fill')
    return (
      control.tag === 'textarea' ||
      (control.tag === 'input' &&
        ['text', 'email', 'tel', 'url', 'search', 'number', 'date'].includes(control.type))
    );
  if (kind === 'select') return control.tag === 'select' && !control.multiple;
  if (kind === 'upload') return control.tag === 'input' && control.type === 'file';
  if (kind === 'navigate')
    return (
      control.tag === 'a' &&
      !!control.href &&
      !control.scripted &&
      !protectedText.test(control.href)
    );
  return false;
}

const privateControls = [
  'input[type="hidden" i]',
  'input[type="password" i]',
  '[autocomplete~="current-password" i]',
  '[autocomplete~="new-password" i]',
  '[autocomplete~="one-time-code" i]',
].join(',');

/** Runs against a held node, never a model-provided script or arbitrary selector. */
function describe(element: Node, privateSelector: string): ControlDescription | null {
  if (!(element instanceof HTMLElement) || element.matches(privateSelector)) return null;
  const input =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement;
  const labels = input
    ? Array.from(element.labels ?? [])
        .map((label) => label.innerText)
        .join(' ')
    : '';
  return {
    tag: element.tagName.toLowerCase(),
    type: element instanceof HTMLInputElement ? element.type : (element.getAttribute('type') ?? ''),
    label: (
      element.getAttribute('aria-label') ??
      [labels, element.innerText, element.getAttribute('placeholder') ?? ''].find(
        (value) => value.length > 0
      ) ??
      ''
    )
      .trim()
      .slice(0, 1000),
    value:
      input && !(element instanceof HTMLInputElement && element.type === 'file')
        ? element.value
        : null,
    disabled:
      element.hasAttribute('disabled') ||
      element.hasAttribute('readonly') ||
      element.getAttribute('aria-disabled') === 'true',
    visible:
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
    href: element instanceof HTMLAnchorElement ? element.href : null,
    scripted: element.hasAttribute('onclick') || element.getAttribute('role') === 'button',
    multiple:
      (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) &&
      element.multiple,
    options:
      element instanceof HTMLSelectElement
        ? Array.from(element.options).map((option) => ({ value: option.value, label: option.text }))
        : [],
  };
}

interface Held {
  element: ObservedElement;
  frame: ObservedFrame;
  page: ObservedPage;
  url: string;
  frameUrl: string;
  description: ControlDescription;
}

const actionKinds = ['fill', 'select', 'upload', 'navigate'] as const;
function availableAction(
  control: ControlDescription,
  kind: BrowserAction['kind'],
  frame: ObservedFrame,
  page: ObservedPage
): boolean {
  if (!allowedControl(control, kind)) return false;
  // Browserless resolves the documented upload selector in the main frame.
  if (kind === 'upload') return frame === page.mainFrame();
  if (kind === 'navigate') {
    try {
      const url = new URL(control.href ?? '');
      return (
        url.protocol === 'https:' &&
        url.origin === new URL(page.url()).origin &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }
  return true;
}

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'unavailable';
  }
}

function unsafeText(value: string, filename = false): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || (filename && (character === '/' || character === '\\')))
      return true;
  }
  return false;
}

/** Observation-bound nodes support anonymous controls and frames without guessed selectors. */
export class ObservedControls {
  private observationId = '';
  private readonly controls = new Map<string, Held>();
  private readonly pageIds = new WeakMap<ObservedPage, string>();
  private targets = new Map<string, ObservedPage>();
  private result: BrowserInspection['readback'];
  constructor(
    private readonly browser: ObservedBrowser,
    private page: ObservedPage
  ) {}

  currentPage(): ObservedPage {
    return this.page;
  }

  private async refreshTargets(): Promise<void> {
    this.targets = new Map();
    const pages = await this.browser.pages();
    for (const page of pages) {
      const id = this.pageIds.get(page) ?? randomUUID();
      this.pageIds.set(page, id);
      this.targets.set(id, page);
    }
    if (!pages.includes(this.page)) throw new BrowserSessionError('read_failed');
  }

  async inspectText(): Promise<string> {
    await this.clear();
    this.observationId = randomUUID();
    await this.refreshTargets();
    const frames = [];
    let remaining = 150;
    for (const frame of this.page.frames()) {
      await frame.evaluate(disableFormSubmission);
      const frameId = randomUUID();
      const controls = [];
      const elements = remaining ? await frame.$$('input, select, textarea, button, a') : [];
      for (const element of elements) {
        const description = remaining ? await element.evaluate(describe, privateControls) : null;
        if (!description?.visible) {
          await element.dispose();
          continue;
        }
        remaining -= 1;
        const selector = randomUUID();
        this.controls.set(selector, {
          element,
          frame,
          page: this.page,
          url: this.page.url(),
          frameUrl: frame.url(),
          description,
        });
        controls.push({
          selector,
          ...description,
          href: description.href ? displayUrl(description.href) : null,
          permittedKinds: actionKinds.filter((kind) =>
            availableAction(description, kind, frame, this.page)
          ),
        });
      }
      frames.push({
        frameId,
        url: displayUrl(frame.url()),
        text: await frame.evaluate(
          () => document.querySelector('body')?.innerText.slice(0, 16000) ?? ''
        ),
        controls,
      });
    }
    return JSON.stringify({
      observationId: this.observationId,
      targetId: this.pageIds.get(this.page),
      targets: [...this.targets].map(([targetId, page]) => ({
        targetId,
        url: displayUrl(page.url()),
      })),
      frames,
      readback: this.result ?? null,
      boundary:
        'No generic clicks, keyboard submission, signatures, declarations, certification, payment or final submission. Navigation follows observed same-origin links without executing their click handlers. Ambiguous scripted controls require human investigation. Readback proves current control contents, not server acceptance.',
    });
  }

  readback(): BrowserInspection['readback'] {
    return this.result;
  }

  async validate(action: BrowserAction): Promise<void> {
    if (action.kind === 'inspect') return;
    if (
      action.kind === 'click' ||
      !('observationId' in action) ||
      action.observationId !== this.observationId
    )
      throw new BrowserSessionError('invalid_action');
    if (action.kind === 'target') {
      const target = this.targets.get(action.targetId);
      if (
        !target ||
        !(await this.browser.pages()).includes(target) ||
        new URL(target.url()).origin !== new URL(this.page.url()).origin
      )
        throw new BrowserSessionError('invalid_action');
      return;
    }
    const held = this.controls.get(action.selector);
    if (
      !held?.element ||
      held.page !== this.page ||
      held.url !== this.page.url() ||
      held.frameUrl !== held.frame.url()
    )
      throw new BrowserSessionError('invalid_action');
    const fresh = await held.element.evaluate(describe, privateControls);
    if (
      'approvedOrigin' in action &&
      action.approvedOrigin &&
      (new URL(this.page.url()).origin !== action.approvedOrigin ||
        new URL(held.frame.url()).origin !== action.approvedOrigin)
    )
      throw new BrowserSessionError('invalid_action');
    if (
      !fresh ||
      JSON.stringify(fresh) !== JSON.stringify(held.description) ||
      !availableAction(fresh, action.kind, held.frame, this.page)
    )
      throw new BrowserSessionError('invalid_action');
    this.validateArguments(action, fresh);
  }

  private validateArguments(
    action: Exclude<BrowserAction, { kind: 'inspect' | 'target' | 'click' }>,
    fresh: ControlDescription
  ): void {
    if (action.kind === 'fill' && unsafeText(action.value))
      throw new BrowserSessionError('invalid_action');
    if (action.kind === 'select' && !fresh.options.some((option) => option.value === action.value))
      throw new BrowserSessionError('invalid_action');
    if (action.kind === 'upload') this.validateUpload(action, fresh);
  }

  private validateUpload(
    action: Extract<BrowserAction, { kind: 'upload' }>,
    fresh: ControlDescription
  ): void {
    if (action.files.length > 1 && !fresh.multiple) throw new BrowserSessionError('invalid_action');
    let total = 0;
    for (const file of action.files) {
      const bytes = Buffer.from(file.content, 'base64');
      total += bytes.length;
      if (
        !bytes.length ||
        bytes.toString('base64') !== file.content ||
        unsafeText(file.name, true) ||
        `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== file.digest
      )
        throw new BrowserSessionError('invalid_action');
    }
    if (total > 50_000_000) throw new BrowserSessionError('invalid_action');
  }

  async act(action: Exclude<BrowserAction, { kind: 'inspect' }>): Promise<void> {
    await this.validate(action);
    this.result = undefined;
    if (action.kind === 'target') {
      const page = this.targets.get(action.targetId);
      if (!page) throw new BrowserSessionError('invalid_action');
      this.page = page;
      this.observationId = '';
      await page.bringToFront();
      return;
    }
    if (action.kind === 'click') throw new BrowserSessionError('invalid_action');
    const held = this.controls.get(action.selector);
    if (!held) throw new BrowserSessionError('invalid_action');
    // Consume the observation before the first possible side effect. Lost responses are not retried.
    this.observationId = '';
    if (action.kind === 'navigate') {
      const response = await held.frame.goto(held.description.href ?? '', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      if (response && response.status() >= 400) throw new BrowserSessionError('dispatch_uncertain');
    } else if (action.kind === 'fill') {
      // Direct value insertion cannot turn an embedded newline into Enter/form submission.
      await held.element.evaluate((element, value) => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
          throw new Error('Not an input');
        const prototype =
          element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        if (!descriptor?.set) throw new Error('No native value setter');
        descriptor.set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, action.value);
      this.result = {
        kind: 'fill',
        matched: (await held.element.evaluate(describe, privateControls))?.value === action.value,
      };
    } else if (action.kind === 'select') {
      await held.element.select(action.value);
      this.result = {
        kind: 'select',
        matched: (await held.element.evaluate(describe, privateControls))?.value === action.value,
      };
    } else {
      const attribute = `data-headstart-upload-${randomUUID()}`;
      const cdp = await this.page.createCDPSession();
      try {
        await held.element.evaluate((element, name) => {
          if (!(element instanceof HTMLInputElement) || element.type !== 'file')
            throw new Error('Not a file input');
          element.setAttribute(name, '');
        }, attribute);
        z.object({ ok: z.literal(true) }).parse(
          await cdp.send('Browserless.uploadFile', {
            selector: `[${attribute}]`,
            files: action.files.map(({ name, content, mimeType }) => ({
              name,
              content,
              mimeType,
            })),
          })
        );
        const selected = await held.element.evaluate(async (element) => {
          if (!(element instanceof HTMLInputElement)) throw new Error('Not a file input');
          return Promise.all(
            Array.from(element.files ?? []).map(async (file) => ({
              name: file.name,
              bytes: file.size,
              digest: `sha256:${Array.from(
                new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
              )
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')}`,
            }))
          );
        });
        const expected = action.files.map((file) => ({
          name: file.name,
          bytes: Buffer.from(file.content, 'base64').length,
          digest: file.digest,
        }));
        this.result = {
          kind: 'upload',
          matched: JSON.stringify(selected) === JSON.stringify(expected),
          files: selected,
        };
      } finally {
        await held.element
          .evaluate((element, name) => {
            if (element instanceof Element) element.removeAttribute(name);
          }, attribute)
          .catch(() => undefined);
        // Losing the cleanup connection cannot undo a verified upload or replace its original error.
        await cdp.detach().catch(() => undefined);
      }
    }
    if (this.result?.matched === false) throw new BrowserSessionError('dispatch_uncertain');
  }

  private async clear(): Promise<void> {
    await Promise.all(
      [...this.controls.values()].map(({ element }) => element.dispose().catch(() => undefined))
    );
    this.controls.clear();
  }
}
