import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Generated deployment artifact: one canonical skill, connected entry prompt and public schemas.
// No fixtures, oracle proposals, credentials or private case material enter it.
const text = (path: string): Promise<string> => readFile(new URL(path, import.meta.url), 'utf8');
const [skill, prompt, productionInput, syntheticInput, output] = await Promise.all([
  text('../../../skills/headstart-provider-credentialing/SKILL.md'),
  text('../prompts/connected.md'),
  text('../schemas/production-read-input.schema.json'),
  text('../schemas/input.schema.json'),
  text('../schemas/output.schema.json'),
]);
const compact = (value: string): string => JSON.stringify(JSON.parse(value) as unknown);
const definition = {
  instructions: [
    prompt,
    skill,
    '## Production-read input schema',
    compact(productionInput),
    '## Synthetic input schema',
    compact(syntheticInput),
    '## Proposal schema',
    compact(output),
  ].join('\n\n'),
  tools: [
    {
      type: 'function',
      name: 'ask_operator',
      description:
        'Ask the reviewer an unresolved evidence, access or reconciliation question. Never request secrets or treat the answer as action approval.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' }, evidenceReference: { type: 'string' } },
        required: ['question'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'get_credentialing_review_context',
      description:
        'Read the current server-bound case, revisions, permitted preparation scope and saved reviewer feedback. No source-system writes.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      type: 'function',
      name: 'capture_credentialing_source_document',
      description:
        'Retain an exact original Salesforce file as evidence for the bound case, including relevant shared business and payer sources. Pass its discovered sourceObject; subject identifies which case subject the evidence informs, not ownership of the original. Returns verified artifact identity, digest and media type, never bytes or URLs. Read-only at Salesforce; writes protected application retention. Not a search or conversion tool.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', enum: ['provider', 'practice'] },
          sourceObject: {
            type: 'string',
            enum: [
              'Headstart_Provider_Profile__c',
              'Headstart_Business_Profile__c',
              'Licensure_Certification_Record__c',
              'INS_Network_Affiliation__c',
              'Account',
              'Task',
            ],
          },
          linkedRecordId: { type: 'string' },
          contentDocumentId: { type: 'string' },
          contentVersionId: { type: 'string' },
        },
        required: [
          'subject',
          'sourceObject',
          'linkedRecordId',
          'contentDocumentId',
          'contentVersionId',
        ],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'publish_credentialing_review_package',
      description:
        'Save a complete cited snapshot and proposal for human review. Does not authorize or perform source/payer writes. Re-read context on stale versions.',
      parameters: {
        type: 'object',
        properties: {
          expectedVersion: { type: 'integer', minimum: 0 },
          inputJson: { type: 'string' },
          proposalJson: { type: 'string' },
        },
        required: ['expectedVersion', 'inputJson', 'proposalJson'],
        additionalProperties: false,
      },
    },
  ],
};
const workflowRevision = createHash('sha256').update(JSON.stringify(definition)).digest('hex');
await writeFile(
  new URL('../dist/preparation-definition.json', import.meta.url),
  JSON.stringify(
    { protocol: 'credentialing-preparation/v1', workflowRevision, definition },
    null,
    2
  ) + '\n'
);
