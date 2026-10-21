import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ArtifactWorkbookProvider,
  WorkbookCell,
  WorkbookMatrix,
} from '@headstart-health/artifact-workbook';

import { exportIntakeWorkbook } from './workbook-export.js';
import type { IntakeWorkbookTables } from './workbook-layout.js';
import { verifyIntakeWorkbook, type IntakeWorkbookVerification } from './workbook-verification.js';

const OPPORTUNITY = 'Opportunity Name';
const PROVIDER = 'Relevant Provider';
const ACTION_TYPE = 'Action Type';
const REVIEWER_NOTES = 'Reviewer Notes';
const EVIDENCE_STATUS = 'Evidence Status';
const DATE = '2026-01-02';
const RUN_ID = 'synthetic-runtime-acceptance';
const NOT_ACCESSED = 'Not accessed';
const HEADERS = [
  OPPORTUNITY,
  'Salesforce',
  'Practice',
  PROVIDER,
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
  ACTION_TYPE,
  'Action Owner',
  'Suggested Follow-Up Date',
  'Ready to Copy',
  'Why Review Needed',
  REVIEWER_NOTES,
  'Copied to Salesforce?',
  'Needs CSM Review',
  'Current SLA Delay Summary',
  'Current Action Item',
  'Next Milestone',
  'Follow-Up Date Basis',
  EVIDENCE_STATUS,
  'Best Source',
  'Reviewed By',
  'Reviewed At',
];
const HOLD_HEADERS = [
  ...HEADERS.slice(0, 29),
  'On Hold Reason',
  'On Hold Start Date',
  'Days On Hold',
  'Restart Condition',
  ...HEADERS.slice(29),
];
const SUMMARY =
  'Synthetic progress is documented. The remaining scheduled session has not completed.';
function operatorTable(headers: readonly string[], onHold: boolean): WorkbookMatrix {
  const values = new Map<string, WorkbookCell>([
    [OPPORTUNITY, 'Synthetic example'],
    ['Salesforce', 'https://example.invalid/synthetic'],
    ['Practice', 'Synthetic practice'],
    [PROVIDER, 'Synthetic provider'],
    ['CSM / Owner', 'Synthetic owner'],
    ['Stage', onHold ? 'On Hold' : 'IA Scheduled'],
    ['Days Breached', 2],
    ['Blocking Gate', 'Scheduled session remains'],
    ['Freshness', 'Current'],
    ['Last Substantive Update Date', DATE],
    ['Last Substantive Update Source', 'Synthetic fixture'],
    ['Last Substantive Update', SUMMARY],
    ['Suggested SLA Summary', SUMMARY],
    [
      'In-Depth Summary',
      `${SUMMARY} No whole-assessment completion is asserted. This fixture contains no patient data.`,
    ],
    ['Outstanding Task Count', 1],
    ['Outstanding Task', 'Monitor the scheduled session'],
    ['Task Owner', 'Synthetic owner'],
    ['Task Status', 'Open'],
    ['Task Due Date', '2026-01-05'],
    [
      'Suggested Action',
      'Monitor the scheduled session and review the completion evidence afterward.',
    ],
    [ACTION_TYPE, 'Monitor'],
    ['Suggested Follow-Up Date', '2026-01-05'],
    ['Ready to Copy', false],
    ['Why Review Needed', 'Synthetic runtime acceptance only'],
    [REVIEWER_NOTES, 'Preserve this synthetic note'],
    ['Copied to Salesforce?', false],
    ['Needs CSM Review', true],
    [EVIDENCE_STATUS, 'Review'],
    ['On Hold Reason', 'Synthetic pause'],
    ['On Hold Start Date', DATE],
    ['Days On Hold', 1],
    ['Restart Condition', 'Review the documented restart condition'],
  ]);
  return [headers, headers.map((header) => values.get(header) ?? '')];
}
/** Synthetic host acceptance data, never a source-evidence substitute for an operational run. */
export function syntheticIntakeWorkbookTables(): IntakeWorkbookTables {
  return {
    'Review Queue': operatorTable(HEADERS, false),
    'On-Hold Review': operatorTable(HOLD_HEADERS, true),
    'Evidence Detail': [
      [
        OPPORTUNITY,
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
        PROVIDER,
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
      ],
      [
        'Synthetic example',
        'synthetic-opportunity',
        'synthetic-sla',
        'Scheduled session remains',
        SUMMARY,
      ],
    ],
    'Source & Run Notes': [
      ['Field', 'Value'],
      ['Run ID', RUN_ID],
      ['Source', 'Synthetic fixture; no live sources accessed'],
    ],
    'Data Dictionary': [
      ['Field', 'Meaning'],
      ['Freshness', 'Existing report category'],
      [REVIEWER_NOTES, 'Reviewer-owned content'],
    ],
    'Run History': [
      [
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
      ],
      [
        RUN_ID,
        DATE,
        1,
        1,
        2,
        0,
        NOT_ACCESSED,
        NOT_ACCESSED,
        NOT_ACCESSED,
        NOT_ACCESSED,
        '',
        'Not published',
      ],
    ],
    'Generation Ledger': [
      [
        'Run ID',
        'Opportunity ID',
        'Assessment Cutoff',
        'Stage',
        'Freshness',
        EVIDENCE_STATUS,
        ACTION_TYPE,
        REVIEWER_NOTES,
        'Published',
        'Source',
        'Count',
        'Result',
      ],
      [
        RUN_ID,
        'synthetic-opportunity',
        DATE,
        'IA Scheduled',
        'Current',
        'Review',
        'Monitor',
        'Preserve synthetic note',
        false,
        'Synthetic',
        2,
        'No external writes',
      ],
    ],
  };
}
/** Separate manually launched host acceptance, not a new gate in the daily workflow. */
export async function smokeIntakeWorkbookRuntime(
  provider: ArtifactWorkbookProvider,
  outputDirectory: string
): Promise<IntakeWorkbookVerification> {
  // A new directory keeps a synthetic test from overwriting an existing run or receipt.
  await fs.mkdir(outputDirectory, { mode: 0o700 });
  const tables = syntheticIntakeWorkbookTables();
  await fs.writeFile(
    path.join(outputDirectory, 'synthetic-workbook-values.json'),
    JSON.stringify({ sheets: tables }, null, 2),
    { mode: 0o600 }
  );
  await exportIntakeWorkbook(provider, tables, outputDirectory);
  return verifyIntakeWorkbook(provider, outputDirectory);
}
