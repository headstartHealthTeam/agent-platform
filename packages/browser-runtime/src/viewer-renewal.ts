import type { BrowserViewerReceipt, BrowserViewerStatus } from './viewer.js';

const REFRESH_HEADROOM_MS = 60_000;

/** Pure scheduling decision. The application serializes and journals any resulting mutation. */
export function watchViewerDecision(input: {
  browserId: string;
  receipt: BrowserViewerReceipt;
  status: BrowserViewerStatus;
  now: number;
  authorizationNotAfter: number;
  stopped: boolean;
  dispatchUncertain: boolean;
}): 'keep' | 'renew' | 'withhold' {
  if (
    input.stopped ||
    input.dispatchUncertain ||
    input.browserId !== input.receipt.browserId ||
    input.status.interactable ||
    !Number.isSafeInteger(input.now) ||
    !Number.isSafeInteger(input.receipt.notAfter) ||
    !Number.isSafeInteger(input.status.expiresAt) ||
    !Number.isSafeInteger(input.authorizationNotAfter) ||
    input.now >= input.authorizationNotAfter
  )
    return 'withhold';
  // An explicit closure is not a routine viewing-link expiration or permission to recreate it.
  if (input.status.status === 'closed') return 'withhold';
  const expiresAt = Math.min(input.receipt.notAfter, input.status.expiresAt);
  // Do not churn new viewers when the current link already covers the remaining authorization.
  if (input.status.status === 'open' && expiresAt >= input.authorizationNotAfter) return 'keep';
  if (input.status.status === 'expired' || expiresAt - input.now <= REFRESH_HEADROOM_MS)
    return 'renew';
  return 'keep';
}
