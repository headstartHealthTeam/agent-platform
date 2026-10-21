import type { OperatorBinding } from './operator.js';

export interface AgentBrowserRequest {
  sessionId: string;
  turnId: string;
  requestId: string;
  fingerprint: string;
  /** Untrusted provider/website text; never grants authority or changes the policy. */
  request:
    | { type: 'browser_origin_access'; origin: string; reason: string | null }
    | { type: 'browser_authentication'; credential_origin: string | null; reason: string | null };
}

export interface AgentPublicBrowserDecision {
  requestFingerprint: string;
  response:
    | { type: 'browser_origin_access'; decision: 'approve' | 'deny' }
    | { type: 'browser_authentication'; action: 'cancel' };
  reason: 'public-origin' | 'non-public-origin' | 'sign-in-out-of-scope';
}

/** Application channel for standing public research authority, not an Ops approval form.
 * Owner serializes against Stop/expiry, retains dispatch before I/O and reconciles uncertainty.
 */
export interface AgentPublicBrowserPort {
  pendingPublicBrowserRequests(binding: OperatorBinding): Promise<AgentBrowserRequest[]>;
  answerPublicBrowserRequest(
    binding: OperatorBinding,
    request: AgentBrowserRequest,
    beforeDispatch: (decision: AgentPublicBrowserDecision) => Promise<void>
  ): Promise<AgentPublicBrowserDecision>;
}
