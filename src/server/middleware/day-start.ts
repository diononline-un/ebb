import { createMiddleware } from 'hono/factory'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { startDayIfNeeded } from '../domain/day/start-day.ts'

// Paths that never start a day: sign-in itself, health checks, dev helpers, billing callbacks.
const SKIP = /^\/api\/(?:auth|dev|health)(?:\/|$)|^\/api\/billing\/webhook$/

/** For signed-in API requests: start the day if needed and expose c.var.today. */
export const dayStartMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user
  if (user && !SKIP.test(c.req.path)) {
    const { today } = await withUser(user.id, (tx) => startDayIfNeeded(tx, new Date()))
    c.set('today', today)
  }
  await next()
})

/** Today's date for the signed-in user, in a handler behind requireUser. */
export function todayOf(c: AppContext): string {
  const today = c.var.today
  if (!today) throw new Error('todayOf() used on a route the day-start middleware skips')
  return today
}
