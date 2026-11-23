import type { Protocol } from 'devtools-protocol';
import { ProtocolError, type CDPSession, type Page } from 'puppeteer-core';

import { BrowserSessionError } from './session.js';

function authenticationAttribute(name: string | undefined, value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return (
    (name === 'type' && normalized === 'password') ||
    (name === 'autocomplete' && normalized?.split(/\s+/).includes('one-time-code') === true)
  );
}

function authenticationInput(node: Protocol.DOM.Node): boolean {
  if (node.localName !== 'input') return false;
  const attributes = node.attributes ?? [];
  for (let index = 0; index < attributes.length; index += 2) {
    if (authenticationAttribute(attributes.at(index), attributes.at(index + 1))) return true;
  }
  return false;
}

function* tree(root: Protocol.DOM.Node): Generator<Protocol.DOM.Node> {
  const pending = [root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    yield node;
    if (node.contentDocument) pending.push(node.contentDocument);
    for (const child of node.children ?? []) pending.push(child);
    for (const shadow of node.shadowRoots ?? []) pending.push(shadow);
    // A <template>'s content is inert. Inserting its clone emits an ordinary DOM insertion.
  }
}

async function layoutCount(client: CDPSession): Promise<number> {
  const { metrics } = await client.send('Performance.getMetrics');
  const count = metrics.find((metric) => metric.name === 'LayoutCount')?.value;
  if (count === undefined) throw new BrowserSessionError('read_failed');
  return count;
}

function observeChanges(client: CDPSession, invalidate: () => void): void {
  client.on('DOM.documentUpdated', invalidate);
  client.on('DOM.childNodeCountUpdated', invalidate);
  client.on('DOM.shadowRootPushed', invalidate);
  client.on('DOM.attributeModified', ({ name, value }) => {
    if (authenticationAttribute(name, value)) invalidate();
  });
  client.on('DOM.childNodeInserted', ({ node }) => {
    for (const element of tree(node))
      if (
        authenticationInput(element) ||
        (element.childNodeCount ?? 0) > (element.children?.length ?? 0) ||
        (element.frameId && !element.contentDocument)
      ) {
        invalidate();
        return;
      }
  });
}

async function hiddenLayout(
  client: CDPSession,
  nodes: Protocol.DOM.Node[]
): Promise<number | undefined> {
  const sensitive = nodes.filter(authenticationInput);
  if (!sensitive.length) return;
  await client.send('Performance.enable');
  const count = await layoutCount(client);
  for (const node of sensitive) {
    try {
      await client.send('DOM.getBoxModel', { nodeId: node.nodeId });
    } catch (error) {
      // display:none has no layout box. It cannot start painting without a new layout.
      if (
        error instanceof ProtocolError &&
        error.originalMessage === 'Could not compute box model.'
      )
        continue;
      throw error;
    }
    throw new BrowserSessionError('human_control', 'authentication');
  }
  return count;
}

/** A Chromium out-of-process iframe is a separate target. Check its root frame identity.
 * An unsupported or detached target makes the capture unavailable. */
async function childRenderer(
  main: CDPSession,
  frameId: string,
  children: string[]
): Promise<CDPSession> {
  const { sessionId } = await main.send('Target.attachToTarget', {
    targetId: frameId,
    flatten: true,
  });
  children.push(sessionId);
  const child = main.connection()?.session(sessionId);
  if (!child || (await child.send('Page.getFrameTree')).frameTree.frame.id !== frameId)
    throw new BrowserSessionError('read_failed');
  return child;
}

/** Chrome only reports mutations for trees requested by this client. Inspect closed shadows and
 * nested renderers, then flush each renderer's ordered events before accepting this image. */
async function tryCapture(page: Page): Promise<string | null> {
  let changed = false;
  const changedDuringCapture = (): boolean => changed;
  const invalidate = (): void => {
    changed = true;
  };
  const main = await page.createCDPSession();
  const children: string[] = [];
  page.on('frameattached', invalidate);
  page.on('framedetached', invalidate);
  page.on('framenavigated', invalidate);
  try {
    const clients = [main];
    const hidden = new Map<CDPSession, number>();
    const inspectedFrames = new Set<string>();
    for (const client of clients) {
      await client.send('DOM.enable');
      observeChanges(client, invalidate);
      const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
      const nodes = [...tree(root)];
      const layout = await hiddenLayout(client, nodes);
      if (layout !== undefined) hidden.set(client, layout);
      for (const node of nodes) {
        if (!node.frameId || node.contentDocument || inspectedFrames.has(node.frameId)) continue;
        inspectedFrames.add(node.frameId);
        clients.push(await childRenderer(main, node.frameId, children));
      }
    }
    if (changedDuringCapture()) return null;
    const pixels = await page.screenshot({ type: 'png', encoding: 'base64' });
    for (const client of clients) {
      // Commands on each renderer are ordered after its DOM events during capture.
      await client.send('DOM.getDocument', { depth: 0 });
      if (hidden.has(client) && (await layoutCount(client)) !== hidden.get(client)) invalidate();
    }
    return changedDuringCapture() ? null : pixels;
  } finally {
    page.off('frameattached', invalidate);
    page.off('framedetached', invalidate);
    page.off('framenavigated', invalidate);
    await Promise.all(
      children.map((sessionId) =>
        main.send('Target.detachFromTarget', { sessionId }).catch(() => undefined)
      )
    );
    await main.detach().catch(() => undefined);
  }
}

/** Drop a changed capture and reread once. Dynamic page changes never validate earlier pixels. */
export async function portalScreenshot(page: Page): Promise<string> {
  const image = (await tryCapture(page)) ?? (await tryCapture(page));
  if (image === null) throw new BrowserSessionError('read_failed');
  return image;
}
