import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/artifact-worker.ts'],
  format: ['cjs'],
  target: 'node22',
  noExternal: ['zod'],
});
