import { publicOriginAllowed } from '@headstart-health/browser-runtime';
import type {
  AgentBrowserRequest,
  AgentPublicBrowserDecision,
} from '@headstart-health/workflow-contracts';

type ResolveHost = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** Screens the origin handshake, not HTTP methods, actions or remote DNS rebinding. */
export async function publicBrowserDecision(
  request: AgentBrowserRequest,
  resolve?: ResolveHost
): Promise<AgentPublicBrowserDecision> {
  if (request.request.type === 'browser_authentication')
    return {
      requestFingerprint: request.fingerprint,
      response: { type: 'browser_authentication', action: 'cancel' },
      reason: 'sign-in-out-of-scope',
    };
  let allowed: boolean;
  try {
    allowed = await publicOriginAllowed(request.request.origin, resolve);
  } catch {
    throw new Error('Public-origin lookup unavailable; no browser response submitted.');
  }
  return {
    requestFingerprint: request.fingerprint,
    response: { type: 'browser_origin_access', decision: allowed ? 'approve' : 'deny' },
    reason: allowed ? 'public-origin' : 'non-public-origin',
  };
}
