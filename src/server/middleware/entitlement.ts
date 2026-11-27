import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { loadAccess } from '../domain/users/access.ts'
import { userOf } from './session.ts'

/**
 * Without access a person may read, export, delete the account and finish a subscription — everything
 * that writes data answers 402 subscription_required (E8-P4, docs/architektur.md).
 */
const EXEMPT = [
  /^\/api\/auth\//,
  /^\/api\/billing\//,
  // The customer portal is where an expired subscription gets a new card; blocking it would lock
  // the door to the one way back in.
  /^\/api\/billing-config\/portal$/,
  /^\/api\/export\b/,
  // Settings carry language, time zone and the reminder hours; without them nobody could even
  // switch the interface to a language they read.
  /^\/api\/settings\b/,
  /^\/api\/account\b/,
  // Product events measure what a read-only account still does; blocking them would cut the launch
  // metrics exactly where they matter (Trial → Abo, D7 retention after the trial).
  /^\/api\/events\b/,
]

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** How long a yes is reused, and how many people fit into the cache. */
const ACCESS_MS = 30_000
const ACCESS_LIMIT = 10_000

/**
 * Positive answers, userId → end of the window. A no is never stored: after paying, the next write
 * has to go through at once. An expired trial writes at most ACCESS_MS longer, which is cheaper
 * than a settings read on every write (E9-P6).
 *
 * shortcut: one process only, like the day start cache (middleware/day-start.ts); give it a shared
 * store once the app runs as more than one instance.
 */
const positiveAccess = new Map<string, number>()

/**
 * The clock behind the window. Injectable so a test can let the 30 s run out without sleeping
 * (tests/middleware-cache.test.ts).
 */
let clock: () => number = Date.now

export function setAccessClock(next: () => number): void {
  clock = next
}

/** Drops the cached yes of one person. Nothing in the app calls this: the window is meant to pass. */
export function forgetAccess(userId: string): void {
  positiveAccess.delete(userId)
}

function rememberAccess(userId: string): void {
  // Re-inserting keeps the map in the order of the windows: the first key is the oldest answer.
  positiveAccess.delete(userId)
  while (positiveAccess.size >= ACCESS_LIMIT) {
    const oldest = positiveAccess.keys().next()
    if (oldest.done) break
    positiveAccess.delete(oldest.value)
  }
  positiveAccess.set(userId, clock() + ACCESS_MS)
}

export const entitlementMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || EXEMPT.some((pattern) => pattern.test(c.req.path))) return next()

  const userId = userOf(c).id
  const until = positiveAccess.get(userId)
  if (until !== undefined && clock() < until) return next()

  const access = await withUser(userId, (tx) => loadAccess(tx, new Date()))
  if (!access.access) return c.json({ code: 'subscription_required', reason: access.reason }, 402)
  rememberAccess(userId)
  return next()
})
