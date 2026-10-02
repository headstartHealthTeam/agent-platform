export type ActionDate = string | number | Date | null;

export interface ActionModelInput {
  readonly opp: {
    readonly StageName?: unknown;
    readonly Current_SLA__r?: { readonly Stage__c?: unknown } | null | undefined;
    readonly CSM__c?: unknown;
  };
  readonly blocker: string;
  readonly action: string;
  readonly evidenceText?: unknown;
  readonly milestoneDateOverride?: string | null;
  readonly milestoneDateBasis?: string | null;
  readonly milestoneOwner?: string | null;
  readonly asOf?: ActionDate;
}

export interface ActionMilestone {
  readonly kind: 'submission' | 'event';
  readonly date: string;
  readonly basis?: string | null;
}

export interface IntakeActionModel {
  readonly actionType: string;
  readonly actionOwner: string;
  readonly followUpDate: string;
  readonly followUpDateBasis: string;
}
