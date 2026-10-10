import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/global-setup.js',
    setupFiles: ['./tests/setup-env.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
