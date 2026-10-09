import type { GateContext } from './gate-context.js';

export interface SpecificityPacket extends Pick<GateContext, 'processPosition' | 'unresolvedGate'> {
  readonly newestUpdate?: { readonly fact?: unknown; readonly text?: unknown } | null;
  readonly structuredGateDetail?: {
    readonly factType?: string | null | undefined;
    readonly fact?: string | null | undefined;
  } | null;
  readonly story?: { readonly currentGateIssueKey?: string | undefined };
  readonly approvedFacts?: readonly {
    readonly candidateName?: string | null | undefined;
    readonly candidateStep?: string | null | undefined;
    readonly source?: string | undefined;
  }[];
}

export interface SpecificityInput {
  readonly packet: SpecificityPacket;
  readonly recommendation?: {
    readonly suggestedSlaSummary?: unknown;
    readonly operationalSummary?: unknown;
  } | null;
}

export interface SpecificityIssue {
  readonly code: string;
  readonly description: string;
  readonly severity: 'Review' | 'Error';
  readonly searchPathway: readonly string[];
}

export interface SpecificityAudit {
  readonly passed: boolean;
  readonly requiresReview: boolean;
  readonly issues: readonly SpecificityIssue[];
  readonly pathways: readonly string[];
}
