import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['scripts/__tests__/**/*.test.ts', 'skills/**/scripts/**/*.test.ts'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['scripts/*.ts', 'skills/**/scripts/**/*.ts'],
      exclude: ['scripts/__tests__/**', 'skills/**/scripts/**/*.test.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
