import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { collectSkillFiles } from '@headstart-health/workflow-runtime';

import { hostedDeliveryDefinition } from './hosted-delivery-definition.js';

// Generated deployment artifact: one canonical skill, connected entry prompt and public schemas.
// No fixtures, oracle proposals, credentials or private case material enter it.
const repository = new URL('../../../', import.meta.url);
const root = '/workspace/headstart-workflow';
const skillFiles = await collectSkillFiles(fileURLToPath(repository), [
  'headstart-provider-credentialing',
]);
const workflowFiles = await Promise.all(
  [
    'prompts/connected.md',
    'schemas/production-read-input.schema.json',
    'schemas/input.schema.json',
    'schemas/output.schema.json',
  ].map(async (path) => ({
    path: `workflows/provider-credentialing/${path}`,
    data: (await readFile(new URL(`../${path}`, import.meta.url))).toString('base64'),
  }))
);
const definition = {
  instructions: `Use the headstart-provider-credentialing skill. Before investigating or acting, read ${root}/skills/headstart-provider-credentialing/SKILL.md and ${root}/workflows/provider-credentialing/prompts/connected.md completely. Follow their evidence and human-authority boundaries. Read the referenced supporting files as needed; all relevant supplied tools remain available for investigation. If these required files are unavailable, report the setup failure instead of improvising or substituting a summary.`,
  capabilities: {
    directories: [`${root}/skills`],
    files: [...skillFiles, ...workflowFiles].map((file) => ({
      ...file,
      path: `${root}/${file.path}`,
    })),
  },
  tools: [
    hostedDeliveryDefinition,
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
