import type { OperatorBinding } from './operator.js';

/** Complete saved API resources, not an operator-feed projection or a model-generated summary. */
export interface AgentConversationPart {
  ordinal: number;
  resource: 'session' | 'turns' | 'items' | 'subagents' | 'subagent-turns' | 'subagent-items';
  subagentId: string | null;
  /** JSON preserves every returned resource field. Keep out of logs and ordinary activity feeds. */
  json: string;
}

export interface AgentConversationManifest {
  schema: 'headstart-agent-conversation/v1';
  provider: 'openai-agents';
  sdkVersion: string;
  binding: OperatorBinding;
  /** Activity/provenance checkpoint, not proof of application closure. */
  snapshot: string;
  /** Hash of ordered part envelopes, including their exact JSON. */
  digest: string;
  parts: number;
  resources: number;
  bytes: number;
  limitations: string[];
}

/** Trusted application boundary. The caller owns private retention, authority and cleanup policy. */
export interface AgentConversationPort {
  exportConversation(
    binding: OperatorBinding,
    retain: (part: AgentConversationPart) => Promise<void>
  ): Promise<AgentConversationManifest>;
  /** Never authorizes deletion by itself. The owner must serialize input/closure and retain evidence. */
  deleteConversation(
    archive: AgentConversationManifest,
    /** Recheck current authority and journal dispatch immediately before the provider mutation. */
    beforeDispatch: () => Promise<void>
  ): Promise<{ status: 'deleted' | 'absent' }>;
}
