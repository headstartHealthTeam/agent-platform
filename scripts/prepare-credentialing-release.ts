import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { packageBackendIntegration } from './package-backend-integration.js';
import { packageCredentialingRuntime } from './package-credentialing-runtime.js';
import { runRuntimeCommand, type RuntimeCommand } from './runtime-packaging.js';
import { securityPreflight, verifySecurityPreflight } from './security-preflight.js';
import { verifyCredentialingRuntime } from './verify-credentialing-runtime.js';

/** Prepare both existing artifacts and their handoff; never upload, configure or deploy anything. */
export async function prepareCredentialingRelease(
  sourceRoot: string,
  target: string,
  expectedSource: string,
  command: RuntimeCommand = runRuntimeCommand,
  verifyRuntime: (runtime: string) => Promise<void> = verifyCredentialingRuntime
): Promise<void> {
  const root = await realpath(sourceRoot);
  const destination = resolve(target);
  const parent = await realpath(dirname(destination));
  if (
    !isAbsolute(target) ||
    parent !== dirname(destination) ||
    destination === root ||
    destination.startsWith(`${root}${sep}`) ||
    root.startsWith(`${destination}${sep}`)
  )
    throw new Error(
      'Release output must be a new absolute directory outside source with a resolved parent'
    );
  const security = await securityPreflight(root, expectedSource, command);
  await mkdir(destination);
  const runtimePath = resolve(destination, 'runtime');
  const runtime = await packageCredentialingRuntime(root, runtimePath, command);
  await verifyRuntime(runtimePath);
  const integration = await packageBackendIntegration(
    root,
    resolve(destination, 'backend-integration'),
    command
  );
  if (
    runtime['sourceRevision'] !== expectedSource ||
    integration['sourceRevision'] !== expectedSource ||
    runtime['runtimeRevision'] !== integration['runtimeRevision'] ||
    runtime['sourceDirty'] !== false
  )
    throw new Error('Paired release identities do not match');
  await verifySecurityPreflight(security, root, expectedSource, command);
  // Written last: a partial directory without a handoff is never a completed release.
  await writeFile(
    resolve(destination, 'handoff.json'),
    `${JSON.stringify(
      {
        schemaVersion: 'headstart-credentialing-release-handoff/v1',
        security,
        backendReleasePin: {
          repository: 'headstartHealthTeam/agent-platform',
          revision: expectedSource,
        },
        runtime,
        integration,
        configurationRequired: true,
      },
      null,
      2
    )}\n`,
    { flag: 'wx' }
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      'expected-source': { type: 'string' },
    },
    strict: true,
  });
  if (!values.target || !values['expected-source'])
    throw new Error('Target and expected source required');
  await prepareCredentialingRelease(
    fileURLToPath(new URL('..', import.meta.url)),
    values.target,
    values['expected-source']
  );
  process.stdout.write(
    'Paired release prepared. Cloud configuration and deployment remain separate.\n'
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Paired release preparation failed; do not use partial outputs.\n');
    process.exitCode = 1;
  });
}
