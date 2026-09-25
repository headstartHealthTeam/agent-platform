import { fileURLToPath } from 'node:url';

/** Source QA and shipped self-tests exercise the corresponding real CLI entrypoint. */
export function syntheticCliArguments(testModuleUrl: string): string[] {
  const source = testModuleUrl.endsWith('.ts');
  return [
    ...(source ? ['--conditions=development', '--import', import.meta.resolve('tsx')] : []),
    fileURLToPath(new URL(source ? './cli.ts' : '../cli.js', testModuleUrl)),
  ];
}
