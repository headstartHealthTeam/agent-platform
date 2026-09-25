import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createStructuredResponsesClient,
  type StructuredResponsesClient,
} from '@headstart-health/openai-platform/responses';

import { interpretTranscriptSegmentWithAI } from './ai-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { interpreterConfigFromEnv } from './interpretation-binding.js';

interface PreflightBase {
  readonly schemaVersion: 1;
  readonly checkedAt: string;
  readonly provider: string;
  readonly model: string;
  readonly engineVersion: string;
  readonly store: false;
}
export type InterpretationPreflightArtifact = PreflightBase &
  (
    | {
        readonly passed: true;
        readonly bindingVersion: string;
        readonly credentialSourceApproved: true;
      }
    | {
        readonly passed: false;
        readonly failure: 'Synthetic structured-response preflight failed.';
      }
  );
export interface InterpretationPreflightInput {
  readonly runDirectory: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly createClient?: (apiKey: string | undefined) => StructuredResponsesClient;
  readonly now?: () => Date;
}
function preflightClient(apiKey: string | undefined): StructuredResponsesClient {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for AI transcript interpretation.');
  return createStructuredResponsesClient({ apiKey });
}
/** Existing synthetic packet and receipt; API execution remains in the shared Responses provider. */
export async function preflightInterpretation({
  runDirectory,
  env = process.env,
  createClient = preflightClient,
  now = (): Date => new Date(),
}: InterpretationPreflightInput): Promise<InterpretationPreflightArtifact> {
  if (env['SLA_AI_INTERPRETATION'] !== 'on')
    throw new Error('SLA_AI_INTERPRETATION must be exactly on');
  const config = interpreterConfigFromEnv(env, { requireCredentialSource: true });
  const client = createClient(env['OPENAI_API_KEY']);
  const artifactPath = path.join(path.resolve(runDirectory), 'ai_interpretation_preflight.json');
  try {
    const result = await interpretTranscriptSegmentWithAI({
      profile: {
        opportunityId: 'synthetic-opportunity',
        opportunityName: 'Synthetic Client',
        knownNameVariants: ['Synthetic Client'],
        providerRoles: [],
        providerRoster: [],
        stage: 'Synthetic Stage',
      },
      gate: {
        processPosition: 'Synthetic process position',
        unresolvedGate: 'Synthetic scheduling confirmation',
        gateCategory: 'Synthetic',
      },
      sourceRecordId: 'synthetic-meeting:1',
      eventDate: '2026-01-01',
      segment: 'A synthetic provider confirmed a synthetic appointment for January 2, 2026.',
      matchQuality: 'Direct',
      client,
      model: config.model,
      provider: config.provider,
      engineVersion: EVIDENCE_ENGINE_VERSION,
    });
    const artifact: InterpretationPreflightArtifact = {
      schemaVersion: 1,
      passed: true,
      checkedAt: now().toISOString(),
      provider: config.provider,
      model: config.model,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      bindingVersion: result.binding.bindingVersion,
      store: false,
      credentialSourceApproved: true,
    };
    await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
    return artifact;
  } catch {
    const failure: InterpretationPreflightArtifact = {
      schemaVersion: 1,
      passed: false,
      checkedAt: now().toISOString(),
      provider: config.provider,
      model: config.model,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      store: false,
      failure: 'Synthetic structured-response preflight failed.',
    };
    await fs.writeFile(artifactPath, `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
    return failure;
  }
}
