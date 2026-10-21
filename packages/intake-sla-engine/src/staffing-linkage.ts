export interface StaffingLinkRecord {
  readonly Id?: string | null | undefined;
  readonly id?: string | null | undefined;
  readonly Client_Opportunity_Record__c?: string | null | undefined;
  readonly opportunityId?: string | null | undefined;
}
export interface StaffingLinkRequest {
  readonly Id?: string | null | undefined;
  readonly id?: string | null | undefined;
  readonly Name?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly Client_Opportunity__c?: string | null | undefined;
  readonly opportunityId?: string | null | undefined;
  readonly RBT_Assigned__c?: string | null | undefined;
  readonly staffingId?: string | null | undefined;
}
export interface StaffingRequestLink {
  readonly _linkedViaRbtRequestId: string | null | undefined;
  readonly _linkedViaRbtRequestName: string | null | undefined;
}
export function linkStaffingByOpportunity<T extends StaffingLinkRecord>({
  staffingRecords = [],
  rbtRequests = [],
}: {
  readonly staffingRecords?: readonly T[];
  readonly rbtRequests?: readonly StaffingLinkRequest[];
}): Map<string, (T | (T & StaffingRequestLink))[]> {
  const byOpportunity = new Map<string, (T | (T & StaffingRequestLink))[]>();
  const staffingById = new Map(staffingRecords.map((record) => [record.Id ?? record.id, record]));
  const add = (
    opportunityId: string | null | undefined,
    record: T | (T & StaffingRequestLink)
  ): void => {
    if (!opportunityId) return;
    let records = byOpportunity.get(opportunityId);
    if (records === undefined) {
      records = [];
      byOpportunity.set(opportunityId, records);
    }
    // Preserve the approved Salesforce-ID deduplication, including ID-less captures.
    if (!records.some((candidate) => candidate.Id === record.Id)) records.push(record);
  };
  for (const staffing of staffingRecords)
    add(staffing.Client_Opportunity_Record__c ?? staffing.opportunityId, staffing);
  for (const request of rbtRequests) {
    const opportunityId = request.Client_Opportunity__c ?? request.opportunityId;
    const staffingId = request.RBT_Assigned__c ?? request.staffingId;
    const staffing = staffingById.get(staffingId);
    if (staffing === undefined) continue;
    add(opportunityId, {
      ...staffing,
      _linkedViaRbtRequestId: request.Id ?? request.id,
      _linkedViaRbtRequestName: request.Name ?? request.name,
    });
  }
  return byOpportunity;
}
