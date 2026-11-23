import { File } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';

import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';

import {
  ObservedControls,
  allowedControl,
  type ControlDescription,
  type ObservedElement,
  type ObservedFrame,
  type ObservedPage,
  type ObservedCDP,
} from './observed-controls.js';

const observation = z.object({
  observationId: z.string(),
  targets: z.array(z.object({ targetId: z.string(), url: z.string() })),
  frames: z.array(
    z.object({
      controls: z.array(
        z.object({
          selector: z.string(),
          label: z.string(),
          href: z.string().nullable(),
          permittedKinds: z.array(z.string()),
        })
      ),
    })
  ),
});
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM(
    '<body><label>Practice name<input></label><label>Specialty<select><option value="">Choose</option><option value="behavioral">Behavioral</option></select></label><label>Original<input type="file"></label><a href="/documents?private=never-return">Documents</a><button type="submit">Submit</button><a href="/submit">Finalize</a><label>I certify<input type="checkbox"></label></body>',
    { url: 'https://payer.example/entry' }
  );
  const window = dom.window;
  for (const [name, value] of Object.entries({
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    HTMLFormElement: window.HTMLFormElement,
    Element: window.Element,
    Event: window.Event,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(window.HTMLElement.prototype, 'getClientRects', {
    value() {
      return [{}];
    },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get(this: HTMLElement) {
      return this.textContent;
    },
  });
});
afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

/** Structural transport doubles; the actual DOM callbacks execute unchanged. */
function harness(): {
  controls: ObservedControls;
  observe: () => Promise<z.infer<typeof observation>>;
  target: (label: string) => Promise<{ observationId: string; selector: string }>;
  page: ObservedPage;
  pages: ObservedPage[];
  handle: (node: Node) => ObservedElement;
  send: Mock<(method: string, input: unknown) => Promise<{ ok: boolean }>>;
  detach: Mock<() => Promise<void>>;
} {
  const handles = new Map<Node, ObservedElement>();
  function handle(node: Node): ObservedElement {
    const known = handles.get(node);
    if (known) return known;
    const element: ObservedElement = {
      evaluate: async (function_, argument = '') => await function_(node, argument),
      select: vi.fn(async (value: string) => {
        if (!(node instanceof dom.window.HTMLSelectElement)) throw new Error('not select');
        node.value = value;
        return [value];
      }),
      dispose: vi.fn(async () => undefined),
    };
    handles.set(node, element);
    return element;
  }
  const frame: ObservedFrame = {
    url: () => dom.window.location.href,
    $$: vi.fn(async () =>
      Array.from(dom.window.document.querySelectorAll('input, select, textarea, button, a')).map(
        handle
      )
    ),
    evaluate: async (function_) => await function_(),
    goto: vi.fn(async (url: string) => {
      dom.window.history.replaceState(null, '', url);
      return { status: () => 200 };
    }),
  };
  const send = vi.fn(async (method: string, input: unknown) => {
    expect(method).toBe('Browserless.uploadFile');
    const params = z
      .object({
        selector: z.string(),
        files: z.array(z.object({ name: z.string(), content: z.string(), mimeType: z.string() })),
      })
      .parse(input);
    const node = dom.window.document.querySelector(params.selector);
    if (!node) throw new Error('missing file control');
    Object.defineProperty(node, 'files', {
      configurable: true,
      value: params.files.map(
        (file) =>
          new File([Buffer.from(file.content, 'base64')], file.name, { type: file.mimeType })
      ),
    });
    node.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    return { ok: true };
  });
  const detach = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const cdp: ObservedCDP = { send, detach };
  const page: ObservedPage = {
    url: () => frame.url(),
    frames: () => [frame],
    mainFrame: () => frame,
    bringToFront: vi.fn(async () => undefined),
    createCDPSession: async () => cdp,
    screenshot: async () => 'synthetic',
  };
  const pages = [page];
  const browser = { pages: async (): Promise<ObservedPage[]> => pages };
  const controls = new ObservedControls(browser, page);
  const observe = async (): Promise<z.infer<typeof observation>> =>
    observation.parse(JSON.parse(await controls.inspectText()));
  const target = async (label: string): Promise<{ observationId: string; selector: string }> => {
    const found = await observe();
    const control = found.frames
      .flatMap((item) => item.controls)
      .find((item) => item.label.includes(label));
    if (!control) throw new Error('Missing observed control');
    return { observationId: found.observationId, selector: control.selector };
  };
  return { controls, observe, target, page, pages, send, detach, handle };
}

describe('observation-bound portal controls', () => {
  it('skips an SVG anchor and private fields without accessing their values or losing ordinary HTML controls', async () => {
    const body = dom.window.document.body;
    body.insertAdjacentHTML(
      'afterbegin',
      '<svg><a href="/logo"><text>Linked logo</text></a></svg><input type="password"><input autocomplete="section-login ONE-TIME-CODE"><input type="hidden">'
    );
    const h = harness();
    const svg = body.querySelector('svg a');
    if (!svg) throw new Error('Missing SVG fixture');
    const privateInputs = body.querySelectorAll(
      'input[type=password], input[autocomplete], input[type=hidden]'
    );
    const disposed = [svg, ...privateInputs].map((element) =>
      vi.spyOn(h.handle(element), 'dispose')
    );
    const getter = vi.fn(() => 'private-synthetic-value');
    privateInputs.forEach((input) => Object.defineProperty(input, 'value', { get: getter }));
    const json = await h.controls.inspectText();
    const controls = observation.parse(JSON.parse(json)).frames.flatMap((frame) => frame.controls);
    expect(controls.some((control) => control.label === 'Documents')).toBe(true);
    expect(controls.some((control) => control.label === 'Linked logo')).toBe(false);
    for (const dispose of disposed) expect(dispose).toHaveBeenCalledOnce();
    expect(getter).not.toHaveBeenCalled();
    expect(json).not.toContain('private-synthetic-value');
  });
  it('disposes surplus handles without calling describe beyond the visible control limit', async () => {
    const h = harness();
    dom.window.document.body.innerHTML = '<input>'.repeat(152);
    const nodes = dom.window.document.querySelectorAll('input');
    const extra = nodes[150];
    if (!extra) throw new Error('Missing surplus fixture');
    const evaluate = vi.spyOn(h.handle(extra), 'evaluate');
    const dispose = vi.spyOn(h.handle(extra), 'dispose');
    expect((await h.observe()).frames[0]?.controls).toHaveLength(150);
    expect(evaluate).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('advertises only navigation and uploads that can be dispatched for the observed frame and destination', async () => {
    const h = harness();
    dom.window.document.body.insertAdjacentHTML(
      'beforeend',
      '<a href="https://different.example/">External</a>'
    );
    const main = h.page.mainFrame();
    vi.spyOn(h.page, 'frames').mockReturnValue([main, { ...main }]);
    const { frames } = await h.observe();
    expect(
      frames[0]?.controls.find((control) => control.label === 'Original')?.permittedKinds
    ).toEqual(['upload']);
    expect(
      frames[1]?.controls.find((control) => control.label === 'Original')?.permittedKinds
    ).toEqual([]);
    for (const frame of frames) {
      expect(
        frame.controls.find((control) => control.label === 'External')?.permittedKinds
      ).toEqual([]);
      expect(
        frame.controls.find((control) => control.label === 'Documents')?.permittedKinds
      ).toEqual(['navigate']);
    }
  });
  it('blocks implicit submit events and native form.submit/requestSubmit after handoff', async () => {
    const form = dom.window.document.createElement('form');
    dom.window.document.body.append(form);
    const submit = vi.fn();
    form.addEventListener('submit', submit);
    await harness().observe();
    expect(
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    ).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(() => {
      form.submit();
    }).toThrow('submission is disabled');
    expect(() => {
      form.requestSubmit();
    }).toThrow('submission is disabled');
  });
  it('exposes anonymous controls and opaque identities, redacting URL query capabilities', async () => {
    const h = harness();
    const value = await h.observe();
    const links = value.frames[0]?.controls;
    expect(links?.find((control) => control.label === 'Documents')).toMatchObject({
      href: 'https://payer.example/documents',
      permittedKinds: ['navigate'],
    });
    expect(links?.find((control) => control.label === 'Submit')?.permittedKinds).toEqual([]);
    expect(links?.find((control) => control.label === 'I certify')?.permittedKinds).toEqual([]);
    expect(JSON.stringify(value)).not.toContain('never-return');
    await h.observe();
    expect((await h.observe()).observationId).not.toBe(value.observationId);
  });
  it('fills and selects exact values, then reads native control state without pressing Enter', async () => {
    const h = harness();
    await h.controls.act({
      kind: 'fill',
      ...(await h.target('Practice name')),
      value: 'Reviewed practice',
      approvedOrigin: 'https://payer.example',
    });
    expect(h.controls.readback()).toEqual({ kind: 'fill', matched: true });
    expect(dom.window.document.querySelector('input')?.value).toBe('Reviewed practice');
    await h.controls.act({ kind: 'select', ...(await h.target('Specialty')), value: 'behavioral' });
    expect(h.controls.readback()).toEqual({ kind: 'select', matched: true });
  });
  it('navigates only a freshly observed same-origin anchor, without running click handlers', async () => {
    const h = harness();
    const click = vi.fn();
    dom.window.document.querySelector('a')?.addEventListener('click', click);
    const action = { kind: 'navigate' as const, ...(await h.target('Documents')) };
    await h.controls.act(action);
    expect(click).not.toHaveBeenCalled();
    expect(dom.window.location.pathname).toBe('/documents');
    await expect(h.controls.validate(action)).rejects.toMatchObject({ code: 'invalid_action' });
  });
  it('rejects stale observations, changed elements, unapproved origins and free-form clicks', async () => {
    const h = harness();
    const action = {
      kind: 'fill' as const,
      ...(await h.target('Practice name')),
      value: 'Reviewed',
    };
    await h.observe();
    await expect(h.controls.validate(action)).rejects.toThrow();
    const current = { ...action, ...(await h.target('Practice name')) };
    dom.window.document.querySelector('input')?.setAttribute('readonly', '');
    await expect(h.controls.validate(current)).rejects.toThrow();
    dom.window.document.querySelector('input')?.removeAttribute('readonly');
    await expect(
      h.controls.validate({
        ...current,
        ...(await h.target('Practice name')),
        approvedOrigin: 'https://different.example',
      })
    ).rejects.toThrow();
    await expect(h.controls.validate({ kind: 'click', selector: '#submit' })).rejects.toThrow();
  });
  it('rejects newlines, unavailable select options and protected/foreign navigation', async () => {
    const h = harness();
    await expect(
      h.controls.validate({
        kind: 'fill',
        ...(await h.target('Practice name')),
        value: 'text\nsubmit',
      })
    ).rejects.toThrow();
    await expect(
      h.controls.validate({ kind: 'select', ...(await h.target('Specialty')), value: 'missing' })
    ).rejects.toThrow();
    await expect(
      h.controls.validate({ kind: 'navigate', ...(await h.target('Finalize')) })
    ).rejects.toThrow();
    dom.window.document.querySelector('a')?.setAttribute('href', 'https://elsewhere.example/entry');
    await expect(
      h.controls.validate({ kind: 'navigate', ...(await h.target('Documents')) })
    ).rejects.toThrow();
  });
  it('uploads documented base64 bytes and verifies the selected original digest, size and name', async () => {
    const h = harness();
    const bytes = Buffer.from('Exact synthetic original');
    const file = {
      name: 'original.txt',
      content: bytes.toString('base64'),
      mimeType: 'text/plain',
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    };
    await h.controls.act({ kind: 'upload', ...(await h.target('Original')), files: [file] });
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.controls.readback()).toEqual({
      kind: 'upload',
      matched: true,
      files: [{ name: file.name, digest: file.digest, bytes: bytes.length }],
    });
    expect(h.detach).toHaveBeenCalledOnce();
    expect(dom.window.document.querySelector('input[type=file]')?.outerHTML).not.toContain(
      'data-headstart-upload'
    );
  });
  it('rejects changed bytes, unsafe filenames, noncanonical base64 and multiple-file substitution before CDP', async () => {
    const h = harness();
    const file = {
      name: 'original.txt',
      content: 'eA==',
      mimeType: 'text/plain',
      digest: `sha256:${createHash('sha256').update('x').digest('hex')}`,
    };
    for (const files of [
      [{ ...file, digest: `sha256:${'a'.repeat(64)}` }],
      [{ ...file, name: '../private.txt' }],
      [{ ...file, content: 'eA' }],
      [file, file],
    ]) {
      await expect(
        h.controls.validate({ kind: 'upload', ...(await h.target('Original')), files })
      ).rejects.toThrow();
    }
    expect(h.send).not.toHaveBeenCalled();
  });
  it('marks an unconfirmed upload uncertain and does not replay it', async () => {
    const h = harness();
    const send = h.send.getMockImplementation();
    if (!send) throw new Error('Missing upload transport');
    h.send.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error('Upload acknowledgement lost');
    });
    h.detach.mockRejectedValueOnce(new Error('Detach failed'));
    const input = dom.window.document.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('Missing file input');
    const changed = vi.fn();
    input.addEventListener('change', changed);
    const file = {
      name: 'original.txt',
      content: 'eA==',
      mimeType: 'text/plain',
      digest: `sha256:${createHash('sha256').update('x').digest('hex')}`,
    };
    const action = { kind: 'upload' as const, ...(await h.target('Original')), files: [file] };
    await expect(h.controls.act(action)).rejects.toThrow('Upload acknowledgement lost');
    expect(input.outerHTML).not.toContain('data-headstart-upload-');
    expect(input.files?.[0]?.name).toBe(file.name);
    await expect(h.controls.validate(action)).rejects.toThrow();
    await expect(h.controls.act(action)).rejects.toThrow();
    expect(h.send).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(input.files?.[0]?.name).toBe(file.name);
  });
  it('leaves no upload marker or file operation if opening the CDP session fails', async () => {
    const h = harness();
    vi.spyOn(h.page, 'createCDPSession').mockRejectedValueOnce(new Error('CDP unavailable'));
    const file = {
      name: 'original.txt',
      content: 'eA==',
      mimeType: 'text/plain',
      digest: `sha256:${createHash('sha256').update('x').digest('hex')}`,
    };
    await expect(
      h.controls.act({ kind: 'upload', ...(await h.target('Original')), files: [file] })
    ).rejects.toThrow('CDP unavailable');
    expect(dom.window.document.querySelector('input[type=file]')?.outerHTML).not.toContain(
      'data-headstart-upload-'
    );
    expect(h.send).not.toHaveBeenCalled();
  });
  it('switches only observed same-origin targets and consumes their observation', async () => {
    const h = harness();
    const second = { ...h.page, bringToFront: vi.fn(async () => undefined) };
    h.pages.push(second);
    const obs = await h.observe();
    const id = obs.targets[1]?.targetId;
    if (!id) throw new Error('No second target');
    await h.controls.act({ kind: 'target', observationId: obs.observationId, targetId: id });
    expect(second.bringToFront).toHaveBeenCalledOnce();
    expect(h.controls.currentPage()).toBe(second);
    await expect(
      h.controls.validate({ kind: 'target', observationId: obs.observationId, targetId: id })
    ).rejects.toThrow();
  });
  it('does not advertise scripts, declarations, hidden fields or generic buttons as safe', () => {
    const base: ControlDescription = {
      tag: 'input',
      type: 'text',
      label: 'Name',
      value: '',
      disabled: false,
      visible: true,
      href: null,
      scripted: false,
      multiple: false,
      options: [],
    };
    for (const kind of ['fill', 'select', 'upload', 'navigate', 'click'] as const) {
      expect(allowedControl({ ...base, label: 'Signature' }, kind)).toBe(false);
      expect(allowedControl({ ...base, visible: false }, kind)).toBe(false);
    }
    expect(
      allowedControl(
        { ...base, tag: 'a', href: 'https://payer.example/next', scripted: true },
        'navigate'
      )
    ).toBe(false);
    expect(allowedControl({ ...base, tag: 'button', label: 'Continue' }, 'navigate')).toBe(false);
  });
});
