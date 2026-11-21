import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // All files share one test database and truncate it; running them in parallel would race.
    fileParallelism: false,
    // Never default to the development database: resetDb() and test-setup refuse non-test names anyway.
    env: { EBB_DB_NAME: process.env['EBB_DB_NAME'] ?? 'ebb_test' },
  },
})
