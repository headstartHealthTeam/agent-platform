import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { z } from 'zod';

const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    ['', '443', '8443'].includes(url.port) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
});
export const hostedRuntimeSelection = z
  .object({
    fileId: z.string().regex(/^file-[A-Za-z0-9_-]+$/),
    archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
    runtimeRevision: z.string().regex(/^[a-f0-9]{64}$/),
    mcpUrl: httpsUrl,
    googleTokenUrl: httpsUrl,
    googleAccountEmail: z.email(),
    // Exact hosts are the existing renewable-credential boundary, not case-folder restrictions.
    allowedDomains: z.array(z.string().regex(/^[a-zA-Z0-9.-]+$/)).min(1),
  })
  .strict();

export function credentialingHostedTemplate(input: unknown): Readonly<Record<string, unknown>> {
  const value = hostedRuntimeSelection.parse(input);
  if (new URL(value.mcpUrl).host !== new URL(value.googleTokenUrl).host)
    throw new Error('MCP and Google renewal must share the run credential destination');
  const domains = new Set(value.allowedDomains);
  for (const url of [
    value.mcpUrl,
    value.googleTokenUrl,
    'https://www.googleapis.com',
    'https://docs.googleapis.com',
    'https://sheets.googleapis.com',
    'https://slides.googleapis.com',
  ]) {
    if (!domains.has(new URL(url).hostname)) throw new Error('Missing required runtime host');
  }
  const root = '/workspace/headstart-workflow';
  const archive = '/workspace/headstart-runtime.tar.gz';
  const bootstrap = `const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
if (process.platform !== 'linux' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Unsupported hosted runtime');
const bytes = fs.readFileSync('${archive}');
if (crypto.createHash('sha256').update(bytes).digest('hex') !== '${value.archiveSha256}') throw new Error('Runtime archive mismatch');
fs.mkdirSync('${root}');
cp.execFileSync('tar', ['-xzf', '${archive}', '-C', '${root}'], {stdio: 'ignore'});
const receipt = JSON.parse(fs.readFileSync('${root}/runtime-receipt.json', 'utf8'));
if (receipt.sourceDirty || receipt.runtimeRevision !== '${value.runtimeRevision}' || receipt.runtime.platform !== 'linux' || receipt.runtime.architecture !== 'x64') throw new Error('Runtime release mismatch');
for (const entry of Object.values(receipt.entrypoints)) fs.accessSync('${root}/' + entry);
fs.accessSync('${root}/skills/headstart-provider-credentialing/SKILL.md');
fs.accessSync('${root}/workflows/provider-credentialing/prompts/connected.md');
`;
  const inline = (
    path: string,
    content: unknown
  ): { type: string; path: string; data: string } => ({
    type: 'inline',
    path,
    data: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)).toString(
      'base64'
    ),
  });
  return {
    operation: 'templates.create',
    body: {
      name: `credentialing-${value.runtimeRevision.slice(0, 12)}`,
      files: [
        { type: 'file_id', path: archive, file_id: value.fileId },
        inline('/workspace/install-headstart.cjs', bootstrap),
        inline('/workspace/mcp-profile.json', {
          serverUrl: value.mcpUrl,
          authorizationEnv: 'HEADSTART_MCP_AUTHORIZATION',
        }),
        inline('/workspace/drive-profile.json', {
          expectedIdentity: value.googleAccountEmail,
          authentication: {
            kind: 'token-endpoint',
            endpoint: value.googleTokenUrl,
            authorizationEnvironmentVariable: 'HEADSTART_MCP_AUTHORIZATION',
          },
        }),
      ],
      capability_directories: [`${root}/skills`],
      setup_commands: [{ command: 'node /workspace/install-headstart.cjs', cwd: '/workspace' }],
      network: { access: 'restricted', allowed_domains: [...domains].sort() },
    },
  };
}
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { selection: { type: 'string' }, archive: { type: 'string' } },
    strict: true,
  });
  if (!values.selection || !values.archive)
    throw new Error('--selection and --archive are required');
  const selection = hostedRuntimeSelection.parse(
    JSON.parse(await readFile(values.selection, 'utf8'))
  );
  const archive = await readFile(values.archive);
  if (
    archive.length > 50 * 1024 * 1024 ||
    createHash('sha256').update(archive).digest('hex') !== selection.archiveSha256
  )
    throw new Error('Invalid runtime archive');
  process.stdout.write(`${JSON.stringify(credentialingHostedTemplate(selection), null, 2)}\n`);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Hosted template selection invalid; no private output emitted.\n');
    process.exitCode = 1;
  });
}
