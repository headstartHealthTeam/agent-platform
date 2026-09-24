import type { OperatorBinding } from './operator.js';

/** UTF-8 envelope limit; accommodates complete application artifacts including JSON escaping. */
export const AGENT_FUNCTION_PAYLOAD_LIMIT = 16 * 1024 * 1024;

/** Application-only tool boundary. Never include raw arguments/results in operator activity. */
export interface AgentFunctionCall {
  sessionId: string;
  turnId: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  fingerprint: string;
}
export interface AgentFunctionSuccess {
  success: true;
  output: string;
}
export interface AgentFunctionFailure {
  success: false;
  error: string;
}
export type AgentFunctionResult = AgentFunctionSuccess | AgentFunctionFailure;

export interface AgentFunctionPort {
  pendingFunctions(binding: OperatorBinding): Promise<AgentFunctionCall[]>;
  completeFunction(
    binding: OperatorBinding,
    call: AgentFunctionCall,
    result: AgentFunctionResult
  ): Promise<void>;
}
