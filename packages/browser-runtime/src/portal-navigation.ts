import type { HTTPRequest, Page } from 'puppeteer-core';

import { publicOriginAllowed } from './public-origin.js';
import { BrowserSessionError } from './session.js';

/** Operator-selected public starting URL; never an authenticated link or a model-selected target. */
export function portalUrl(input: string): URL {
  try {
    if (!input || input.length > 2048 || input.trim() !== input) throw new Error();
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port)
      throw new Error();
    return url;
  } catch {
    throw new BrowserSessionError('invalid_action');
  }
}

/** Each intercepted request, including redirects, is screened before continuation.
 * Provider network isolation remains required; local DNS is not a remote egress firewall.
 */
export async function routePortalRequest(
  request: Pick<HTTPRequest, 'url' | 'isInterceptResolutionHandled' | 'abort' | 'continue'> &
    Partial<Pick<HTTPRequest, 'method'>>,
  allowed: (origin: string) => Promise<boolean> = publicOriginAllowed,
  blocked?: (reason: 'destination') => void
): Promise<void> {
  if (request.isInterceptResolutionHandled()) return;
  let permit = false;
  try {
    const url = new URL(request.url());
    if (url.protocol === 'https:' && !url.username && !url.password)
      permit = await allowed(url.origin);
  } catch {
    // Invalid targets and failed lookups stay blocked. Never return URL/token-bearing errors.
  }
  if (request.isInterceptResolutionHandled()) return;
  if (permit) await request.continue();
  else {
    blocked?.('destination');
    await request.abort('blockedbyclient');
  }
}

const screened = new WeakMap<Page, { destination: number }>();
/** Public-network isolation only. HTTP verbs do not identify final submission. */
export function portalRequestCounts(page: Page): { destination: number } {
  return { destination: screened.get(page)?.destination ?? 0 };
}
export async function screenPortalPage(page: Page): Promise<void> {
  if (screened.has(page)) return;
  const policy = { destination: 0 };
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  screened.set(page, policy);
  page.on('request', (request) => {
    routePortalRequest(request, publicOriginAllowed, () => {
      policy.destination++;
    }).catch(() => {
      // Target shutdown can race an intercepted request. No automatic replay.
    });
  });
}

export async function openPortalPage(page: Page, url: URL): Promise<void> {
  await screenPortalPage(page);
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!response || response.status() >= 400) throw new BrowserSessionError('read_failed');
}
