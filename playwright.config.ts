import { defineConfig, devices } from '@playwright/test'

// End-to-end runs against the dev server on 2042 — the origin passkeys are registered for.
// Start it first: docker compose up -d postgres && npm run db:migrate && npm run dev
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:2042',
  },
})
