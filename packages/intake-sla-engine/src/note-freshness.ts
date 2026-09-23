export interface NoteOpportunity {
  readonly Id: string;
  readonly Current_SLA__c?: string | null | undefined;
  readonly Current_SLA__r?:
    { readonly Reason_for_Delay_Notes__c?: string | null | undefined } | null | undefined;
  readonly Intake_Notes__c?: string | null | undefined;
  readonly On_Hold_Notes__c?: string | null | undefined;
}
type EffectiveNoteOpportunity<T extends NoteOpportunity> = Omit<
  T,
  'Current_SLA__r' | 'Intake_Notes__c' | 'On_Hold_Notes__c'
> & {
  Current_SLA__r: Omit<NonNullable<T['Current_SLA__r']>, 'Reason_for_Delay_Notes__c'> & {
    Reason_for_Delay_Notes__c: string | null | undefined;
  };
  Intake_Notes__c: string | null | undefined;
  On_Hold_Notes__c: string | null | undefined;
};
export function adjudicatedNoteFreshnessInput<
  T extends NoteOpportunity,
  E extends { readonly sourceRecordId: string },
>(
  opportunity: T,
  events: readonly E[],
  reviewedNoteIds: ReadonlySet<string>
): { opportunity: T | EffectiveNoteOpportunity<T>; events: E[] } {
  if (reviewedNoteIds.size === 0) return { opportunity, events: [] };
  const slaId =
    typeof opportunity.Current_SLA__c === 'string' && opportunity.Current_SLA__c.length > 0
      ? opportunity.Current_SLA__c
      : `${opportunity.Id}:sla-note`;
  return {
    opportunity: {
      ...opportunity,
      Current_SLA__r: {
        ...opportunity.Current_SLA__r,
        Reason_for_Delay_Notes__c: reviewedNoteIds.has(slaId)
          ? ''
          : opportunity.Current_SLA__r?.Reason_for_Delay_Notes__c,
      },
      Intake_Notes__c: reviewedNoteIds.has(`${opportunity.Id}:intake-note`)
        ? ''
        : opportunity.Intake_Notes__c,
      On_Hold_Notes__c: reviewedNoteIds.has(`${opportunity.Id}:on-hold-note`)
        ? ''
        : opportunity.On_Hold_Notes__c,
    },
    events: events.filter((event) =>
      [...reviewedNoteIds].some((id) => event.sourceRecordId.startsWith(`${id}:`))
    ),
  };
}
