import type { WorkbookMatrix } from '@headstart-health/artifact-workbook';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type { InterpreterConfig } from './interpretation-binding.js';
import { reportText } from './report-display-values.js';
import type { TranscriptInventoryHealth } from './run-artifact-health.js';

export type ReportMetadataInterpretation =
  | {
      readonly mode: 'api';
      readonly config: Pick<InterpreterConfig, 'model' | 'provider'>;
      readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
    }
  | { readonly mode: 'precomputed'; readonly rows: number }
  | { readonly mode: 'unavailable' };
export interface ReportMetadataInput {
  readonly runId: string;
  readonly runAtEastern: string;
  readonly engineVersion?: string;
  readonly firefliesArtifactHealth: Pick<
    TranscriptInventoryHealth,
    'complete' | 'retainedCount' | 'reason'
  >;
  readonly interpretation: ReportMetadataInterpretation;
  readonly activeRows: number;
  readonly onHoldRows: number;
  readonly totalRows: number;
}
function interpretationSummary(input: ReportMetadataInterpretation): string {
  if (input.mode === 'api')
    return `Enabled with ${input.config.model} through ${input.config.provider}; ${String(input.usage.inputTokens)} input and ${String(input.usage.outputTokens)} output tokens used.`;
  if (input.mode === 'precomputed' && input.rows)
    return `Enabled from contract-bound precomputed interpretations for ${String(input.rows)} Opportunity row(s); packet bindings and transcript support spans were revalidated.`;
  return 'No API or precomputed interpretations were available. Candidate transcript segments are excluded from conclusions and required provider-facing rows are Blocked.';
}
/** Approved report notes describe the workflow; they do not execute or add its gates. */
export function buildReportMetadata({
  runId,
  runAtEastern,
  engineVersion = EVIDENCE_ENGINE_VERSION,
  firefliesArtifactHealth,
  interpretation,
  activeRows,
  onHoldRows,
  totalRows,
}: ReportMetadataInput): WorkbookMatrix {
  return [
    ['Field', 'Value'],
    ['Sheet', 'Intake SLA Review Queue'],
    ['Last Refresh (ET)', runAtEastern],
    ['Run ID', runId],
    ['Evidence Engine Version', engineVersion],
    ['Story Reconciliation Engine', '2026-08-11.8'],
    [
      'Fireflies Transcript Inventory',
      firefliesArtifactHealth.complete
        ? `${String(firefliesArtifactHealth.retainedCount)} full transcripts retained and verified for this run.`
        : `Blocked: ${reportText(firefliesArtifactHealth.reason, 'current-run transcript inventory was not retained.')}`,
    ],
    ['Source Report', 'SLA Action Item Review'],
    ['Source Report ID', '00OKj00000ArJ4iMAF'],
    ['Source Report Developer Name', 'SLA_Action_Item_Review_ZXT'],
    ['Source Report Folder', 'Pending 97151'],
    [
      'Report Tool Run',
      "The named Salesforce report identifies the source workflow. This engine uses the runbook's broader active-plus-on-hold cohort, not the report's narrower on-hold and Active RBT filters.",
    ],
    [
      'Report Filters',
      'All Client Intake Opportunities with a breached, non-completed Current SLA, excluding Opportunities whose current Stage is Admitted or Pending Discharge. Active and on-hold rows are separated into dedicated tabs.',
    ],
    [
      'Gmail',
      'Escalation-only. Search only when the operational full sweep leaves a material evidence gap; generic report emails remain audit-only.',
    ],
    [
      'Structured Sources',
      'Salesforce Opportunity, Current SLA, Authorization__c, Authorization_Review__c, VOB__c, Clinical_Quality__c, RBT_Request__c, Ticket_Match__c, Talent_Acquisition__c, RBT_First_Interview__c, Staffing__c',
    ],
    [
      'Expanded Sources Included In This Build',
      'Salesforce Tasks, meaningful Task status/due-date/subject changes, Task Chatter posts/comments, Aircall transcripts/SMS, and portal client chats when portal_rows.json is supplied',
    ],
    [
      'Linked Files',
      'Escalation-only. Inspect only when the operational full sweep leaves a material gap and a directly relevant file is available.',
    ],
    [
      'Enrichment Policy',
      'Every SLA receives an operational full sweep across Salesforce, tasks/chatter, calls/texts, portal, Fireflies transcripts, linked Billing_and_Claims__c records, and Slack. Gmail and linked files are escalation-only. Direct Aloha access is not required.',
    ],
    [
      'Freshness Threshold',
      'Current: 0-2 calendar days; Semi-Stale: 3-6; Stale: 7+; Missing: no dated substantive update. Semi-Stale remains copy-ready only with a still-valid explicit milestone.',
    ],
    [
      'Administrative Notes',
      'UPDATE NEEDED, no update, CSM follow-up reminders, and provider-to-schedule reminders do not reset freshness.',
    ],
    [
      'SLA / Intake Notes',
      'Dated substantive SLA, intake, and on-hold notes are eligible evidence. Delay reason labels support classification but do not reset freshness alone. Existing action items remain comparison-only.',
    ],
    [
      'Action Model',
      'Each row includes Action Type, one Action Owner, Suggested Follow-Up Date, and Explicit/Recommended date basis for future SLA fields or Task drafts.',
    ],
    [
      'Task Mapping',
      'Opportunity URL/ID -> WhatId; Action Owner -> OwnerId; Suggested Follow-Up Date -> ActivityDate; Suggested Action -> Description; Status Not Started; Priority Normal.',
    ],
    [
      'Fireflies Check',
      'Check Fireflies for every SLA after structured triage. Current structured evidence never suppresses the search. Retrieve client-specific transcript excerpts; meeting summaries are never evidence.',
    ],
    [
      'Fireflies Coverage',
      'Complete requires every linked provider role, available provider email, provider/practice title path, current/prior CSM path, result page, candidate meeting, and full transcript to be checked. Prior-run transcripts never make the current run complete.',
    ],
    ['AI Interpretation', interpretationSummary(interpretation)],
    [
      'Generation Ledger',
      'Protected provenance ledger keyed by SLA and Opportunity. Exact prior generated notes are excluded from future evidence; only substantive human additions are admitted.',
    ],
    [
      'Operator Layout',
      'Review Queue keeps the operator-facing summary, outstanding Task, action, and review columns visible. Comparison and audit fields remain in hidden columns and Evidence Detail.',
    ],
    [
      'Summary Standard',
      'Suggested SLA Summary begins with the latest substantive change date and states the process position, newest independent fact, and unresolved gate. Future dates are labeled as planned milestones, not prior updates. The summary must stand alone and remain under 255 characters.',
    ],
    [
      'In-Depth Summary Standard',
      'In-Depth Summary preserves the full admitted, dated case history alongside the current position and next step, with no arbitrary sentence ceiling. Historical states are attributed to their sources and dates. Unknown intervals and unsupported causal links stay explicit; raw transcripts are not admitted as narrative.',
    ],
    [
      'Outstanding Task Fields',
      'Directly linked, open manual Salesforce Tasks are separated into count, subject, owner, status, and due-date fields. Completed Tasks and call/email activity logs are excluded.',
    ],
    [
      'Provider Matching',
      'Use IA Rendering Provider for IA/IC stages, TA Rendering Provider for TP/TA/97153 stages, and Rendering Provider as fallback.',
    ],
    [
      'Fireflies Matching',
      "Use every linked Rendering, IA, and TA provider as a durable meeting anchor across CSM changes. Build the provider's assigned Opportunity roster first. Exact client references are Direct; a unique best fuzzy name match within that roster may be Likely, must be labeled as assumed, and requires reviewer verification.",
    ],
    [
      'Conversation Search Window',
      'Search from three days before the earlier of current SLA creation or normalized stage entry through the run date, capped at 180 days. Use a 120-day fallback when both dates are unavailable.',
    ],
    [
      'Conversation Fuzzy Matching',
      'Direct paths: Opportunity lookup/link, full client name, authorization number, or family phone. Likely fuzzy paths must be the unique best match within the linked provider/practice roster and include provider/practice plus stage context. Assumed matches never become Direct and always force review.',
    ],
    [
      'Slack Matching',
      'Search every accessible public channel, private channel, group DM, and DM for Opportunity ID/link, client variants, provider/practice, authorization, and roster-constrained fuzzy client names. Retrieve message/thread context before promotion. Slack remains supporting context and cannot determine the structured gate by itself.',
    ],
    [
      'Authorization Note Dating',
      "Treat the newest dated substantive Authorization note as its own evidence event. Do not attach it to an unrelated LastModifiedDate or let a newer administrative modification displace the note's event date.",
    ],
    [
      'MCP Structured Expansion',
      'Added Clinical_Quality__c, Authorization_Review__c, VOB__c, Talent_Acquisition__c, and RBT_First_Interview__c.',
    ],
    [
      'Stage Gating',
      'VOB for Insurance Verification; Authorization Review for IA/TA; Clinical Quality for TP/signatures; Talent and interviews for RBT staffing.',
    ],
    [
      'Candidate Attribution',
      'Talent Acquisition and First Interview records are attributed only through Ticket Match and RBT Request.',
    ],
    [
      'Queue Ordering',
      'Missing, Stale, Semi-Stale, then Current; oldest relevant evidence first within each group.',
    ],
    ['Active Rows', activeRows],
    ['On-Hold Rows', onHoldRows],
    ['Total Rows', totalRows],
  ];
}
