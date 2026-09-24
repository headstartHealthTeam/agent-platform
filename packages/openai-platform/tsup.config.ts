import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/operator-module.ts'],
    format: ['cjs'],
    target: 'node22',
    platform: 'node',
    // The backend must not resolve SDK or workspace dependencies from its own dependency tree.
    noExternal: [/.*/],
    splitting: false,
    sourcemap: false,
    metafile: true,
    outDir: 'dist/operator',
    clean: true,
  },
  {
    entry: { entry: 'src/executor-entry.ts', control: 'src/executor-control.ts' },
    format: ['cjs'],
    target: 'node22',
    platform: 'node',
    noExternal: [/.*/],
    splitting: false,
    sourcemap: false,
    outDir: 'dist/executor',
    clean: true,
  },
]);
