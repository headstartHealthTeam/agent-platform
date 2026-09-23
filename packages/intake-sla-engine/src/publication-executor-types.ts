import type {
  PublicationActual,
  PublicationActualAssertion,
  PublicationAssertion,
  PublicationGateBinding,
  PublicationLoadedCall,
  PublicationManifest,
  PublicationObservations,
  PublicationPayload,
  PublicationStage,
} from './publication-readback-types.js';

export interface ExecutionStage extends PublicationStage {
  readonly file: unknown;
  readonly calls: readonly { readonly file: unknown; readonly payloadHash?: unknown }[];
}
export interface ExecutionManifest extends PublicationManifest {
  readonly runHistoryLast?: unknown;
  readonly stages: readonly ExecutionStage[];
}
export interface ExecutionGate extends PublicationGateBinding {
  readonly evaluatedAt?: unknown;
}
export interface PublicationAuthority {
  readonly approved?: unknown;
  readonly runId?: unknown;
  readonly spreadsheetId?: unknown;
  readonly planHash?: unknown;
}
export interface PublicationConcurrencyResult {
  readonly passed?: unknown;
  readonly runId?: unknown;
  readonly spreadsheetId?: unknown;
  readonly planHash?: unknown;
  readonly reviewerStateUnchanged?: unknown;
  readonly markerMatchesExpectedStage?: unknown;
  readonly noCompetingRun?: unknown;
  readonly checkedAt?: unknown;
}
export interface CapturedPublicationActual extends PublicationActual {
  readonly assertions: readonly PublicationActualAssertion[];
}
export interface IncompletePublicationActual extends CapturedPublicationActual {
  readonly complete: unknown;
  readonly expectedAssertions?: number;
}
export interface PublicationReadRequest {
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly assertions: readonly Omit<PublicationAssertion, 'expectedHash'>[];
  readonly onIncompleteCapture: (partial: IncompletePublicationActual) => Promise<void>;
}
export interface PublicationReadAdapter {
  readonly readAssertions: (input: PublicationReadRequest) => Promise<CapturedPublicationActual>;
}
export interface PublicationWriteRequest {
  readonly spreadsheetId: string;
  readonly stageId: string;
  readonly callIndex: number;
  readonly payload: PublicationPayload;
}
export interface PublicationWriteAdapter extends PublicationReadAdapter {
  readonly capabilities?: {
    readonly exactPreparedWrites?: unknown;
    readonly liveFilters?: unknown;
    readonly userEnteredValues?: unknown;
    readonly formats?: unknown;
  };
  readonly checkConcurrency: (input: {
    readonly manifest: ExecutionManifest;
    readonly observations: PublicationObservations;
  }) => Promise<PublicationConcurrencyResult | null | undefined>;
  readonly apply: (input: PublicationWriteRequest) => Promise<
    | {
        readonly ok?: unknown;
        readonly spreadsheetId?: unknown;
      }
    | null
    | undefined
  >;
}
export interface LoadedPublicationPayload {
  readonly payload: PublicationPayload;
  readonly calls: readonly PublicationLoadedCall[];
}
export interface LoadedPublication {
  readonly manifest: ExecutionManifest;
  readonly gate: ExecutionGate;
  readonly observations: PublicationObservations;
  readonly payloads: ReadonlyMap<string, LoadedPublicationPayload>;
}
export interface PublicationExecutionJournal {
  readonly version: 1;
  readonly runId: string;
  readonly planHash: string;
  readonly stageId: string;
  readonly appliedCalls: string[];
  inFlight?: unknown;
}
export type PublicationAdvanceResult =
  | { readonly stagesComplete: true; readonly finalReadbackRequired: true }
  | {
      readonly stageId: string;
      readonly recoveredFromReadback?: true;
      readonly verifiedAssertions: number;
    };
