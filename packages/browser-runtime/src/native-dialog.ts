import { randomUUID } from 'node:crypto';

import type { Dialog, Page } from 'puppeteer-core';

const observed = new WeakSet<Page>();
const pending = new WeakMap<
  Page,
  {
    id: string;
    type: ReturnType<Dialog['type']>;
    message: string;
    respond: (accept: boolean, promptText: string | null) => Promise<void>;
  }
>();
const waiting = new WeakMap<Page, Set<() => void>>();
const dispatching = new WeakMap<Page, Promise<void>>();
const tracking = new WeakMap<Page, Promise<void>>();

/** Another CDP client (the private viewer) may answer a dialog. Puppeteer's Dialog.handled
 * only tracks replies through that instance, so listen for Chrome's actual close receipt. */
export async function trackBrowserDialogClosure(page: Page): Promise<void> {
  let ready = tracking.get(page);
  if (!ready) {
    ready = (async (): Promise<void> => {
      const cdp = await page.createCDPSession();
      // Both events use this same ordered CDP connection. Mixing Puppeteer's opening event
      // with another connection's close event can erase a newly opened follow-up dialog.
      cdp.on('Page.javascriptDialogOpening', (event) => {
        pending.set(page, {
          id: randomUUID(),
          type: event.type,
          message: event.message,
          respond: async (accept, promptText) => {
            await cdp.send('Page.handleJavaScriptDialog', {
              accept,
              ...(promptText === null ? {} : { promptText }),
            });
          },
        });
        notify(page);
      });
      cdp.on('Page.javascriptDialogClosed', () => pending.delete(page));
      page.on('close', () => {
        cdp.detach().catch(() => undefined);
      });
      await cdp.send('Page.enable');
    })();
    tracking.set(page, ready);
  }
  await ready;
}

/** Transport only: the agent or operator decides a dialog's meaning. Never auto-dismiss it. */
export function observeBrowserDialogs(page: Page): void {
  if (observed.has(page)) return;
  observed.add(page);
  page.on('dialog', (dialog) => {
    if (tracking.has(page)) return;
    pending.set(page, {
      id: randomUUID(),
      type: dialog.type(),
      message: dialog.message(),
      respond: async (accept, promptText) => {
        if (accept) await dialog.accept(promptText ?? undefined);
        else await dialog.dismiss();
      },
    });
    notify(page);
  });
}

function notify(page: Page): void {
  for (const listener of waiting.get(page) ?? []) listener();
}
function listen(page: Page, listener: () => void): () => void {
  let listeners = waiting.get(page);
  if (!listeners) {
    listeners = new Set();
    waiting.set(page, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A delayed JavaScript dialog can arrive during DOM/screenshot reads too. Read work has no
 * side effect to replay; return the observed dialog and retain a handler for the pending read. */
export async function readWithDialogs<T>(
  page: Page,
  operation: () => Promise<T>
): Promise<{ interrupted: true } | { interrupted: false; value: T }> {
  if (pending.has(page)) return { interrupted: true };
  let stopListening = (): void => undefined;
  const dialog = new Promise<{ interrupted: true }>((resolve) => {
    stopListening = listen(page, () => {
      resolve({ interrupted: true });
    });
  });
  const reading = operation().then((value) => ({ interrupted: false as const, value }));
  reading.catch(() => undefined);
  try {
    return await Promise.race([reading, dialog]);
  } finally {
    stopListening();
  }
}

/** Chrome may hold the input command open until its JS dialog is answered. Return that
 * observed dialog to the agent, retaining the original command rather than dispatching it twice. */
export async function dispatchWithDialogs(
  page: Page,
  operation: () => Promise<void>
): Promise<void> {
  let stopListening = (): void => undefined;
  const dialog = new Promise<void>((resolve) => {
    stopListening = listen(page, resolve);
  });
  const action = operation();
  dispatching.set(page, action);
  // Attach a rejection handler immediately; the next response still awaits the original promise.
  action.catch(() => undefined);
  try {
    await Promise.race([action, dialog]);
    if (!pending.has(page)) dispatching.delete(page);
  } finally {
    stopListening();
  }
}

export function browserDialog(
  page: Page
): { id: string; type: ReturnType<Dialog['type']>; message: string } | null {
  const item = pending.get(page);
  return item ? { id: item.id, type: item.type, message: item.message } : null;
}

export async function respondToBrowserDialog(
  page: Page,
  action: { id: string; accept: boolean; promptText: string | null }
): Promise<void> {
  const item = pending.get(page);
  if (item?.id !== action.id) throw new Error('Browser dialog changed');
  let stopListening = (): void => undefined;
  const nextDialog = new Promise<void>((resolve) => {
    stopListening = listen(page, resolve);
  });
  try {
    await item.respond(action.accept, action.promptText);
    if (pending.get(page) === item) pending.delete(page);
    await Promise.race([dispatching.get(page) ?? Promise.resolve(), nextDialog]);
    if (!pending.has(page)) dispatching.delete(page);
  } finally {
    stopListening();
  }
}
