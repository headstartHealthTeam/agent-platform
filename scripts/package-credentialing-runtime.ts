import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import {
  packageWorkspaceRuntime,
  runRuntimeCommand,
  runtimeFingerprint,
  type RuntimeCommand,
} from './runtime-packaging.js';

const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const sourceDefinition = z.object({
  protocol: z.literal('credentialing-preparation/v1'),
  definition: z.object({
    instructions: z.string(),
    capabilities: z.object({ files: z.array(z.object({ path: z.string(), data: z.string() })) }),
    tools: z.array(z.record(z.string(), z.unknown())),
  }),
});
const runtimeRoot = '/workspace/headstart-workflow';

/** The release identity is reproducible on the backend build host and the hosted Linux builder.
 * Native dependencies have a separate byte digest; neither identity is a mutable branch name.
 */
export interface CredentialingReleaseDefinition {
  sourceRevision: string;
  files: z.infer<typeof sourceDefinition>['definition']['capabilities']['files'];
  artifact: {
    protocol: string;
    workflowRevision: string;
    definition: { instructions: string; runtimeRevision: string; tools: Record<string, unknown>[] };
  };
}
export async function credentialingReleaseDefinition(
  sourceRoot: string,
  command: RuntimeCommand = runRuntimeCommand
): Promise<CredentialingReleaseDefinition> {
  const sourceRevision = (await command('git', ['rev-parse', 'HEAD'], sourceRoot)).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('Invalid release source revision');
  const lock = await readFile(resolve(sourceRoot, 'pnpm-lock.yaml'));
  const bytes = await readFile(
    resolve(sourceRoot, 'workflows/provider-credentialing/dist/preparation-definition.json')
  );
  const canonical = sourceDefinition.parse(JSON.parse(bytes.toString('utf8')));
  const runtimeRevision = sha(`${sourceRevision}\n${sha(lock)}\n${sha(bytes)}\n`);
  const definition = {
    instructions: `${canonical.definition.instructions} Read ${runtimeRoot}/RUNTIME.md for the installed tool entrypoints and deployment profiles.`,
    runtimeRevision,
    tools: canonical.definition.tools,
  };
  return {
    sourceRevision,
    files: canonical.definition.capabilities.files,
    artifact: {
      protocol: canonical.protocol,
      workflowRevision: sha(JSON.stringify(definition)),
      definition,
    },
  };
}

export async function packageCredentialingRuntime(
  sourceRoot: string,
  target: string,
  command: RuntimeCommand = runRuntimeCommand
): Promise<Readonly<Record<string, unknown>>> {
  const release = await credentialingReleaseDefinition(sourceRoot, command);
  const receipt = await packageWorkspaceRuntime({
    sourceRoot,
    command,
    target,
    packageName: '@headstart-health/workflow-provider-credentialing',
    packageDirectory: 'workflows/provider-credentialing',
    schemaVersion: 'headstart-credentialing-runtime/v1',
    buildEntries: ['index.js', 'preparation-definition.json', 'preparation-preflight-cli.cjs'],
    entrypoints: {
      'headstart-credentialing-preflight': 'dist/preparation-preflight-cli.cjs',
      'headstart-drive-read': 'node_modules/@headstart-health/google-drive-data/dist/cli.js',
      'headstart-mcp-document': 'node_modules/@headstart-health/headstart-mcp-data/dist/cli.js',
      'headstart-document': 'node_modules/@headstart-health/document-reading/dist/cli.js',
    },
  });
  for (const file of release.files) {
    if (!file.path.startsWith(`${runtimeRoot}/`) || file.path.split('/').includes('..'))
      throw new Error('Invalid canonical runtime file');
    const destination = resolve(target, file.path.slice(runtimeRoot.length + 1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(file.data, 'base64'), { flag: 'wx' });
  }
  await writeFile(
    resolve(target, 'RUNTIME.md'),
    `# Installed credentialing runtime\n\nThis runtime is Agent Platform-owned and can be run outside the backend.\n\nUse Node 22 or later. Run these tools from this directory:\n\n- Drive originals and native Google document bodies: \`node node_modules/@headstart-health/google-drive-data/dist/cli.js --profile /workspace/drive-profile.json --request <request.json> --output <fresh-directory>\`.\n- MCP original files: \`node node_modules/@headstart-health/headstart-mcp-data/dist/cli.js --profile /workspace/mcp-profile.json --request <request.json> --output <fresh-directory>\`.\n- Local full text/pages/original evidence: \`node node_modules/@headstart-health/document-reading/dist/cli.js\`; read its packaged README for arguments.\n- Canonical package semantics: \`node dist/preparation-preflight-cli.cjs --input <snapshot.json> --proposal <proposal.json>\`. Reads local files only, reports readiness or correction issues, and queues nothing. Run before publication; application admission and final retained-source/authority checks remain independent.\n\nRead each tool's packaged README for its complete request contract. Tools remain available for investigation outside a prescribed sequence. Profiles contain configuration, never long-lived credentials. Hosted credentials are supplied at launch; standalone local profiles may use the tools' existing local authentication. Do not copy credentials into outputs or conversations.\n`,
    { flag: 'wx' }
  );
  await writeFile(
    resolve(target, 'prepared-definition.json'),
    `${JSON.stringify(release.artifact, null, 2)}\n`,
    { flag: 'wx' }
  );
  const finalReceipt = {
    ...receipt,
    runtimeRevision: release.artifact.definition.runtimeRevision,
    artifactSha256: await runtimeFingerprint(target),
  };
  await writeFile(
    resolve(target, 'runtime-receipt.json'),
    `${JSON.stringify(finalReceipt, null, 2)}\n`
  );
  return finalReceipt;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { target: { type: 'string' }, 'definition-only': { type: 'boolean' } },
    strict: true,
  });
  const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
  if (values['definition-only']) {
    process.stdout.write(
      `${JSON.stringify((await credentialingReleaseDefinition(sourceRoot)).artifact, null, 2)}\n`
    );
    return;
  }
  if (!values.target) throw new Error('--target is required');
  process.stdout.write(
    `${JSON.stringify(await packageCredentialingRuntime(sourceRoot, values.target), null, 2)}\n`
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Credentialing runtime packaging failed; no private output emitted.\n');
    process.exitCode = 1;
  });
}
