import { randomInt } from 'node:crypto'
import { test as base, expect } from '@playwright/test'

/**
 * A dedicated rate-limit bucket per test. Better Auth buckets by client IP, and the dev server runs
 * without a proxy that would supply one, so every test would otherwise share the same bucket and two
 * runs inside a minute would trip the sign-in limit. A random address from 10.0.0.0/8 separates them;
 * the Vite proxy passes the header through unchanged, like Caddy does in production.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'x-forwarded-for': `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(0, 256)}` })
  },
})

export { expect }
