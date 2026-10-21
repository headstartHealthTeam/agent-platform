import type {
  AgentInferenceAuthorizer,
  AgentInferenceRequest,
} from '@headstart-health/workflow-contracts';

/** A finite supervised deadline or a trusted application decision, never an infinite deadline. */
export type InferenceAuthority = number | AgentInferenceAuthorizer;
export const noInferenceAuthority = 'No current inference authorization';

export async function requireInferenceAuthority(
  authority: InferenceAuthority,
  request: AgentInferenceRequest
): Promise<void> {
  try {
    const decision: unknown =
      typeof authority === 'number'
        ? Number.isFinite(authority) && Date.now() < authority
        : await authority.authorize(request);
    if (decision === true) return;
  } catch {
    // Owning-policy failures may contain protected data; never forward them through transport.
  }
  throw new Error(noInferenceAuthority);
}
