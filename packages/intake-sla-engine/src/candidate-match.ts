export interface CandidateMatch {
  readonly Ticket_Match_Status__c?: string | null;
  readonly Rejection_Reason__c?: string | null;
  readonly Reason_for_Decline__c?: string | null;
  readonly Candidate__r?: {
    readonly Applicant_Status__c?: string | null;
    readonly HDS_Rejection_Reason__c?: string | null;
    readonly Provider_Rejection_Reason__c?: string | null;
  } | null;
  readonly LastModifiedDate?: string | null;
  readonly CreatedDate?: string | null;
}
export function candidateMatchIsActive(match: CandidateMatch = {}): boolean {
  const text = [
    match.Ticket_Match_Status__c,
    match.Rejection_Reason__c,
    match.Reason_for_Decline__c,
    match.Candidate__r?.Applicant_Status__c,
    match.Candidate__r?.HDS_Rejection_Reason__c,
    match.Candidate__r?.Provider_Rejection_Reason__c,
  ]
    .filter(Boolean)
    .join(' ');
  return !/rejected|declined|withdrew|withdrawn|no show|unresponsive/i.test(text);
}
export function candidateMatchRank(match: CandidateMatch = {}): number {
  if (!candidateMatchIsActive(match)) return 0;
  const status = (match.Ticket_Match_Status__c ?? '').trim().toLowerCase();
  if (status === 'hired') return 600;
  if (status === 'matched') return 500;
  if (/offer accepted|accepted/.test(status)) return 450;
  if (/second interview|2nd interview/.test(status)) return 350;
  if (status.includes('interview')) return 300;
  if (/proposed|provider handoff/.test(status)) return 200;
  if (status.includes('screen')) return 100;
  return 50;
}
function candidateModifiedTime(match: CandidateMatch): number {
  const modified = match.LastModifiedDate ?? '';
  if (modified.length > 0) return new Date(modified).getTime();
  const created = match.CreatedDate ?? '';
  return new Date(created.length > 0 ? created : 0).getTime();
}
export function selectCurrentCandidateMatch<T extends CandidateMatch>(
  matches: readonly T[] = []
): T | undefined {
  return [...matches]
    .filter(candidateMatchIsActive)
    .sort(
      (left, right) =>
        candidateMatchRank(right) - candidateMatchRank(left) ||
        candidateModifiedTime(right) - candidateModifiedTime(left)
    )[0];
}
