import {
  qualityRowFinding,
  qualityAuditText,
  type QualityRowContext,
  type WorkbookQualityFinding,
} from './workbook-quality-types.js';

const stageVocabulary: readonly (readonly [RegExp, RegExp])[] = [
  [/^IA Requested$/i, /authorization|payer|deni|appeal|information|document/i],
  [/^TA Requested$/i, /authorization|payer|deni|appeal|information|document/i],
  [/IA Approved|IA Scheduled|IC Completed/i, /assessment|\bIA\b|97151|family|provider|schedule/i],
  [/97151 Started/i, /treatment[- ]plan|clinical|vineland|basc|signature|provider|family/i],
  [
    /Treatment Plan In-review/i,
    /clinical|review|edit|revision|submission|signature|provider|family/i,
  ],
  [
    /TA Approved|First Day of 97153/i,
    /RBT|97153|direct-care|staff|candidate|start|provider|family/i,
  ],
];

function ownerMismatch({ row, action, owner }: QualityRowContext): boolean {
  if (!action || !owner || String(row['Action Type']) === 'No Action') return false;
  const ownerNamed = action.toLowerCase().startsWith(owner.toLowerCase());
  const acceptedTeam = /^(?:Insurance Ops|Intake|RBT Team|Provider|Family)\s+to\b/i.test(action);
  return !ownerNamed && !acceptedTeam;
}

export function auditWorkbookReadiness(context: QualityRowContext): WorkbookQualityFinding[] {
  const { row, summary, detail, owner, reviewReason, updateDate } = context;
  const findings: WorkbookQualityFinding[] = [];
  const add = (
    severity: WorkbookQualityFinding['severity'],
    rule: string,
    message: string
  ): void => {
    findings.push(qualityRowFinding(row, severity, rule, message));
  };
  if (
    /^Insurance Verification$/i.test(String(row['Stage'])) &&
    /insurance verification was resolved/i.test(detail)
  )
    add(
      'Warning',
      'overbroad-resolved-stage',
      'Narrative says the entire current stage was resolved instead of naming the completed VOB or eligibility check.'
    );
  if (
    row['Last Substantive Update Source'] === 'Fireflies' &&
    /failed segments were not admitted as evidence/i.test(reviewReason)
  )
    add(
      'Critical',
      'source-gap-contradiction',
      'Fireflies is the selected update but the review reason says its segment was not admitted.'
    );
  if (ownerMismatch(context))
    add('Critical', 'action-owner-language', `Action does not name ${owner}.`);
  if (
    row['Ready to Copy'] === 'Yes' &&
    (Boolean(row['Why Review Needed']) ||
      /Blocked|Conflicting/i.test(String(row['Evidence Status'])))
  )
    add(
      'Critical',
      'copy-readiness',
      'Row is copy-ready despite a review reason or evidence failure.'
    );
  const gate = `${qualityAuditText(row['Blocking Gate'] ?? '')} ${qualityAuditText(row['Primary Blocker'] ?? '')}`;
  const vocabulary = /authorization|payer|deni|appeal|insurance/i.test(gate)
    ? /authorization|payer|deni|appeal|information|document/i
    : stageVocabulary.find(([stage]) => stage.test(String(row['Stage'])))?.[1];
  if (vocabulary && !vocabulary.test(summary))
    add('Warning', 'stage-language', 'Summary does not contain expected current-stage vocabulary.');
  if (updateDate && !/^\d{4}-\d{2}-\d{2}$/.test(updateDate))
    add('Critical', 'update-date-format', `Unexpected date: ${updateDate}`);
  return findings;
}
