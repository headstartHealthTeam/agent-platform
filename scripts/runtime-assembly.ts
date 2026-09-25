import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { posix, resolve, sep } from 'node:path';

import { parse, stringify } from 'yaml';

const PACKAGE_JSON = 'package.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  return value;
}
async function json(file: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(file, 'utf8'));
  return record(value, 'package manifest');
}
interface RuntimePackage {
  readonly name: string;
  readonly location: string;
  readonly manifest: Record<string, unknown>;
}
function dependencies(manifest: Record<string, unknown>): string[] {
  return ['dependencies', 'optionalDependencies'].flatMap((field) =>
    Object.entries(record(Reflect.get(manifest, field) ?? {}, field))
      .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
      .map(([name]) => name)
  );
}
async function runtimePackages(root: string, engine: string): Promise<RuntimePackage[]> {
  const inventory = new Map<string, RuntimePackage>();
  for (const entry of await readdir(resolve(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const location = `packages/${entry.name}`;
    const manifest = await json(resolve(root, location, PACKAGE_JSON));
    if (typeof manifest['name'] !== 'string') throw new Error('Package name missing');
    inventory.set(manifest['name'], { name: manifest['name'], location, manifest });
  }
  const selected = new Map<string, RuntimePackage>();
  const visit = (name: string): void => {
    if (selected.has(name)) return;
    const item = inventory.get(name);
    if (!item) throw new Error('Runtime workspace dependency is unavailable');
    selected.set(name, item);
    for (const dependency of dependencies(item.manifest)) visit(dependency);
  };
  visit(engine);
  return [...selected.values()];
}
function transformedImporter(
  input: unknown,
  location: string,
  locations: ReadonlyMap<string, string>
): Record<string, unknown> {
  const original = record(input, 'runtime lockfile importer');
  const result = { ...original };
  for (const group of ['dependencies', 'optionalDependencies']) {
    const sourceGroup: unknown = Reflect.get(original, group);
    if (sourceGroup === undefined) continue;
    Reflect.set(
      result,
      group,
      Object.fromEntries(
        Object.entries(record(sourceGroup, group)).map(([name, value]) => {
          const dependency = record(value, 'locked dependency');
          const destination = locations.get(name);
          if (destination === undefined) return [name, dependency];
          return [
            name,
            { ...dependency, version: `link:${posix.relative(location, destination) || '.'}` },
          ];
        })
      )
    );
  }
  return result;
}
async function copyBuiltPackage(
  source: string,
  target: string,
  manifest: Record<string, unknown>
): Promise<void> {
  await mkdir(target, { recursive: true });
  const files: unknown = manifest['files'] ?? ['dist', 'README.md'];
  if (!Array.isArray(files)) throw new Error('Invalid package distribution inventory');
  for (const entry of files) {
    if (typeof entry !== 'string' || entry.includes('*') || entry.includes('\\') || entry === 'src')
      throw new Error('Runtime distribution requires explicit built asset paths');
    const from = resolve(source, entry);
    if (!from.startsWith(`${source}${sep}`) || (await lstat(from)).isSymbolicLink())
      throw new Error('Invalid runtime asset path');
    await cp(from, resolve(target, entry), { recursive: true, errorOnExist: true, force: false });
  }
  await writeFile(resolve(target, PACKAGE_JSON), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
  });
}
/** Copy only the selected built runtime closure; no Git checkout, private config or root tooling. */
export async function assembleRuntimeWorkspace(input: {
  readonly sourceRoot: string;
  readonly target: string;
  readonly engine: string;
}): Promise<readonly string[]> {
  const packages = await runtimePackages(input.sourceRoot, input.engine);
  const locations = new Map(
    packages.map((item) => [item.name, item.name === input.engine ? '.' : item.location])
  );
  const rootManifest = await json(resolve(input.sourceRoot, PACKAGE_JSON));
  const sourceLock: unknown = parse(
    await readFile(resolve(input.sourceRoot, 'pnpm-lock.yaml'), 'utf8')
  );
  const lock = record(sourceLock, 'source lockfile');
  const importers = record(lock['importers'], 'source lockfile importers');
  const relocated: Record<string, unknown> = {};
  for (const item of packages) {
    const location = locations.get(item.name);
    if (location === undefined) throw new Error('Missing runtime package location');
    const manifest =
      item.name === input.engine
        ? {
            ...item.manifest,
            packageManager: rootManifest['packageManager'],
            pnpm: rootManifest['pnpm'],
          }
        : item.manifest;
    await copyBuiltPackage(
      resolve(input.sourceRoot, item.location),
      resolve(input.target, location),
      manifest
    );
    Reflect.set(
      relocated,
      location,
      transformedImporter(Reflect.get(importers, item.location), location, locations)
    );
  }
  await writeFile(
    resolve(input.target, 'pnpm-workspace.yaml'),
    stringify({ packages: ['packages/*'] }),
    { flag: 'wx' }
  );
  await writeFile(
    resolve(input.target, 'pnpm-lock.yaml'),
    stringify({ ...lock, importers: relocated }),
    { flag: 'wx' }
  );
  return packages.map((item) => item.name);
}
