import fs from 'node:fs/promises';
import path from 'node:path';

export interface DistributionFinding {
  readonly file: string;
  readonly reason: string;
}
export interface DistributionSafetyResult {
  readonly passed: boolean;
  readonly filesChecked: number;
  readonly findings: readonly DistributionFinding[];
}
const FORBIDDEN_FILES = new Set([
  'config/client-identity-aliases.json',
  'config/provider-identity-aliases.json',
  'config/production-fingerprint.json',
  'reviewer_state.json',
  'generation_ledger_state.json',
  'generation_ledger_baseline.json',
  'google_batch_request.json',
  'publication_readback_incomplete.json',
  'reviewer_payload_preservation_proof.json',
  'note_adjudications.json',
  'note_adjudication_packets.json',
  'note_adjudication_receipts.json',
]);
const FORBIDDEN_PREFIXES = [
  'outputs/',
  'runs/',
  'fixtures/baseline/',
  'fixtures/historical/',
  'fixtures/live/',
];
const FORBIDDEN_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.tsv', '.jsonl']);
const OPERATIONAL =
  /(^|\/)([^/]+-checkpoints\/|(?:portal_auth_request_capture|portal_auth_request_inventory|slack_search_capture|slack_bounded_delta|google_state_capture|runtime_preflight|correction_provenance|correction_initialization|structured_correction_delta|publication_capture_[^/]+|publication_execution_[^/]+|publication_actual_[^/]+|publication_final_[^/]+|[a-z-]+_checkpoint_inventory|[a-z-]+_pending_requests)\.json$)/;
const FIREFLIES =
  /(^|\/)(fireflies-cache\/|fireflies-body-checkpoints\/|fireflies-read-session\/|generation_ledger_baseline\.json$|fireflies_cache_[^/]*\.json$|fireflies_bounded_[^/]*\.json$|fireflies_discovery(?:_raw|_normalization)?\.json$|fireflies_(?:fetched_transcripts|collection_mode|candidate_fetch_manifest|pending_fetches|search_execution)\.json$)/;
const BODY =
  /(^|\/)(fireflies_body_(?:raw|normalization)_\d+|reviewer_payload_preservation_proof)\.json$/;
const RETIRED_MODEL = /(?:gpt[-_])?5[-_]mini/i;

function forbiddenPath(file: string): boolean {
  return (
    FORBIDDEN_FILES.has(file) ||
    FORBIDDEN_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
    FORBIDDEN_EXTENSIONS.has(path.extname(file).toLowerCase()) ||
    OPERATIONAL.test(file) ||
    FIREFLIES.test(file) ||
    BODY.test(file)
  );
}
async function files(directory: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.turbo', 'coverage'].includes(entry.name)) continue;
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      result.push(...(await files(path.join(directory, entry.name), `${name}/`)));
    else result.push(name);
  }
  return result;
}
/** Approved distribution-data checks, scoped to Intake's package rather than unrelated platform workflows. */
export async function checkIntakeDistribution(
  directory: string
): Promise<DistributionSafetyResult> {
  const inventory = await files(directory);
  const findings: DistributionFinding[] = [];
  for (const file of inventory) {
    if (forbiddenPath(file)) {
      findings.push({ file, reason: 'runtime or operational data path' });
      continue;
    }
    const full = path.join(directory, file);
    if ((await fs.stat(full)).size > 2_000_000) {
      findings.push({ file, reason: 'unexpected file larger than 2 MB' });
      continue;
    }
    const text = await fs.readFile(full, 'utf8').catch(() => '');
    for (const [pattern, reason] of [
      [/\/Users\/jimmyjameson\/Documents\/SLA Summary/, 'personal operational path'],
      [
        /lightning\/r\/Opportunity\/006[A-Za-z0-9]{12,15}\/view/,
        'concrete Salesforce Opportunity URL',
      ],
      [/\b006[A-Za-z0-9]{12,15}\b/, 'concrete Salesforce Opportunity ID'],
      [/\b[A-Z0-9._%+-]+@gmail\.com\b/i, 'personal email address'],
      [RETIRED_MODEL, 'retired implicit interpreter model'],
    ] as const)
      if (pattern.test(text)) findings.push({ file, reason });
  }
  return { passed: findings.length === 0, filesChecked: inventory.length, findings };
}
