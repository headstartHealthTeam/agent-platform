export type FreshnessFamily = 'insurance' | 'rbt' | 'treatmentPlan' | 'intakeScheduling';
export interface FreshnessFactSummary {
  readonly type: string;
  readonly summary: string;
  readonly relevance?: number | null | undefined;
  readonly milestoneDate?: string | null | undefined;
}
export interface FreshnessCandidateSummary {
  readonly source: string;
  readonly summary: string;
  readonly kind: string;
  readonly matchQuality: string;
  readonly operationalFacts?: readonly FreshnessFactSummary[] | null | undefined;
  readonly candidateName?: string | null | undefined;
  readonly candidateStep?: string | null | undefined;
}
export interface FreshnessAuthorizationSummary {
  readonly phase?: string | null | undefined;
  readonly payer?: string | null | undefined;
}
