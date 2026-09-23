import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const providers = [
  'google-read-transport',
  'google-sheets-data',
  'salesforce-read',
  'fireflies-data',
  'slack-data',
  'openai-platform',
  'openai-responses',
];

interface PackageRecord {
  readonly name: string;
  readonly dependencies: readonly string[];
}

function packageRecord(directory: string): PackageRecord {
  const input: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  return parsePackageRecord(input);
}

function parsePackageRecord(input: unknown): PackageRecord {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('name' in input) ||
    typeof input.name !== 'string'
  )
    throw new Error('Invalid workspace package');
  const edges = [
    'dependencies' in input ? input.dependencies : {},
    'optionalDependencies' in input ? input.optionalDependencies : {},
    'peerDependencies' in input ? input.peerDependencies : {},
  ];
  const dependencies = edges.flatMap((edge) => {
    if (typeof edge !== 'object' || edge === null || Array.isArray(edge)) {
      throw new Error('Invalid workspace dependencies');
    }
    return Object.keys(edge);
  });
  return { name: input.name, dependencies };
}

function assertIndependent(name: string, packages: ReadonlyMap<string, PackageRecord>): void {
  const pending = [name];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const dependency = pending.pop();
    if (dependency === undefined || visited.has(dependency)) continue;
    visited.add(dependency);
    if (dependency.includes('intake-sla'))
      throw new Error(`${name} depends on the consuming Intake engine`);
    pending.push(...(packages.get(dependency)?.dependencies ?? []));
  }
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('Intake provider package dependency direction', () => {
  it('keeps shared providers independent of Intake, including transitive workspace dependencies', () => {
    const packages = new Map<string, PackageRecord>();
    for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
      const directory = join(root, 'packages', entry.name);
      if (entry.isDirectory() && existsSync(join(directory, 'package.json'))) {
        const record = packageRecord(directory);
        packages.set(record.name, record);
      }
    }
    for (const name of providers) {
      assertIndependent(`@headstart-health/${name}`, packages);
    }
  });

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'])(
    'detects transitive %s edges',
    (kind) => {
      const records = [
        parsePackageRecord({ name: 'provider', dependencies: { helper: '*' } }),
        parsePackageRecord({
          name: 'helper',
          [kind]: { '@headstart-health/intake-sla-engine': '*' },
        }),
      ];
      const packages = new Map(records.map((record) => [record.name, record]));
      expect(() => {
        assertIndependent('provider', packages);
      }).toThrow('depends on the consuming Intake engine');
    }
  );

  it('rejects source imports that bypass package manifests to reach Intake', () => {
    for (const provider of providers) {
      const directory = join(root, 'packages', provider, 'src');
      // Missing providers remain unfinished migration work, not empty placeholder packages.
      if (!existsSync(directory)) continue;
      for (const file of sourceFiles(directory)) {
        const imports = ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles;
        for (const dependency of imports) {
          expect(dependency.fileName, file).not.toContain('intake-sla');
        }
      }
    }
  });
});
