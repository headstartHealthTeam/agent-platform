/** Portable operator/provider boundary v1. No SDK, application entities or business policy. */
export interface OperatorBinding {
  sessionId: string;
  /** First root turn in an exclusively application-owned session; never a browser-selected turn. */
  turnId: string;
  target: string;
  workflowRevision: string;
}
export type OperatorStatus = 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'cancelled';
export type OperatorItemKind = 'commentary' | 'tool' | 'final' | 'question';
export interface OperatorItem {
  id: string;
  kind: OperatorItemKind;
  text: string;
  final: boolean;
  callFingerprint?: string;
}
export interface OperatorCommand {
  id: string;
  kind: 'reply' | 'guidance' | 'stop';
  questionId: string | null;
  callFingerprint: string | null;
  text: string;
}
/** Undefined preserves the v1 accepted-send contract. Rejection must prove no input was accepted. */
export type OperatorDelivery = undefined | { status: 'rejected'; reason: 'not_steerable' };
export interface OperatorSnapshot {
  status: OperatorStatus;
  /** Latest verified root turn. Idle is turn completion, not business-workflow completion. */
  currentTurnId?: string;
  items: OperatorItem[];
  pendingQuestionIds: string[];
}
