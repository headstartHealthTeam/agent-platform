import type { OperatorBinding } from './operator.js';

/** Trusted application deployment input, never supplied by an operator or model. */
export interface AgentLaunchDefinition {
  instructions: string;
  tools: {
    type: 'function';
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
}

export interface AgentLaunchRequest {
  requestId: string;
  workflowRevision: string;
  definition: AgentLaunchDefinition;
  input: string;
}

export interface AgentSessionReceipt {
  sessionId: string;
  target: string;
  workflowRevision: string;
  requestId: string;
}

/** Durable correlation, not a provider-enforced uniqueness or idempotency key. */
export interface AgentLaunchIdentity {
  target: string;
  requestId: string;
  workflowRevision: string;
}

export interface AgentSessionCandidate extends AgentSessionReceipt {
  /** Provider creation time in Unix seconds; never sufficient by itself to claim ownership. */
  createdAt: number;
}

export interface AgentLaunchPreflight {
  target: string;
}

/** Ephemeral trusted deployment input. Real secret bytes are visible inside the hosted sandbox.
 * Never persist with launch intent, put in an output directory, or return in a launch receipt.
 */
export interface AgentHostedCredentialFile {
  path: string;
  content: string;
}

/** Launch-only resolution; source credential availability must not gate existing-run controls. */
export type AgentHostedCredentialFiles =
  | readonly AgentHostedCredentialFile[]
  | (() => Promise<readonly AgentHostedCredentialFile[] | undefined>);

/** Non-secret setup receipt. The owner retains it before any credential is installed. It is
 * not a session receipt and never establishes permission to replay uncertain session creation.
 */
export interface AgentCredentialVault extends AgentLaunchIdentity {
  kind: 'openai-credential-vault';
  id: string;
}

export interface AgentSessionCreateOptions {
  expectedTarget: string;
  credentialVault?: AgentCredentialVault;
  retainCredentialVault?: (vault: AgentCredentialVault) => Promise<void>;
  /** Called after validation/provider preflight, immediately before the one SDK create attempt.
   * The application must durably journal dispatch here. Throwing prevents the provider write.
   */
  beforeDispatch?: () => Promise<void>;
}

export type AgentSessionCreateResult =
  | { status: 'created'; receipt: AgentSessionReceipt; providerRequestId?: string }
  | { status: 'not-attempted'; reason: 'validation' | 'preflight' | 'before-dispatch' }
  | {
      status: 'unknown';
      reason: 'provider-outcome' | 'invalid-response';
      providerRequestId?: string;
      /** A response hint only: inspect and correlate it before adopting or cancelling. */
      candidateSessionId?: string;
    };

export type AgentLaunchCandidateResult =
  | { status: 'candidate'; candidate: AgentSessionCandidate }
  | { status: 'unrelated' }
  | { status: 'missing' };

export interface AgentLaunchCandidatePage {
  candidates: AgentSessionCandidate[];
  /** End of one observed list pass is not proof of absence, uniqueness, or permission to recreate. */
  nextAfter: string | null;
}

/** Ephemeral trusted composition input. Never persist in launch intent, metadata or operator views. */
export interface AgentSessionCredential {
  serverLabel: string;
  audience: string;
  authorization: string;
  allowedTools: string[];
}
export type AgentSessionCredentialDescriptor = Omit<AgentSessionCredential, 'authorization'>;

export interface AgentLaunchPort {
  /** Read-only validation and target verification before any issue-once source credential. */
  preflightLaunch(
    request: AgentLaunchRequest,
    descriptors?: AgentSessionCredentialDescriptor[]
  ): Promise<AgentLaunchPreflight>;
  /** One attempt only. The owner persists intent before calling and never retries uncertainty. */
  createSession(
    request: AgentLaunchRequest,
    credentials?: AgentSessionCredential[],
    options?: AgentSessionCreateOptions
  ): Promise<AgentSessionCreateResult>;
  /** Read a webhook/response hint in the pinned target. The application correlates under its lock. */
  inspectLaunchCandidate(
    expectedTarget: string,
    sessionId: string
  ): Promise<AgentLaunchCandidateResult>;
  /** One bounded provider page of exact metadata matches. Reinspect before atomic adoption. */
  discoverLaunchCandidates(
    identity: AgentLaunchIdentity,
    after?: string
  ): Promise<AgentLaunchCandidatePage>;
  /** Recover the first root of the exact owned session; never creates or sends input. */
  inspectSession(receipt: AgentSessionReceipt): Promise<OperatorBinding | null>;
  /** Resolves only after metadata-verified provider quiescence (idle/failed), not event acceptance.
   * No polling: unconfirmed cleanup throws for durable reconciliation. Quiescence is neither
   * deletion nor a permanent session stop; the application must retain its own no-input intent.
   */
  cancelSession(receipt: AgentSessionReceipt): Promise<void>;
  /** Trusted, serialized lifecycle work after the receipt is durable. Never sends/replays input.
   * Initial startup is explicit; later startup requires a current provider connection request.
   * stop releases compute only and does not claim provider cancellation or delete files.
   */
  reconcileEnvironment(
    receipt: AgentSessionReceipt,
    action: 'start' | 'reconcile' | 'stop'
  ): Promise<void>;
}
