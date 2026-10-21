import type { PublicationStage } from './publication-readback-types.js';

export type PublicationCallBinding = NonNullable<PublicationStage['calls']>[number];
export interface PublicationRejectionResponse {
  readonly isError?: unknown;
  readonly content?:
    readonly { readonly type?: unknown; readonly text?: unknown }[] | null | undefined;
  readonly structuredContent?:
    | {
        readonly error_code?: unknown;
        readonly error?: unknown;
        readonly spreadsheetId?: unknown;
      }
    | null
    | undefined;
}
export interface PublicationAcknowledgedCall extends PublicationCallBinding {
  readonly response?: PublicationRejectionResponse | null | undefined;
}
export interface PublicationRejection {
  readonly priorPlanHash?: unknown;
  readonly stageId?: unknown;
  readonly callIndex?: number | undefined;
  readonly response?: PublicationRejectionResponse | null | undefined;
  readonly appliedCalls?: readonly PublicationAcknowledgedCall[] | null | undefined;
}
export interface PublicationResume {
  readonly version?: unknown;
  readonly runId?: string | undefined;
  readonly spreadsheetId?: string | undefined;
  readonly planHash?: string | undefined;
  readonly stageId?: string | undefined;
  readonly appliedCalls?: readonly PublicationCallBinding[] | null | undefined;
  readonly rejectionHash?: string | null | undefined;
}
