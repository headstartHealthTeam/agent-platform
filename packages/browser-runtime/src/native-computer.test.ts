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
import { portalRequestCounts, screenPortalPage } from './portal-navigation.js';
import {
  nativeSyntheticReceipts,
  openNativeSyntheticPage,
  openReviewedSyntheticPage,
  syntheticOrigin,
} from './synthetic-page.js';

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
      ): Promise<unknown> => {
        if (method === 'DOM.getDocument') return { root: { localName: '#document' } };
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
    evaluateHandle: vi.fn(() => {
      const active = document.activeElement;
      return {
        evaluate: <T>(
          fun: (current: Element | null, bound: string | undefined) => T,
          bound: string | undefined
        ): T => fun(active, bound),
        asElement: (): { contentFrame: () => Promise<null> } => ({
          contentFrame: async (): Promise<null> => null,
        }),
        dispose: vi.fn(),
      };
    }),
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
    evaluate: async <Args extends unknown[], Result>(
      fun: (...args: Args) => Result,
      ...args: Args
    ) => fun(...args),
    screenshot: vi.fn(async () => 'cGl4ZWxz'),
    createCDPSession: vi.fn(async () => cdp),
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
  vi.stubGlobal('location', dom.window.location);
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
  it.each(['#practice', '#notes'])(
    'rejects read-only typing before validation or dispatch on %s',
    async (selector) => {
      const { driver, page } = await fixture();
      const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!field) throw new Error('Missing synthetic field');
      const action = { type: 'type', text: 'Example value' };
      field.focus();
      await driver.validate(action, []);
      field.readOnly = true;
      await expect(driver.validate(action, [])).rejects.toThrow('editable');
      await expect(driver.act(action, [])).rejects.toThrow('editable');
      expect(page.keyboard.sendCharacter).not.toHaveBeenCalled();
      field.readOnly = false;
      await driver.act(action, []);
      expect(page.keyboard.sendCharacter).toHaveBeenCalledWith(action.text);
    }
  );
  it('still accepts typing into a focused contenteditable region', async () => {
    const { driver, page } = await fixture();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    // jsdom does not implement the browser's computed isContentEditable property.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.append(editable);
    editable.focus();
    await driver.act({ type: 'type', text: 'Synthetic note' }, []);
    expect(page.keyboard.sendCharacter).toHaveBeenCalledWith('Synthetic note');
  });
  it('tracks draft and final fixture requests separately on the actual interception path', async () => {
    const { actual, page } = await fixture();
    const navigation = Object.assign(page, {
      setBypassServiceWorker: vi.fn(),
      setRequestInterception: vi.fn(),
      goto: vi.fn(),
    });
    const send = (
      path: string,
      method = 'GET',
      fail = false
    ): ReturnType<typeof vi.fn<() => Promise<void>>> => {
      const respond = vi.fn(async (): Promise<void> => {
        if (fail) throw new Error('Closed synthetic tab');
      });
      page.emit('request', {
        url: (): string => syntheticOrigin + path,
        method: (): string => method,
        isInterceptResolutionHandled: (): boolean => false,
        respond,
        fetchPostData: async (): Promise<string> => '{"field":"fictional"}',
      });
      return respond;
    };
    expect(nativeSyntheticReceipts(actual)).toBeUndefined();
    await openReviewedSyntheticPage(actual, 'Review example');
    expect(send('/review')).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Review example' })
    );
    send('/entry', 'GET', true);
    page.removeAllListeners('request');
    await openNativeSyntheticPage(actual, 'Native example');
    const draft = send('/draft-save', 'POST');
    await vi.waitFor(() => {
      expect(draft).toHaveBeenCalledOnce();
    });
    expect(nativeSyntheticReceipts(actual)).toEqual({ draftWrites: 1, finalAttempts: 0 });
    send('/final-submit', 'POST', true);
    expect(nativeSyntheticReceipts(actual)).toEqual({ draftWrites: 1, finalAttempts: 1 });
    expect(navigation.goto).toHaveBeenCalledTimes(2);
  });
  it('keeps a page unavailable after interception setup fails', async () => {
    const { actual, page } = await fixture();
    const screen = Object.assign(page, {
      setBypassServiceWorker: vi.fn(),
      setRequestInterception: vi.fn(),
    });
    screen.setRequestInterception.mockImplementationOnce(async () => {
      expect(page.listenerCount('request')).toBe(1);
      throw new Error('Synthetic setup interrupted');
    });
    await expect(screenPortalPage(actual)).rejects.toThrow('Synthetic setup interrupted');
    expect(page.listenerCount('request')).toBe(0);
    await expect(screenPortalPage(actual)).rejects.toThrow('Synthetic setup interrupted');
    expect(screen.setRequestInterception).toHaveBeenCalledOnce();
  });
  it('shares successful screening and records a denied destination even when the tab closes', async () => {
    const { actual, page } = await fixture();
    const screen = Object.assign(page, {
      setBypassServiceWorker: vi.fn(),
      setRequestInterception: vi.fn(),
    });
    await Promise.all([screenPortalPage(actual), screenPortalPage(actual)]);
    expect(screen.setRequestInterception).toHaveBeenCalledOnce();
    expect(page.listenerCount('request')).toBe(1);
    const abort = vi.fn(async (): Promise<void> => {
      throw new Error('Closed synthetic tab');
    });
    page.emit('request', {
      url: (): string => 'about:blank',
      isInterceptResolutionHandled: (): boolean => false,
      abort,
    });
    await vi.waitFor(() => {
      expect(abort).toHaveBeenCalledOnce();
    });
    expect(portalRequestCounts(actual)).toEqual({ destination: 1 });
  });
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
    const box = vi.fn(async () => ({ content: [{ x: 28, y: 19 }], border: [{ x: 20, y: 15 }] }));
    const dispose = vi.fn();
    const frameElement = { contentFrame: async (): Promise<typeof leaf> => leaf, boxModel: box };
    const handle = { dispose, asElement: (): typeof frameElement => frameElement };
    const parent = {
      evaluateHandle: async (): Promise<typeof handle> => handle,
    };
    chrome.newPage.mockResolvedValue({ mainFrame: () => parent });
    const page = await (await puppeteer.connect({})).newPage();
    expect((await nativeTarget(page, { x: 40, y: 35 })).point).toEqual({ x: 12, y: 16 });
    await nativeTarget(page);
    expect(box).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
  it('keeps fallback dialogs observed during setup and retries a failed tracker without a stale dispatch', async () => {
    const { page, actual, cdp } = await fixture();
    observeBrowserDialogs(actual);
    cdp.send.mockRejectedValueOnce(new Error('Synthetic enable failure'));
    const first = trackBrowserDialogClosure(actual);
    const dismiss = vi.fn(async () => undefined);
    page.emit('dialog', { type: () => 'alert', message: () => 'Synthetic modal', dismiss });
    await expect(first).rejects.toThrow('enable failure');
    expect(cdp.detach).toHaveBeenCalledOnce();
    const early = browserDialog(actual);
    if (!early) throw new Error('Missing early dialog');
    await respondToBrowserDialog(actual, { id: early.id, accept: false, promptText: null });
    expect(dismiss).toHaveBeenCalledOnce();
    await trackBrowserDialogClosure(actual);
    await expect(
      dispatchWithDialogs(actual, async () => {
        throw new Error('Synthetic input failure');
      })
    ).rejects.toThrow('input failure');
    cdp.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Continue draft?' });
    const later = browserDialog(actual);
    if (!later) throw new Error('Missing second dialog');
    await respondToBrowserDialog(actual, { id: later.id, accept: false, promptText: null });
    expect(browserDialog(actual)).toBeNull();
  });
  it('declines typing when focus changes between resolving the input and sending its text', async () => {
    const { driver, frame, page } = await fixture();
    document.querySelector<HTMLInputElement>('#practice')?.focus();
    const original = frame.evaluateHandle.getMockImplementation();
    if (!original) throw new Error('Missing fake frame');
    let resolutions = 0;
    frame.evaluateHandle.mockImplementation(() => {
      const result = original();
      if (++resolutions === 3) document.querySelector<HTMLTextAreaElement>('#notes')?.focus();
      return result;
    });
    await expect(driver.act({ type: 'type', text: 'Synthetic draft' }, [])).rejects.toThrow(
      'focused editable'
    );
    expect(page.keyboard.sendCharacter).not.toHaveBeenCalled();
  });
  it('never types an OTP and clears upload markers when establishing CDP fails', async () => {
    const { page, driver } = await fixture();
    const field = document.querySelector<HTMLInputElement>('#practice');
    if (!field) throw new Error('Missing field');
    field.autocomplete = 'one-time-code';
    field.value = 'fictional-one-time-code';
    field.focus();
    expect((await driver.inspect()).text).not.toContain(field.value);
    await expect(driver.act({ type: 'type', text: 'Example' }, [])).rejects.toThrow('editable');
    expect(page.keyboard.sendCharacter).not.toHaveBeenCalled();
    hit = document.querySelector('#file');
    page.createCDPSession.mockRejectedValueOnce(new Error('Synthetic connection failure'));
    await expect(driver.upload({ x: 2, y: 2 }, [])).rejects.toThrow('connection failure');
    expect(document.querySelector('[data-native-upload]')).toBeNull();
  });
  it('handles a dialog after a native action exactly once, including an externally closed prompt', async () => {
    const { driver, cdp, actual } = await fixture();
    driver.finishObservation(await driver.inspect(), true);
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
  it('releases only attempted keys in reverse order when a down acknowledgement is lost', async () => {
    const { driver, page } = await fixture();
    page.keyboard.down
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Acknowledgement lost'));
    await expect(
      driver.act({ type: 'keypress', keys: ['Control', 'Shift', 'a'] }, [])
    ).rejects.toThrow('Acknowledgement lost');
    expect(page.keyboard.down.mock.calls).toEqual([['Control'], ['Shift']]);
    expect(page.keyboard.up.mock.calls).toEqual([['Shift'], ['Control']]);
  });

  it('checks the selected tab at the point of dispatch', async () => {
    const { actual, page, frame } = await fixture();
    const otherTab = (await fixture()).actual;
    let selected = actual;
    const driver = new NativeBrowserComputer(actual, 'portal', origin, () => {
      if (selected !== actual) throw new Error('Tab changed while preparing action');
    });
    const action = { type: 'click', button: 'left', x: 2, y: 2, keys: ['Shift'] };
    await driver.validate(action, []);
    const getHandle = frame.evaluateHandle.getMockImplementation();
    if (!getHandle) throw new Error('Missing synthetic target');
    frame.evaluateHandle.mockImplementationOnce(() => {
      selected = otherTab;
      return getHandle();
    });
    await expect(driver.act(action, [])).rejects.toThrow('Tab changed');
    expect(selected).toBe(otherTab);
    expect(page.keyboard.down).not.toHaveBeenCalled();
    expect(page.keyboard.up).not.toHaveBeenCalled();
    expect(page.mouse.click).not.toHaveBeenCalled();
  });
  it('retains only an accepted observation for paused dialogs', async () => {
    const { driver, page, cdp } = await fixture();
    const approved = driver.finishObservation(await driver.inspect(), true);
    page.screenshot.mockResolvedValueOnce('second-synthetic-capture');
    const candidate = await driver.inspect();
    expect(candidate.image).not.toBe(approved.image);
    expect(() => driver.finishObservation(candidate, false)).toThrow('human_control');
    cdp.emit('Page.javascriptDialogOpening', { type: 'alert', message: 'Synthetic notice' });
    expect((await driver.inspect()).image).toBe(approved.image);
  });
  it('discards pixels when a private field appears during capture and disappears before readback', async () => {
    const { driver, page, cdp } = await fixture();
    const accepted = driver.finishObservation(await driver.inspect(), true);
    page.screenshot.mockImplementation(async () => {
      cdp.emit('DOM.attributeModified', { name: 'autocomplete', value: 'one-time-code' });
      cdp.emit('DOM.attributeRemoved', { name: 'autocomplete' });
      return 'frame-with-private-input';
    });
    await expect(driver.inspect()).rejects.toMatchObject({ code: 'read_failed' });
    cdp.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Synthetic dialog' });
    const paused = await driver.inspect();
    expect(paused.image).toBe(accepted.image);
    cdp.emit('Page.javascriptDialogClosed');
    expect(() => driver.finishObservation(paused, true)).toThrow('read_failed');
    page.screenshot.mockResolvedValue('new-safe-observation');
    expect(driver.finishObservation(await driver.inspect(), true).pauseBatch).toBeUndefined();
  });
  it('returns only fresh safe pixels after a transient private field and permits unrelated visible text updates', async () => {
    const { driver, page, cdp } = await fixture();
    page.screenshot
      .mockImplementationOnce(async () => {
        cdp.emit('DOM.childNodeInserted', {
          node: { localName: 'input', attributes: ['type', 'password'] },
        });
        return 'unsafe-first-capture';
      })
      .mockImplementationOnce(async () => {
        cdp.emit('DOM.childNodeInserted', {
          node: { localName: '#text', nodeValue: 'Updated draft status' },
        });
        return 'safe-second-capture';
      });
    const result = driver.finishObservation(await driver.inspect(), true);
    expect(result.image).toBe('data:image/png;base64,safe-second-capture');
    expect(page.screenshot).toHaveBeenCalledTimes(2);
  });
  it('captures no pixels with a password inside a shadow tree and discards pixels when the frame tree changes', async () => {
    const { driver, page, cdp, actual } = await fixture();
    await trackBrowserDialogClosure(actual);
    const root = {
      localName: 'form',
      shadowRoots: [
        {
          localName: '#document-fragment',
          children: [{ localName: 'input', attributes: ['type', 'password'] }],
        },
      ],
    };
    cdp.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ root })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ metrics: [{ name: 'LayoutCount', value: 1 }] })
      .mockResolvedValueOnce({ model: {} });
    await expect(driver.inspect()).rejects.toMatchObject({
      code: 'human_control',
      phase: 'authentication',
    });
    expect(page.screenshot).not.toHaveBeenCalled();
    page.screenshot.mockImplementation(async () => {
      page.emit('frameattached');
      page.emit('framedetached');
      return 'frame-with-uninspected-content';
    });
    await expect(driver.inspect()).rejects.toMatchObject({ code: 'read_failed' });
  });
  it('returns interrupted reads without replay and preserves operator authority over first-observation dialogs', async () => {
    const { actual, page, cdp, driver } = await fixture();
    const dismiss = vi.fn(),
      accept = vi.fn();
    observeBrowserDialogs(actual);
    page.emit('dialog', { type: () => 'prompt', message: () => 'Private prompt', accept, dismiss });
    const first = browserDialog(actual);
    if (!first) throw new Error('Missing prompt');
    await expect(driver.inspect()).rejects.toMatchObject({
      code: 'human_control',
      phase: 'handoff-observation',
    });
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
