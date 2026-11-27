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

export const entitlementMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || EXEMPT.some((pattern) => pattern.test(c.req.path))) return next()

  const access = await withUser(userOf(c).id, (tx) => loadAccess(tx, new Date()))
  if (!access.access) return c.json({ code: 'subscription_required', reason: access.reason }, 402)
  return next()
})
