export interface StageEntryOpportunity {
  readonly StageName?: string | null;
  readonly stage?: string | null;
  readonly LastStageChangeDate?: string | null;
  readonly SLA_Entry_Date__c?: string | null;
  readonly TA_Approval_Checked_Timestamp__c?: string | null;
  readonly Treatment_Auth_Approval_Date__c?: string | null;
  readonly Active_RBT_Checked_At__c?: string | null;
}
export interface StageTransition {
  readonly Field?: string | null;
  readonly field?: string | null;
  readonly NewValue?: string | number | boolean | null;
  readonly newValue?: string | number | boolean | null;
  readonly CreatedDate?: string | null;
  readonly eventDate?: string | null;
}
function timestamp(value?: string | null): number {
  const time = value ? new Date(value).valueOf() : Number.NaN;
  return Number.isFinite(time) ? time : Number.NaN;
}

export function resolveStageEntryDate({
  opportunity = {},
  stageHistory = [],
}: {
  readonly opportunity?: StageEntryOpportunity;
  readonly stageHistory?: readonly StageTransition[];
} = {}): string | null | undefined {
  const currentStage = (opportunity.StageName ?? opportunity.stage ?? '').trim();
  const matching = stageHistory
    .filter(
      (row) =>
        (row.Field ?? row.field ?? '') === 'StageName' &&
        String(row.NewValue ?? row.newValue ?? '').trim() === currentStage &&
        Number.isFinite(timestamp(row.CreatedDate ?? row.eventDate))
    )
    .sort(
      (left, right) =>
        timestamp(right.CreatedDate ?? right.eventDate) -
        timestamp(left.CreatedDate ?? left.eventDate)
    );
  const transition = matching[0];
  if (transition !== undefined) return transition.CreatedDate ?? transition.eventDate;
  // A recreated SLA must not move the actual stage transition later.
  if (Number.isFinite(timestamp(opportunity.LastStageChangeDate)))
    return opportunity.LastStageChangeDate;
  if (Number.isFinite(timestamp(opportunity.SLA_Entry_Date__c)))
    return opportunity.SLA_Entry_Date__c;
  if (currentStage === 'TA Approved - Pending Scheduling') {
    return (
      [
        opportunity.TA_Approval_Checked_Timestamp__c,
        opportunity.Treatment_Auth_Approval_Date__c,
        opportunity.Active_RBT_Checked_At__c,
      ]
        .filter((value) => Number.isFinite(timestamp(value)))
        .sort((left, right) => timestamp(left) - timestamp(right))[0] ?? null
    );
  }
  return null;
}
