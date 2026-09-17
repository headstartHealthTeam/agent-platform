/** Portable operator/provider boundary v1. No SDK, application entities or business policy. */
export interface OperatorBinding {
  sessionId: string;
  turnId: string;
  target: string;
  workflowRevision: string;
}
export type OperatorStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
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
export interface OperatorSnapshot {
  status: OperatorStatus;
  items: OperatorItem[];
  pendingQuestionIds: string[];
}
