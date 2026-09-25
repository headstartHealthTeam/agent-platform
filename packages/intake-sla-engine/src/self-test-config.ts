import { defineConfig } from 'vitest/config';

/** The installed runtime executes the same canonical suite, emitted without source aliases. */
export default defineConfig({
  resolve: { conditions: ['node', 'import', 'default'] },
  ssr: {
    resolve: {
      conditions: ['node', 'import', 'default'],
      externalConditions: ['node', 'import', 'default'],
    },
  },
  test: { environment: 'node', include: ['dist/self-tests/**/*.test.js'], cache: false },
});
