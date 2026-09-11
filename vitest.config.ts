import { defineConfig } from 'vitest/config';

export const testTimeoutForPlatform = (platform: NodeJS.Platform): number =>
  platform === 'win32' ? 120_000 : 15_000;

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['scripts/__tests__/**/*.test.ts', 'skills/**/scripts/**/*.test.ts'],
    // Windows runners have materially slower process, Git, and filesystem startup. Individual
    // integration tests still declare their own bounded timeout; this prevents unit defaults from
    // turning completed synchronous work into a false failure on the slowest supported host.
    testTimeout: testTimeoutForPlatform(process.platform),
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
