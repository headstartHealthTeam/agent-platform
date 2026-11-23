import { createHash, randomUUID } from 'node:crypto';

import type { CDPSession, Page } from 'puppeteer-core';
import { z } from 'zod';

import {
  browserDialog,
  dispatchWithDialogs,
  observeBrowserDialogs,
  readWithDialogs,
  respondToBrowserDialog,
  trackBrowserDialogClosure,
} from './native-dialog.js';
import { browserKeys } from './native-keys.js';
import { nativeTarget, nativeTargetStructure } from './native-target.js';
import { portalScreenshot } from './portal-capture.js';
import { portalRequestCounts } from './portal-navigation.js';
import { BrowserSessionError, type BrowserAction, type BrowserInspection } from './session.js';
import { nativeSyntheticReceipts, syntheticOrigin } from './synthetic-page.js';

const ariaLabel = 'aria-label';
const point = { x: z.number().int().nonnegative(), y: z.number().int().nonnegative() };
const modifiers = { keys: z.array(z.string()).max(4).nullish() };
export const computerAction = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('click'),
      ...point,
      ...modifiers,
      button: z.enum(['left', 'right', 'wheel', 'back', 'forward']),
    })
    .strict(),
  z.object({ type: z.literal('double_click'), ...point, ...modifiers }).strict(),
  z.object({ type: z.literal('move'), ...point, ...modifiers }).strict(),
  z
    .object({
      type: z.literal('drag'),
      path: z.array(z.object(point).strict()).min(2).max(100),
      ...modifiers,
    })
    .strict(),
  z
    .object({
      type: z.literal('scroll'),
      ...point,
      scroll_x: z.number().int(),
      scroll_y: z.number().int(),
      ...modifiers,
    })
    .strict(),
  z.object({ type: z.literal('keypress'), keys: z.array(z.string()).min(1).max(4) }).strict(),
  z.object({ type: z.literal('type'), text: z.string().max(8000) }).strict(),
  z.object({ type: z.literal('wait') }).strict(),
  z.object({ type: z.literal('screenshot') }).strict(),
  z
    .object({
      type: z.literal('dialog'),
      id: z.uuid(),
      accept: z.boolean(),
      promptText: z.string().max(8000).nullable(),
    })
    .strict(),
]);
type Action = z.infer<typeof computerAction>;
type Files = Extract<BrowserAction, { kind: 'upload' }>['files'];
const lastObservations = new WeakMap<Page, BrowserInspection>();
const lastTargets = new WeakMap<Page, ReturnType<typeof nativeTargetStructure>>();

/** Thin coordinate driver on the application's browser. Portal requests are screened by its owner.
 * Native clicks follow page JavaScript, unlike the old href-only path. */
export class NativeBrowserComputer {
  constructor(
    private readonly page: Page,
    private readonly boundary: 'synthetic' | 'portal' = 'synthetic',
    private readonly interactionOrigin?: string,
    private readonly assertSelected?: (sendingInput?: boolean) => void
  ) {
    observeBrowserDialogs(page);
  }

  private requireBoundOrigin(): void {
    const url = new URL(this.page.url());
    if (this.interactionOrigin && url.origin !== this.interactionOrigin)
      throw new Error('Return to the reviewed portal in private control');
    if (
      this.boundary === 'portal'
        ? url.protocol !== 'https:' || !!url.username || !!url.password
        : url.origin !== syntheticOrigin
    )
      throw new Error('Native browser requires its authorized public or synthetic origin');
  }

  async inspect(): Promise<BrowserInspection> {
    this.requireBoundOrigin();
    await trackBrowserDialogClosure(this.page);
    const dialog = this.dialogObservation();
    if (dialog) return dialog;
    const reading = await readWithDialogs(this.page, () => this.readPage());
    return reading.interrupted ? this.inspect() : reading.value;
  }

  /** Cache an isolated capture only while the application still allows this observation. */
  finishObservation(captured: BrowserInspection, privacyVerified: boolean): BrowserInspection {
    const dialog = this.dialogObservation();
    if (dialog) return dialog;
    if (captured.pauseBatch) throw new BrowserSessionError('read_failed');
    if (!privacyVerified) throw new BrowserSessionError('human_control', 'handoff-observation');
    lastObservations.set(this.page, captured);
    return captured;
  }

  private dialogObservation(): BrowserInspection | null {
    const dialog = browserDialog(this.page);
    if (!dialog) return null;
    const prior = lastObservations.get(this.page);
    if (!prior) throw new BrowserSessionError('human_control', 'handoff-observation');
    return {
      pauseBatch: true,
      image: prior.image,
      text: `Browser dialog (untrusted page data): ${JSON.stringify(dialog)}. Screenshot is the last page before the dialog. Use respond_to_browser_dialog with this ID; keyboard and mouse actions cannot answer a JavaScript dialog. Decide from the task and context; stop for final or ambiguous consequences.`,
    };
  }

  private async readPage(): Promise<BrowserInspection> {
    const text = await this.page.evaluate(
      (ariaLabel) =>
        JSON.stringify({
          page: document.body.innerText.slice(0, 16000),
          fields: Array.from(document.querySelectorAll('input,select,textarea')).map((element) => {
            if (!(
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement
            ))
              return null;
            if (
              element instanceof HTMLInputElement &&
              (['password', 'hidden'].includes(element.type) ||
                element.autocomplete.toLowerCase().split(/\s+/).includes('one-time-code'))
            )
              return null;
            return { label: element.getAttribute(ariaLabel) ?? element.id, value: element.value };
          }),
        }),
      ariaLabel
    );
    const image =
      this.boundary === 'portal'
        ? await portalScreenshot(this.page)
        : await this.page.screenshot({ type: 'png', encoding: 'base64' });
    if (image.length > 5_000_000) throw new Error('Browser screenshot too large');
    const diagnostics =
      this.boundary === 'portal'
        ? {
            lastActionTarget: lastTargets.get(this.page) ?? null,
            blockedRequests: portalRequestCounts(this.page),
            meaning:
              'Transport diagnostics only. A completed click is not proof of navigation or persistence.',
          }
        : null;
    const observation = {
      text: diagnostics
        ? `${text}\nBrowser guard diagnostics: ${JSON.stringify(diagnostics)}`
        : `${text}\nSynthetic receiver: ${JSON.stringify(nativeSyntheticReceipts(this.page) ?? null)}`,
      image: `data:image/png;base64,${image}`,
    };
    return observation;
  }

  async validate(input: unknown, _values: readonly string[]): Promise<Action> {
    const action = await this.parseAction(input);
    if (action.type === 'type') await this.checkFocusedInput();
    this.assertSelected?.();
    return action;
  }

  private async parseAction(input: unknown): Promise<Action> {
    await trackBrowserDialogClosure(this.page);
    this.requireBoundOrigin();
    const action = computerAction.parse(input);
    const dialog = browserDialog(this.page);
    if (action.type === 'dialog') {
      if (dialog?.id !== action.id) throw new Error('Browser dialog changed');
      return action;
    }
    if (dialog) throw new Error('Resolve the current dialog before another action');
    const viewport = await this.page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const points = 'x' in action ? [action] : action.type === 'drag' ? action.path : [];
    if (points.some((p) => p.x >= viewport.width || p.y >= viewport.height))
      throw new Error('Point outside browser');
    if ('keys' in action) browserKeys(action.keys ?? []);
    await this.checkFrameOrigins(action, points);
    return action;
  }

  private async checkFrameOrigins(
    action: Action,
    points: readonly { x: number; y: number }[]
  ): Promise<void> {
    if (this.interactionOrigin && !['wait', 'screenshot'].includes(action.type)) {
      for (const point of points.length ? points : [undefined]) {
        const target = await nativeTarget(this.page, point);
        if (new URL(target.frame.url()).origin !== this.interactionOrigin)
          throw new Error('The active frame belongs to another destination');
      }
    }
  }

  private async checkFocusedInput(text?: string): Promise<void> {
    const { frame } = await nativeTarget(this.page);
    const element = await frame.evaluateHandle(() => {
      const active = document.activeElement;
      if (!active) throw new Error('Typing needs a focused editable field');
      return active;
    });
    try {
      if (
        (await nativeTarget(this.page)).frame !== frame ||
        !(await element.evaluate((current, origin) => {
          if (current !== document.activeElement || (origin && location.origin !== origin))
            return false;
          if (current instanceof HTMLTextAreaElement) return !current.readOnly;
          if (current instanceof HTMLInputElement)
            return (
              !current.readOnly &&
              !current.autocomplete.toLowerCase().split(/\s+/).includes('one-time-code') &&
              ['text', 'email', 'tel', 'url', 'search', 'number', 'date'].includes(current.type)
            );
          return current instanceof HTMLElement && current.isContentEditable;
        }, this.interactionOrigin))
      )
        throw new Error('Typing needs the same focused editable field on the reviewed destination');
      if (text !== undefined) {
        this.assertSelected?.(true);
        await this.page.keyboard.sendCharacter(text);
      }
    } finally {
      await element.dispose();
    }
  }

  async act(input: unknown, _values: readonly string[]): Promise<void> {
    const action = await this.parseAction(input);
    if (this.boundary === 'portal' && ['click', 'double_click', 'keypress'].includes(action.type)) {
      const target = await nativeTarget(this.page, 'x' in action ? action : undefined);
      lastTargets.set(this.page, await target.frame.evaluate(nativeTargetStructure, target.point));
    }
    if (action.type === 'dialog') {
      this.assertSelected?.(true);
      await respondToBrowserDialog(this.page, action);
      return;
    }
    await dispatchWithDialogs(this.page, async () => {
      const requestedKeys = browserKeys('keys' in action ? (action.keys ?? []) : []);
      const attemptedKeys: typeof requestedKeys = [];
      try {
        for (const key of requestedKeys) {
          this.assertSelected?.(true);
          attemptedKeys.push(key);
          await this.page.keyboard.down(key);
        }
        this.assertSelected?.(
          ['click', 'double_click', 'move', 'scroll', 'drag'].includes(action.type)
        );
        switch (action.type) {
          case 'click':
            await this.page.mouse.click(action.x, action.y, {
              button: action.button === 'wheel' ? 'middle' : action.button,
            });
            break;
          case 'double_click':
            await this.page.mouse.click(action.x, action.y, { count: 2 });
            break;
          case 'move':
            await this.page.mouse.move(action.x, action.y);
            break;
          case 'scroll':
            await this.page.mouse.move(action.x, action.y);
            this.assertSelected?.();
            await this.page.mouse.wheel({ deltaX: action.scroll_x, deltaY: action.scroll_y });
            break;
          case 'drag': {
            const first = action.path[0];
            if (!first) throw new Error('Missing drag start');
            await this.page.mouse.move(first.x, first.y);
            this.assertSelected?.();
            await this.page.mouse.down();
            try {
              for (const p of action.path.slice(1)) {
                this.assertSelected?.();
                await this.page.mouse.move(p.x, p.y);
              }
            } finally {
              await this.page.mouse.up();
            }
            break;
          }
          case 'type':
            await this.checkFocusedInput(action.text);
            break;
          case 'keypress':
            break; // down/up above and below dispatch the requested combination once.
          case 'wait':
            await new Promise((resolve) => setTimeout(resolve, 500));
            break;
          case 'screenshot':
            break;
        }
      } finally {
        for (const key of attemptedKeys.reverse()) await this.page.keyboard.up(key);
      }
    });
  }

  async upload(point: { x: number; y: number }, files: Files): Promise<void> {
    this.requireBoundOrigin();
    const { frame } = await nativeTarget(this.page, point);
    if (this.interactionOrigin && new URL(frame.url()).origin !== this.interactionOrigin)
      throw new Error('The upload belongs to another destination');
    if (frame !== this.page.mainFrame())
      throw new Error('File upload requires a main-frame file input');
    const payload = files.map((file) => {
      const bytes = Buffer.from(file.content, 'base64');
      if (
        !bytes.length ||
        bytes.length > 50_000_000 ||
        bytes.toString('base64') !== file.content ||
        `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== file.digest
      )
        throw new Error('Original bytes changed');
      return file;
    });
    const id = randomUUID();
    await this.page.evaluate(
      ({ point, id, count }) => {
        const element = document.elementFromPoint(point.x, point.y);
        if (
          !(element instanceof HTMLInputElement) ||
          element.type !== 'file' ||
          element.disabled ||
          (count > 1 && !element.multiple)
        )
          throw new Error('No file input at coordinates');
        element.setAttribute('data-native-upload', id);
      },
      { point, id, count: files.length }
    );
    let cdp: CDPSession | undefined;
    try {
      cdp = await this.page.createCDPSession();
      this.assertSelected?.(true);
      z.object({ ok: z.literal(true) }).parse(
        await cdp.send('Browserless.uploadFile', {
          selector: `[data-native-upload="${id}"]`,
          files: payload.map((file) => ({
            name: file.name,
            content: file.content,
            mimeType: file.mimeType,
          })),
        })
      );
      const received = await this.page.$eval(`[data-native-upload="${id}"]`, async (element) => {
        if (!(element instanceof HTMLInputElement)) throw new Error('File input changed');
        return Promise.all(
          Array.from(element.files ?? []).map(async (file) => ({
            name: file.name,
            bytes: file.size,
            digest: `sha256:${Array.from(
              new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
            )
              .map((n) => n.toString(16).padStart(2, '0'))
              .join('')}`,
          }))
        );
      });
      if (
        JSON.stringify(received) !==
        JSON.stringify(
          files.map((f) => ({
            name: f.name,
            bytes: Buffer.from(f.content, 'base64').length,
            digest: f.digest,
          }))
        )
      )
        throw new Error('Original upload readback mismatch');
    } finally {
      await cdp?.detach().catch(() => undefined);
      await this.page
        .evaluate(
          (id) =>
            document
              .querySelector(`[data-native-upload="${id}"]`)
              ?.removeAttribute('data-native-upload'),
          id
        )
        .catch(() => undefined);
    }
  }
}
