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

export interface AgentLaunchPort {
  /** One attempt only. The owner persists intent before calling and never retries uncertainty. */
  createSession(request: AgentLaunchRequest): Promise<AgentSessionReceipt>;
  /** Recover the first root of the exact owned session; never creates or sends input. */
  inspectSession(receipt: AgentSessionReceipt): Promise<OperatorBinding | null>;
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
