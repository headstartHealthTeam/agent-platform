import type { OperatorBinding } from './operator.js';

/** UTF-8 envelope limit; accommodates complete application artifacts including JSON escaping. */
export const AGENT_FUNCTION_PAYLOAD_LIMIT = 16 * 1024 * 1024;

/** Visual results leave room for provider metadata inside the documented 4 MiB result budget. */
export const AGENT_FUNCTION_CONTENT_LIMIT = 4 * 1024 * 1024 - 64 * 1024;

export interface AgentFunctionTextContent {
  type: 'input_text';
  text: string;
}
export interface AgentFunctionImageContent {
  type: 'input_image';
  image_url: string;
}
/** Model input, not operator activity. Images must never enter ordinary application logs. */
export type AgentFunctionContent = AgentFunctionTextContent | AgentFunctionImageContent;

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
  output: string | AgentFunctionContent[];
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
