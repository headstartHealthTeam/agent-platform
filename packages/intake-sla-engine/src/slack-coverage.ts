type Count = number | string | null;
export interface SlackSweepExecution {
  readonly cohortComplete?: boolean;
  readonly expectedOpportunities?: Count;
  readonly opportunities?: Count;
  readonly blocked?: Count;
  readonly unassignedExactRows?: Count;
  readonly unassignedPageTwoRecords?: Count;
  readonly threadExpansionComplete?: boolean;
}
export interface SlackSweepRow {
  readonly blocked?: boolean;
  readonly error?: string | null;
  readonly paginationComplete?: boolean;
  readonly threadExpansionComplete?: boolean;
}
export interface SlackSweepCoverage {
  readonly status: 'Partial' | 'Complete';
  readonly complete: boolean;
  readonly detail: string;
}
function executionProblems(
  execution: SlackSweepExecution | null | undefined,
  expected?: Count
): string[] {
  if (!execution) return ['The full-cohort Slack sweep execution artifact is missing.'];
  const problems: string[] = [];
  if (execution.cohortComplete !== true)
    problems.push('The full-cohort Slack sweep did not complete.');
  if (Number(execution.expectedOpportunities) !== Number(expected))
    problems.push('The Slack sweep expected cohort does not match the current cohort.');
  if (Number(execution.opportunities) !== Number(expected))
    problems.push('The Slack sweep output does not contain every current Opportunity.');
  if (Number(execution.blocked ?? 0) > 0)
    problems.push('One or more Slack cohort rows are blocked.');
  if (
    Number(execution.unassignedExactRows ?? 0) > 0 ||
    Number(execution.unassignedPageTwoRecords ?? 0) > 0
  )
    problems.push('One or more Slack artifacts could not be assigned by Opportunity ID.');
  if (execution.threadExpansionComplete !== true)
    problems.push('The full-cohort Slack sweep did not complete required thread expansion.');
  return problems;
}
function rowProblems(row: SlackSweepRow | null | undefined): string[] {
  if (!row) return ['The Opportunity has no Slack sweep row.'];
  const problems: string[] = [];
  if (row.blocked === true)
    problems.push([row.error].find(Boolean) ?? 'The Opportunity Slack sweep row is blocked.');
  if (row.paginationComplete !== true)
    problems.push('The Opportunity Slack search did not record complete pagination.');
  if (row.threadExpansionComplete !== true)
    problems.push('One or more current-story Slack threads were not expanded.');
  return problems;
}
/** Cohort/denial sufficiency is Intake policy, not the shared Slack response contract. */
export function slackSweepCoverage({
  execution,
  row,
  expectedOpportunities,
  denialContext,
}: {
  readonly execution?: SlackSweepExecution | null;
  readonly row?: SlackSweepRow | null;
  readonly expectedOpportunities?: Count;
  readonly denialContext?: {
    readonly required?: boolean;
    readonly complete?: boolean;
    readonly detail?: string | null;
  } | null;
} = {}): SlackSweepCoverage {
  const problems: string[] = [];
  if (denialContext?.required && !denialContext.complete)
    problems.push(`Denial-context coverage is incomplete. ${String(denialContext.detail)}`);
  problems.push(...executionProblems(execution, expectedOpportunities), ...rowProblems(row));
  return {
    status: problems.length > 0 ? 'Partial' : 'Complete',
    complete: problems.length === 0,
    detail: [...new Set(problems)].join(' '),
  };
}
