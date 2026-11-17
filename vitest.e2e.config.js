import { defineConfig } from 'vitest/config';

/**
 * Configuration for suites that talk to the real database configured in
 * `.env` (no test schema push, no environment overrides).
 *
 *   npm run test:payments:e2e
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.e2e.test.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
