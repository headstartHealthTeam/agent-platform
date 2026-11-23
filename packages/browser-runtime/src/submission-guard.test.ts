import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeTargetStructure } from './native-target.js';
import { blockedFormCounts, disableFormSubmission } from './submission-guard.js';

let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM(
    `<form method="post" action="/switch?private=secret">
    <input type="hidden" value="private-state"><input type="password" value="password-secret">
    <a id="context" href="javascript:__doPostBack('private-id','')" onclick="return true">Example group</a>
    <button type="submit">Complete enrollment</button></form>`,
    { url: 'https://payer.example' }
  );
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLFormElement', dom.window.HTMLFormElement);
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
});
afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('blocked portal transition evidence', () => {
  it.each(['submit', 'requestSubmit'] as const)(
    'refuses a non-configurable foreign %s before enabling draft interaction',
    (name) => {
      const prototype = dom.window.HTMLFormElement.prototype;
      const original: unknown = Object.getOwnPropertyDescriptor(prototype, name)?.value;
      Object.defineProperty(prototype, name, {
        value: original,
        configurable: false,
        writable: false,
      });
      Object.defineProperty(dom.window.document, '__headstartFormGuards', {
        value: Object.freeze({ [name]: original }),
      });
      expect(disableFormSubmission).toThrow('Cannot establish the form submission guard');
      expect(Object.getOwnPropertyDescriptor(prototype, name)?.value).toBe(original);
    }
  );
  it('reports direct postbacks, requestSubmit and submit events without allowing them', () => {
    disableFormSubmission();
    disableFormSubmission();
    const form = dom.window.document.forms[0];
    if (!form) throw new Error('Missing fixture form');
    expect(() => {
      form.submit();
    }).toThrow('Application submission is disabled');
    expect(() => {
      form.requestSubmit();
    }).toThrow('Application submission is disabled');
    const event = new dom.window.Event('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    expect(blockedFormCounts()).toEqual({ event: 1, submit: 1, requestSubmit: 1 });
    // Repeat installation and independent observations neither reset nor mutate evidence.
    const previous = blockedFormCounts();
    previous.submit = 999;
    disableFormSubmission();
    expect(blockedFormCounts()).toEqual({ event: 1, submit: 1, requestSubmit: 1 });
  });
  it('distinguishes the active script link from its form without returning private metadata', () => {
    dom.window.document.getElementById('context')?.focus();
    const metadata = nativeTargetStructure();
    expect(metadata).toEqual({
      hitTag: 'A',
      controlTag: 'A',
      inputType: null,
      linkKind: 'script',
      inlineClick: true,
      inlineDoubleClick: false,
      formMethod: 'post',
    });
    expect(JSON.stringify(metadata)).not.toMatch(/private|secret|__doPostBack|Example/);
  });
  it('reports zero counts for an uninstrumented document', () => {
    expect(blockedFormCounts()).toEqual({ event: 0, submit: 0, requestSubmit: 0 });
  });
  it('still prevents submission when a page predefines or freezes diagnostic state', () => {
    Object.defineProperty(dom.window.document, '__headstartBlockedForms', {
      value: Object.freeze({ event: 0, submit: 0, requestSubmit: 0 }),
      configurable: false,
    });
    disableFormSubmission();
    const form = dom.window.document.forms[0];
    if (!form) throw new Error('Missing fixture form');
    expect(form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }))).toBe(false);
    expect(() => {
      form.submit();
    }).toThrow();
  });
});
