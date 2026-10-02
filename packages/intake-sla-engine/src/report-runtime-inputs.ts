import path from 'node:path';

import {
  createStructuredResponsesClient,
  type StructuredResponsesClient,
} from '@headstart-health/openai-platform/responses';
import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import type { FirefliesSuppliedInterpretation } from './fireflies-evidence-types.js';
import { optionalPrivateJson, readPrivateJson } from './private-run-storage.js';
import type { ReportIdentityRegistries } from './report-identity.js';
import {
  prepareReportInterpreterSelection,
  type PreparedReportInterpreter,
} from './report-interpreter-setup.js';
import {
  decodeReportPrecomputedArtifact,
  indexSavedReportInterpretations,
} from './report-saved-interpretations.js';
export { decodeReportPrecomputedArtifact } from './report-saved-interpretations.js';

const strings = z.array(z.string());

const clientsSchema = z.object({
  version: z.string(),
  clients: z.array(
    z.looseObject({
      opportunityIds: strings.nullable().optional(),
      names: strings.nullable().optional(),
      practiceIds: strings.nullable().optional(),
      aliases: strings.nullable().optional(),
      evidence: z.unknown().optional(),
    })
  ),
});
const providersSchema = z.object({
  version: z.string(),
  providers: z.array(
    z.looseObject({
      salesforceIds: strings,
      names: strings,
      emails: strings,
      phones: strings.nullish(),
      practiceAliases: strings.nullish(),
      meetingAliases: strings.nullish(),
      portalProviderIds: strings.nullish(),
      csmNames: strings.nullish(),
      csmEmails: strings.nullish(),
    })
  ),
});
/** Registries are private operator configuration, never bundled patient/provider records. */
export async function loadReportIdentityRegistries(input: {
  readonly clientRegistryPath: string;
  readonly providerRegistryPath: string;
}): Promise<ReportIdentityRegistries> {
  const clients = preserveCollectionRecord(clientsSchema).safeParse(
    await readPrivateJson(input.clientRegistryPath)
  );
  const providers = preserveCollectionRecord(providersSchema).safeParse(
    await readPrivateJson(input.providerRegistryPath)
  );
  if (!clients.success || !providers.success)
    throw new Error('Invalid private report identity registry');
  return { clients: clients.data, providers: providers.data };
}
export async function loadReportInterpreter(input: {
  readonly runDirectory: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly createClient?: (apiKey: string) => StructuredResponsesClient;
  readonly now?: number;
}): Promise<PreparedReportInterpreter<FirefliesSuppliedInterpretation>> {
  const { environment: env } = input;
  const requested = (env['SLA_AI_INTERPRETATION'] ?? '').trim() === 'on';
  const apiKey = env['OPENAI_API_KEY'];
  const client =
    requested && apiKey
      ? (
          input.createClient ??
          ((key: string): StructuredResponsesClient =>
            createStructuredResponsesClient({ apiKey: key }))
        )(apiKey)
      : null;
  const raw = await optionalPrivateJson(
    path.join(input.runDirectory, 'ai_interpretation_precomputed.json')
  );
  const artifact = decodeReportPrecomputedArtifact(raw === undefined ? { rows: [] } : raw);
  const selection = prepareReportInterpreterSelection({
    setting: env['SLA_AI_INTERPRETATION'],
    environment: env,
    client,
    artifact: artifact.raw,
    preflight: client
      ? await optionalPrivateJson(path.join(input.runDirectory, 'ai_interpretation_preflight.json'))
      : undefined,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  return {
    ...selection,
    artifact,
    precomputed: indexSavedReportInterpretations(artifact, selection),
  };
}
