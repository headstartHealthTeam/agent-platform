/** Approved seven-tab report vocabulary; values are unchanged from the merged Intake builder. */
export const REPORT_QUEUE_HEADERS = [
  'Opportunity Name',
  'Salesforce',
  'Practice',
  'Relevant Provider',
  'CSM / Owner',
  'Stage',
  'Days Breached',
  'Blocking Gate',
  'Freshness',
  'Last Substantive Update Date',
  'Last Substantive Update Source',
  'Last Substantive Update',
  'Identity Match Review',
  'Suggested SLA Summary',
  'In-Depth Summary',
  'Outstanding Task Count',
  'Outstanding Task',
  'Task Owner',
  'Task Status',
  'Task Due Date',
  'Suggested Action',
  'Action Type',
  'Action Owner',
  'Suggested Follow-Up Date',
  'Ready to Copy',
  'Why Review Needed',
  'Reviewer Notes',
  'Copied to Salesforce?',
  'Needs CSM Review',
  'Current SLA Delay Summary',
  'Current Action Item',
  'Next Milestone',
  'Follow-Up Date Basis',
  'Evidence Status',
  'Best Source',
  'Reviewed By',
  'Reviewed At',
] as const;

export const REPORT_EVIDENCE_HEADERS = [
  'Opportunity Name',
  'Opportunity ID',
  'SLA ID',
  'Current Delay Reason',
  'Current Delay Notes',
  'Current SLA Note Provenance',
  'Admitted Current SLA Evidence',
  'Story Window Start',
  'Story Window Basis',
  'Active Issues',
  'Resolved Issues',
  'Lifecycle Timeline',
  'Resolved Authorization Gate',
  'Gate Confidence',
  'Identity Confidence',
  'Source Coverage',
  'Evidence Conflict',
  'AI Interpretation',
  'Conversation Match Audit',
  'Source Quality',
  'Relevant Provider',
  'IA Rendering Provider',
  'TA Rendering Provider',
  'Rendering Provider',
  'Authorization Evidence',
  'Authorization Review Evidence',
  'VOB Evidence',
  'Clinical Quality Evidence',
  'RBT / Staffing Evidence',
  'Candidate / Interview Evidence',
  'Calls / Texts / Tasks / Chatter Evidence',
  'Portal Result',
  'Fireflies Result',
  'Linked Billing / Claims Result',
  'Sources Checked',
  'Last Relevant Update Summary',
  'Existing Gaps',
  'QA Issues',
] as const;

export const REPORT_HISTORY_HEADERS = [
  'Run ID',
  'Started At (ET)',
  'Expected Active',
  'Expected On Hold',
  'Processed',
  'Blocked Rows',
  'Salesforce',
  'Portal',
  'Fireflies',
  'Linked Billing / Claims',
  'Escalation',
  'Publish Status',
] as const;

export const REPORT_QUEUE_NOTES = {
  'Opportunity Name':
    'Source: Salesforce Opportunity. Client/Opportunity display name used as the reviewer key.',
  Salesforce: 'Source: Salesforce. Direct link to the Opportunity record.',
  Practice: 'Source: Salesforce Business Profile linked to the Opportunity.',
  'Relevant Provider':
    'Calculated identity field. Uses IA provider for IA/IC stages, TA provider for TP/TA/97153 stages, then general rendering provider.',
  'CSM / Owner':
    'Source: Salesforce. Current Customer Success Manager name; prior CSMs are retained in the identity profile for evidence matching.',
  Stage: 'Source: Salesforce Opportunity StageName at collection time.',
  'Days Breached':
    'Source: Salesforce SLA due value. Absolute number of calendar days currently breached.',
  'Blocking Gate':
    'AI-generated classification of the exact unresolved process gate. Structured authorization prerequisites override an inconsistent Opportunity stage.',
  Freshness:
    'Calculated from the newest substantive stage-relevant update, including dated SLA, intake, and on-hold notes. Current: 0-2 days; Semi-Stale: 3-6; Stale: 7+; Missing: none.',
  'Last Substantive Update Date':
    'Calculated event date of the newest fact that changes or confirms operational status. Administrative reminders do not count.',
  'Last Substantive Update Source':
    'Calculated source that supplied the newest substantive evidence.',
  'Last Substantive Update':
    'AI-synthesized fact from the newest substantive evidence. Raw source text remains in Evidence Detail.',
  'Identity Match Review':
    'Calculated identity warning. Populated when a transcript or message uses an approximate client name that is promoted as a unique Likely match within the assigned provider roster. Requires reviewer verification and prevents Ready to Copy = Yes.',
  'Suggested SLA Summary':
    'AI-generated Salesforce-ready delay summary. Begins with the date of the latest substantive change, distinguishes future milestones, stands alone, and remains under 255 characters.',
  'In-Depth Summary':
    'AI-generated operational brief with dated meaningful changes, current position, freshness, unresolved gate, future milestone, and owner action.',
  'Outstanding Task Count':
    'Calculated count of directly linked, open manual Salesforce Tasks. Completed Tasks and communication activity logs are excluded.',
  'Outstanding Task':
    'Source: Salesforce Task. Subject of each directly linked, open manual Task, ordered by earliest due date.',
  'Task Owner': 'Source: Salesforce Task Owner. Values align in order with Outstanding Task.',
  'Task Status': 'Source: Salesforce Task Status. Values align in order with Outstanding Task.',
  'Task Due Date':
    'Source: Salesforce Task ActivityDate, with overdue tasks labeled. Values align in order with Outstanding Task.',
  'Suggested Action':
    'AI-generated copy-ready instruction with one accountable owner, one action, and expected outcome.',
  'Action Type':
    'AI-generated standardized value for future Salesforce fields/Tasks: Provider Outreach, Family Outreach, Insurance Follow-Up, RBT Follow-Up, Clinical Review, Salesforce Update, Monitor, Close / Discharge, or No Action.',
  'Action Owner':
    'AI-generated accountable person or operating team. Must resolve to a Salesforce User or Queue before future Task creation.',
  'Suggested Follow-Up Date':
    'AI-generated date-only Eastern Time checkpoint. Future Salesforce Task mapping: ActivityDate.',
  'Ready to Copy':
    'Calculated review state. Yes: supported; Review: material gap/conflict; Blocked: required source missing or core evidence unavailable.',
  'Why Review Needed':
    'Calculated explanation of the specific evidence gap, conflict, freshness issue, or blocked source preventing confident use.',
  'Reviewer Notes':
    'Reviewer-entered field preserved across refreshes. Never overwritten by the workflow.',
  'Copied to Salesforce?':
    'Reviewer-entered Yes/No transition tracking field preserved across refreshes.',
  'Needs CSM Review':
    'Reviewer-entered checkbox preserved across refreshes. The workflow must capture and restore this exact value and never generate or clear it.',
  'Current SLA Delay Summary':
    'Current Salesforce delay reason and notes. Dated substantive notes may contribute evidence; the current action item remains comparison-only.',
  'Current Action Item':
    'Comparison-only Salesforce action text. It is never used to generate proposed outputs.',
  'Next Milestone': 'AI-generated observable result required before the Opportunity can advance.',
  'Follow-Up Date Basis': 'Calculated value: Explicit, Recommended, or Not Applicable.',
  'Evidence Status': 'Calculated value: Complete, Partial, Conflicting, Missing, or Blocked.',
  'Best Source': 'Calculated highest-signal source supporting the recommendation.',
  'Reviewed By': 'Reviewer-entered approval metadata preserved across refreshes.',
  'Reviewed At': 'Reviewer-entered approval timestamp preserved across refreshes.',
  'On Hold Reason': 'Source: Salesforce On Hold Reason, with Last On Hold Reason as fallback.',
  'On Hold Start Date': 'Source: Salesforce On Hold Start Date.',
  'Days On Hold':
    'Source: Salesforce Current Days on Hold, with Total Days on Hold as fallback. If Salesforce is negative or invalid, calculated as calendar days from On Hold Start Date through the run date.',
  'Restart Condition':
    'Source: Salesforce On-Hold Notes or Off-Hold Reason describing what must happen before intake resumes.',
} as const;

export const REPORT_EVIDENCE_NOTES = {
  'Opportunity Name': REPORT_QUEUE_NOTES['Opportunity Name'],
  'Opportunity ID': 'Source: Salesforce. Stable Opportunity lookup key.',
  'SLA ID': 'Source: Salesforce. Current Opportunity Stage SLA record ID.',
  'Current Delay Reason':
    'Source: Salesforce current SLA reason. It may support blocker classification but does not reset freshness by itself.',
  'Current Delay Notes':
    'Source: Salesforce current SLA notes. Dated substantive facts are eligible evidence; administrative reminders do not reset freshness.',
  'Current SLA Note Provenance':
    'Calculated provenance: Human, Generated - Exact, Generated - Similar, Generated - Human Addition, Generated - Unverified Legacy, or Empty.',
  'Admitted Current SLA Evidence':
    'Only the human-authored portion of the current SLA note allowed into evidence processing. Prior generated text is excluded through the Generation Ledger.',
  'Story Window Start':
    'Calculated as three calendar days before the earlier of current SLA creation or normalized stage entry. Falls back to 120 days when neither date is available.',
  'Story Window Basis':
    'Explains which SLA or stage date established the longitudinal evidence window.',
  'Active Issues':
    'AI-assisted deterministic reconciliation of blockers that remain unresolved at the run time. A newer unrelated update cannot remove an issue.',
  'Resolved Issues':
    'Issues retired by a structured downstream milestone, a later state of the same record, or an explicit Direct/Likely resolution.',
  'Lifecycle Timeline':
    'Synthesized chronological evidence with issue key, lifecycle state, source, and fact. Long timelines may group consecutive issue keys and dates under Issue: and Date: headings; every event and its order remain intact. Raw transcripts and messages remain audit-only.',
  'Resolved Authorization Gate':
    'Calculated from exact Authorization Type, determination, status, submission/approval dates, and coverage period. Initial Consultation never satisfies the IA authorization gate.',
  'Gate Confidence':
    'Confidence that the deterministic stage and prerequisite engine identified the correct unresolved process gate.',
  'Identity Confidence':
    'Confidence that conversation evidence belongs to this Opportunity after provider-roster, client-name, practice, CSM, authorization, and staffing matching.',
  'Source Coverage':
    'Complete, Partial, or Blocked assessment of required current-run source retrieval.',
  'Evidence Conflict':
    'Yes when relevant sources materially disagree about the current gate or milestone; No otherwise.',
  'AI Interpretation':
    'Status of the model-based transcript interpretation pass. Support-span validation is required before a finding can influence the recommendation.',
  'Conversation Match Audit':
    'Auditable Fireflies and calls/texts search coverage, candidate counts, and the top three Weak roster-constrained matches. Weak matches never influence generated conclusions.',
  'Source Quality': 'Highest evidence quality used: Direct, Likely, Weak, Blocked, or Not Found.',
  'Relevant Provider': REPORT_QUEUE_NOTES['Relevant Provider'],
  'IA Rendering Provider': 'Source: Salesforce IA Rendering Provider identity anchor.',
  'TA Rendering Provider': 'Source: Salesforce TA Rendering Provider identity anchor.',
  'Rendering Provider': 'Source: Salesforce general Rendering Provider identity anchor.',
  'Authorization Evidence':
    'Normalized Authorization__c status, dates, payer, denial detail, and notes.',
  'Authorization Review Evidence': 'Normalized Authorization_Review__c workflow evidence.',
  'VOB Evidence': 'Normalized VOB__c verification and eligibility evidence.',
  'Clinical Quality Evidence':
    'Normalized Clinical_Quality__c treatment-plan, review, signature, and barrier evidence.',
  'RBT / Staffing Evidence': 'Normalized RBT_Request__c and Staffing__c evidence.',
  'Candidate / Interview Evidence':
    'Normalized Ticket Match, Talent Acquisition, and RBT First Interview evidence.',
  'Calls / Texts / Tasks / Chatter Evidence':
    'Stage-relevant evidence from approved phone lines, Salesforce Tasks, tracked changes, and substantive Chatter.',
  'Portal Result':
    'Portal search result with direct/likely evidence or explicit Found, Searched - Not Found, Blocked, Timed Out, or Unsupported status.',
  'Fireflies Result':
    'Provider-first meeting/transcript result. Fireflies is required for every SLA.',
  'Linked Billing / Claims Result':
    'Salesforce Billing_and_Claims__c evidence. Future active appointments confirm scheduling; completed 97151 or 97153 records confirm occurrence.',
  'Sources Checked':
    'Compact per-source search outcome for the current run. Cached data is never represented as freshly checked.',
  'Last Relevant Update Summary':
    'Newest stage-relevant independent evidence selected by the ranking engine.',
  'Existing Gaps':
    'Missing context, conflicts, stale evidence, weak identity matches, or blocked source coverage.',
  'QA Issues':
    'Automated pre-publication checks for summary length, raw-source leakage, missing action ownership, invalid dates, unsupported copy-ready status, conflicts, and future milestones described as completed.',
} as const;

export const REPORT_HOLD_FIELDS = [
  'On Hold Reason',
  'On Hold Start Date',
  'Days On Hold',
  'Restart Condition',
] as const;
export const REPORT_HOLD_INSERT_INDEX = REPORT_QUEUE_HEADERS.indexOf('Needs CSM Review') + 1;
export const REPORT_HOLD_HEADERS = [
  ...REPORT_QUEUE_HEADERS.slice(0, REPORT_HOLD_INSERT_INDEX),
  ...REPORT_HOLD_FIELDS,
  ...REPORT_QUEUE_HEADERS.slice(REPORT_HOLD_INSERT_INDEX),
] as const;
const queueNotes: ReadonlyMap<string, string> = new Map(Object.entries(REPORT_QUEUE_NOTES));
const evidenceNotes: ReadonlyMap<string, string> = new Map(Object.entries(REPORT_EVIDENCE_NOTES));
function reportNote(notes: ReadonlyMap<string, string>, header: string): string {
  const value = notes.get(header);
  if (value === undefined) throw new Error('The report header definition is incomplete');
  return value;
}
export type ReportHeaderNotes = Readonly<
  Record<'Review Queue' | 'On-Hold Review' | 'Evidence Detail', readonly string[]>
>;
export function reportHeaderNotes(): ReportHeaderNotes {
  return {
    'Review Queue': REPORT_QUEUE_HEADERS.map((header) => reportNote(queueNotes, header)),
    'On-Hold Review': REPORT_HOLD_HEADERS.map((header) => reportNote(queueNotes, header)),
    'Evidence Detail': REPORT_EVIDENCE_HEADERS.map((header) => reportNote(evidenceNotes, header)),
  };
}
export function reportDataDictionary(): readonly (readonly string[])[] {
  return [
    ['Tab / Column', 'Meaning'],
    ...REPORT_QUEUE_HEADERS.map((header) => [
      `Review Queue / ${header}`,
      reportNote(queueNotes, header),
    ]),
    ...REPORT_HOLD_FIELDS.map((header) => [
      `On-Hold Review / ${header}`,
      reportNote(queueNotes, header),
    ]),
    ...REPORT_EVIDENCE_HEADERS.map((header) => [
      `Evidence Detail / ${header}`,
      reportNote(evidenceNotes, header),
    ]),
  ];
}
