import { defineConfig } from 'vitest/config';

import { UNIT_TEST_TIMEOUT } from './scripts/test-timeouts.js';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['scripts/__tests__/**/*.test.ts', 'skills/**/scripts/**/*.test.ts'],
    testTimeout: UNIT_TEST_TIMEOUT,
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
