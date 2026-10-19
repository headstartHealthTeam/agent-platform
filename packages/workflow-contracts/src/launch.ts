import type { AgentWorkspaceFile, AgentWorkspaceFileReceipt } from './artifacts.js';
import type { AgentCredentialProtection } from './credential-protection.js';
import type { AgentLaunchDiagnostic } from './launch-diagnostic.js';
import type { OperatorBinding } from './operator.js';

/** Reviewed non-secret source files, not case evidence or credentials. Paths are absolute sandbox
 * paths; data is base64 of the exact source bytes. The definition revision covers the entire set.
 */
export interface AgentCapabilityFiles {
  directories: string[];
  files: { path: string; data: string }[];
}

/** Trusted application deployment input, never supplied by an operator or model. */
export interface AgentLaunchDefinition {
  instructions: string;
  capabilities?: AgentCapabilityFiles;
  /** Content identity of an independently installed runtime. Mutually exclusive with inline
   * capability files; the provider must verify its pinned deployment binding before dispatch.
   */
  runtimeRevision?: string;
  /** Definition-owned capability, never an operator-supplied tool list. Public browser work
   * uses a fresh credential-free environment, not the credentialed source-reading sandbox.
   */
  research?: 'live-web-search' | 'public-browser';
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
  /** Explicit null creates a hosted workspace without starting inference. The owner must retain
   * its receipt, restore inputs, and journal startPreparedSession before the first turn. */
  input: string | null;
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

/** Application-owned authorization for inference-producing transport, not model instructions.
 * The owner resolves these immutable identities against its durable records and current policy.
 * Never pass a model/operator-supplied callback, credential, payload, or database entity here.
 */
export type AgentInferenceRequest =
  | { operation: 'launch'; identity: AgentLaunchIdentity }
  | { operation: 'input'; binding: OperatorBinding; commandId: string }
  | {
      operation: 'function-result';
      binding: OperatorBinding;
      turnId: string;
      callId: string;
      fingerprint: string;
    }
  | {
      operation: 'public-browser';
      binding: OperatorBinding;
      turnId: string;
      requestId: string;
      fingerprint: string;
    }
  | { operation: 'environment'; receipt: AgentSessionReceipt }
  | { operation: 'prepared-start'; receipt: AgentSessionReceipt };

export interface AgentInferenceAuthorizer {
  /** Only explicit true grants this attempt. Failure/unavailability denies it. Called again at
   * dispatch; must be idempotent and must not create runs, replay commands or widen authority.
   */
  authorize(request: AgentInferenceRequest): Promise<boolean>;
}

export interface AgentSessionCandidate extends AgentSessionReceipt {
  /** Provider creation time in Unix seconds; never sufficient by itself to claim ownership. */
  createdAt: number;
}

export interface AgentLaunchPreflight {
  target: string;
}

export type AgentPreparedSessionStartResult =
  { status: 'accepted' } | { status: 'not-attempted' } | { status: 'unknown' };

/** Read-only provider observation. Disconnection is not proof that a workspace is lost.
 * No error payload, installed files, credentials, reconnect action or replay authority is exposed.
 */
export type AgentEnvironmentSnapshot =
  | { type: 'none' }
  | {
      type: 'openai_hosted' | 'self_hosted';
      environmentId: string;
      status:
        'pending' | 'ready' | 'connected' | 'disconnected' | 'suspended' | 'expired' | 'failed';
    };

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
  /** Required with hosted credential files. Persist before any credential installation/dispatch;
   * union prior hashes on a proven-undispatched retry and retain for the session's lifetime.
   */
  retainCredentialProtection?: (protection: AgentCredentialProtection) => Promise<void>;
  /** Called after validation/provider preflight, immediately before the one SDK create attempt.
   * The application must durably journal dispatch here. Throwing prevents the provider write.
   */
  beforeDispatch?: () => Promise<void>;
}

export type AgentSessionCreateResult =
  | { status: 'created'; receipt: AgentSessionReceipt; providerRequestId?: string }
  | {
      status: 'not-attempted';
      reason: 'validation' | 'credential-protection' | 'preflight' | 'before-dispatch';
    }
  | {
      status: 'unknown';
      reason: 'provider-outcome' | 'invalid-response';
      /** Safe error metadata only; never permission to retry the create. */
      diagnostic?: AgentLaunchDiagnostic;
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
  /** Optional for older artifacts. Missing support or an unreadable/unknown response is not
   * evidence of expiry and never authorizes replacement. No session, input or keep-alive is sent.
   */
  inspectEnvironment?(receipt: AgentSessionReceipt): Promise<AgentEnvironmentSnapshot>;
  /** Restore exact retained inputs into a connected, not-yet-started hosted session. This never
   * starts inference. The owner journals each file dispatch and preserves uncertain outcomes. */
  stagePreparedSessionFile?(
    receipt: AgentSessionReceipt,
    file: AgentWorkspaceFile,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentWorkspaceFileReceipt>;
  /** One initial-input attempt after complete restoration. Uses the receipt's stable message
   * identity; an uncertain result is reconciled, never replaced with another create/input. */
  startPreparedSession?(
    receipt: AgentSessionReceipt,
    input: string,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentPreparedSessionStartResult>;
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
