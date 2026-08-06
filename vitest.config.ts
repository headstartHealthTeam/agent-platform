import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['scripts/validate-skills.ts'],
      exclude: ['scripts/__tests__/**'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
