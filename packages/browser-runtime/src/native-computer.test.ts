import { File } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { JSDOM } from 'jsdom';
import puppeteer, { type Page } from 'puppeteer-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeBrowserComputer } from './native-computer.js';
import {
  browserDialog,
  dispatchWithDialogs,
  observeBrowserDialogs,
  readWithDialogs,
  respondToBrowserDialog,
  trackBrowserDialogClosure,
} from './native-dialog.js';
import { nativeTarget, nativeTargetStructure } from './native-target.js';

const chrome = vi.hoisted(() => ({ newPage: vi.fn() }));
vi.mock('puppeteer-core', () => ({
  default: { connect: async (): Promise<typeof chrome> => chrome },
}));
const origin = 'https://portal.example';
let dom: JSDOM;
let hit: Element | null;
const invoke = <Args extends unknown[], Result>(
  function_: (...args: Args) => Result,
  ...args: Args
): Result => function_(...args);
const surface = vi.fn(() => {
  const events = new EventEmitter();
  const cdp = Object.assign(new EventEmitter(), {
    detach: vi.fn(async () => undefined),
    send: vi.fn(
      async (
        method: string,
        params?: {
          selector?: string;
          files?: { content: string; name: string; mimeType: string }[];
        }
      ) => {
        if (method === 'Browserless.uploadFile' && params?.selector && params.files) {
          const input = document.querySelector(params.selector);
          if (!input) throw new Error('Missing synthetic input');
          Object.defineProperty(input, 'files', {
            configurable: true,
            value: params.files.map(
              (file) =>
                new File([Buffer.from(file.content, 'base64')], file.name, { type: file.mimeType })
            ),
          });
        }
        return { ok: true };
      }
    ),
  });
  const frame = {
    url: vi.fn(() => origin),
    evaluate: invoke,
    evaluateHandle: vi.fn(() => ({
      asElement: (): { contentFrame: () => Promise<null> } => ({
        contentFrame: async (): Promise<null> => null,
      }),
      dispose: vi.fn(),
    })),
  };
  const page = Object.assign(events, {
    url: vi.fn(() => origin + '/practice'),
    mainFrame: () => frame,
    mouse: { click: vi.fn(), move: vi.fn(), down: vi.fn(), up: vi.fn(), wheel: vi.fn() },
    keyboard: {
      down: vi.fn(),
      up: vi.fn(),
      sendCharacter: vi.fn((text: string) => {
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.value = text;
      }),
    },
    evaluate: invoke,
    screenshot: vi.fn(async () => 'cGl4ZWxz'),
    createCDPSession: async () => cdp,
    $eval: async <Result>(selector: string, function_: (element: Element) => Result) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('Missing test element');
      return function_(element);
    },
  });
  chrome.newPage.mockResolvedValue(page);
  return { page, frame, cdp };
});
async function fixture(): Promise<
  ReturnType<typeof surface> & { actual: Page; driver: NativeBrowserComputer }
> {
  const io = surface();
  const page = await (await puppeteer.connect({})).newPage();
  return { ...io, actual: page, driver: new NativeBrowserComputer(page, 'portal', origin) };
}
beforeEach(() => {
  dom = new JSDOM(
    '<body><form method="post"><label>Practice<input id="practice" aria-label="Practice"></label><textarea id="notes"></textarea><select id="state"><option>GA</option></select><input type="hidden" value="private-hidden"><input type="password" value="private-password"><input id="file" type="file"><a href="#next"><span>Next</span></a></form></body>',
    { url: origin }
  );
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
  vi.stubGlobal('HTMLSelectElement', dom.window.HTMLSelectElement);
  vi.stubGlobal('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
  vi.stubGlobal('HTMLFormElement', dom.window.HTMLFormElement);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('innerWidth', 1200);
  vi.stubGlobal('innerHeight', 760);
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    get(this: HTMLElement) {
      return this.textContent;
    },
  });
  hit = document.querySelector('#practice');
  Object.defineProperty(document, 'elementFromPoint', { value: () => hit });
});
afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('native browser controls on a fictional provider profile', () => {
  it.each(['new', 'existing'])('reads, edits and reopens a %s Headstart entry', async (kind) => {
    const { driver, page } = await fixture();
    const field = document.querySelector('#practice');
    if (!(field instanceof HTMLInputElement)) throw new Error('Missing practice');
    field.value = kind === 'existing' ? 'Previous location' : '';
    field.focus();
    await driver.act({ type: 'click', x: 1, y: 1, button: 'left' }, []);
    await driver.act({ type: 'keypress', keys: ['Control', 'a'] }, []);
    await driver.act({ type: 'type', text: 'Reviewed clinic' }, ['Reviewed clinic']);
    // The synthetic form persists on Save and repopulates the field on reopen.
    let saved = '';
    page.mouse.click.mockImplementationOnce(() => {
      saved = field.value;
      field.value = '';
    });
    await driver.act({ type: 'click', x: 2, y: 2, button: 'left' }, []);
    page.mouse.click.mockImplementationOnce(() => {
      field.value = saved;
    });
    await driver.act({ type: 'click', x: 3, y: 3, button: 'left' }, []);
    const result = await driver.inspect();
    expect(result.text).toContain('Reviewed clinic');
    expect(result.text).not.toContain('private-hidden');
    expect(result.text).not.toContain('private-password');
    expect(result.image).toMatch(/^data:image\/png/);
    expect(page.keyboard.sendCharacter).toHaveBeenCalledOnce();
  });
  it('dispatches pointer geometry and releases held modifiers after a failed gesture', async () => {
    const { driver, page } = await fixture();
    await driver.act({ type: 'double_click', x: 3, y: 4, keys: ['Shift'] }, []);
    expect(page.mouse.click).toHaveBeenCalledWith(3, 4, { count: 2 });
    await driver.act({ type: 'click', button: 'wheel', x: 3, y: 4 }, []);
    expect(page.mouse.click).toHaveBeenCalledWith(3, 4, { button: 'middle' });
    await driver.act({ type: 'move', x: 6, y: 4 }, []);
    await driver.act({ type: 'scroll', x: 4, y: 5, scroll_x: -1, scroll_y: 190 }, []);
    expect(page.mouse.wheel).toHaveBeenCalledWith({ deltaX: -1, deltaY: 190 });
    page.mouse.move
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Disconnected'));
    await expect(
      driver.act(
        {
          type: 'drag',
          keys: ['Shift'],
          path: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
        []
      )
    ).rejects.toThrow('Disconnected');
    expect(page.mouse.up).toHaveBeenCalledOnce();
    expect(page.keyboard.up).toHaveBeenCalledWith('Shift');
    await driver.act({ type: 'screenshot' }, []);
    await driver.act({ type: 'wait' }, []);
    await expect(driver.act({ type: 'move', x: 1200, y: 5 }, [])).rejects.toThrow(
      'outside browser'
    );
    expect(page.mouse.move).not.toHaveBeenCalledWith(1200, 5);
  });
  it('opens only the targeted frame and rejects typing in private or noneditable controls', async () => {
    const { driver, actual, frame, page } = await fixture();
    document.querySelector<HTMLInputElement>('input[type=password]')?.focus();
    await expect(driver.act({ type: 'type', text: 'example' }, [])).rejects.toThrow('editable');
    expect(page.keyboard.sendCharacter).not.toHaveBeenCalled();
    frame.url.mockReturnValue('https://other.example');
    await expect(driver.act({ type: 'click', button: 'left', x: 2, y: 2 }, [])).rejects.toThrow(
      'another destination'
    );
    await expect(driver.upload({ x: 2, y: 2 }, [])).rejects.toThrow('another destination');
    page.url.mockReturnValue('http://portal.example/');
    await expect(driver.inspect()).rejects.toThrow('reviewed portal');
    await expect(new NativeBrowserComputer(actual, 'portal').inspect()).rejects.toThrow(
      'authorized'
    );
    await expect(new NativeBrowserComputer(actual).inspect()).rejects.toThrow('authorized');
  });
  it('uses exact file bytes, reads the selected file and cleans the temporary handle', async () => {
    const { driver, cdp } = await fixture();
    hit = document.querySelector('#file');
    const body = Buffer.from('Fictional coverage proof');
    const file = {
      name: 'proof.txt',
      mimeType: 'text/plain',
      digest: 'sha256:' + createHash('sha256').update(body).digest('hex'),
      content: body.toString('base64'),
    };
    await driver.upload({ x: 4, y: 9 }, [file]);
    expect(cdp.send).toHaveBeenCalledWith(
      'Browserless.uploadFile',
      expect.objectContaining({
        files: [{ name: file.name, content: file.content, mimeType: file.mimeType }],
      })
    );
    expect(document.querySelector('[data-native-upload]')).toBeNull();
    await expect(driver.upload({ x: 4, y: 9 }, [{ ...file, digest: 'changed' }])).rejects.toThrow(
      'bytes changed'
    );
    await expect(driver.upload({ x: 4, y: 9 }, [file, file])).rejects.toThrow('No file input');
    if (!(hit instanceof HTMLInputElement)) throw new Error('Missing file control');
    hit.disabled = true;
    await expect(driver.upload({ x: 4, y: 9 }, [file])).rejects.toThrow('No file input');
    hit = document.body;
    await expect(driver.upload({ x: 4, y: 9 }, [file])).rejects.toThrow('No file input');
  });
  it('reads link structure and maps a nested frame relative to its enclosing box', async () => {
    const a = document.querySelector('a');
    if (!a) throw new Error('Missing link');
    hit = a.querySelector('span');
    for (const [href, kind] of [
      ['#next', 'fragment'],
      ['/locations', 'navigation'],
      ['javascript:void(0)', 'script'],
      ['', 'none'],
    ] as const) {
      a.setAttribute('href', href);
      expect(nativeTargetStructure({ x: 1, y: 1 })).toMatchObject({
        linkKind: kind,
        formMethod: 'post',
        hitTag: 'SPAN',
        controlTag: 'A',
      });
    }
    hit = null;
    expect(nativeTargetStructure({ x: 2, y: 3 }).hitTag).toBeNull();
    const leaf = {
      evaluateHandle: vi.fn(async () => ({ asElement: (): null => null, dispose: vi.fn() })),
    };
    const box = vi.fn(async () => ({ x: 20, y: 15 }));
    const dispose = vi.fn();
    const frameElement = { contentFrame: async (): Promise<typeof leaf> => leaf, boundingBox: box };
    const handle = { dispose, asElement: (): typeof frameElement => frameElement };
    const parent = {
      evaluateHandle: async (): Promise<typeof handle> => handle,
    };
    chrome.newPage.mockResolvedValue({ mainFrame: () => parent });
    const page = await (await puppeteer.connect({})).newPage();
    expect((await nativeTarget(page, { x: 40, y: 35 })).point).toEqual({ x: 20, y: 20 });
    await nativeTarget(page);
    expect(box).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
  it('handles a dialog after a native action exactly once, including an externally closed prompt', async () => {
    const { driver, cdp, actual } = await fixture();
    await driver.inspect();
    await dispatchWithDialogs(actual, async () => {
      cdp.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Save this draft?' });
    });
    const observed = await driver.inspect();
    expect(observed.pauseBatch).toBe(true);
    const dialog = browserDialog(actual);
    if (!dialog) throw new Error('No dialog');
    await expect(driver.validate({ type: 'move', x: 1, y: 2 }, [])).rejects.toThrow('Resolve');
    expect(await readWithDialogs(actual, async () => 42)).toEqual({ interrupted: true });
    await driver.act({ type: 'dialog', id: dialog.id, accept: true, promptText: null }, []);
    expect(cdp.send).toHaveBeenCalledWith('Page.handleJavaScriptDialog', { accept: true });
    await expect(
      driver.act({ type: 'dialog', id: dialog.id, accept: true, promptText: null }, [])
    ).rejects.toThrow('changed');
    cdp.emit('Page.javascriptDialogOpening', { type: 'prompt', message: 'Another prompt' });
    cdp.emit('Page.javascriptDialogClosed');
    expect(browserDialog(actual)).toBeNull();
  });
  it('returns interrupted reads without replay and preserves operator authority over first-observation dialogs', async () => {
    const { actual, page, cdp, driver } = await fixture();
    const dismiss = vi.fn(),
      accept = vi.fn();
    observeBrowserDialogs(actual);
    page.emit('dialog', { type: () => 'prompt', message: () => 'Private prompt', accept, dismiss });
    const first = browserDialog(actual);
    if (!first) throw new Error('Missing prompt');
    await expect(driver.inspect()).rejects.toThrow('private operator');
    await respondToBrowserDialog(actual, { id: first.id, accept: false, promptText: null });
    expect(dismiss).toHaveBeenCalledOnce();
    const read = vi.fn(async () => {
      cdp.emit('Page.javascriptDialogOpening', { type: 'alert', message: 'Portal notice' });
      return 1;
    });
    await trackBrowserDialogClosure(actual);
    expect(await readWithDialogs(actual, read)).toEqual({ interrupted: true });
    expect(read).toHaveBeenCalledOnce();
    page.emit('dialog', { type: () => 'prompt', message: () => '', accept, dismiss });
    expect(browserDialog(actual)?.type).toBe('alert');
    page.emit('close');
    expect(cdp.detach).toHaveBeenCalledOnce();
  });
});
