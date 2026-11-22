import { createMiddleware } from 'hono/factory'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { startDayIfNeeded } from '../domain/day/start-day.ts'
import { env } from '../env.ts'

// Paths that never start a day: sign-in itself, health checks, dev helpers, billing callbacks.
const SKIP = /^\/api\/(?:auth|dev|health)(?:\/|$)|^\/api\/billing\/webhook$/

/**
 * Development only: how far the clock is moved for one user, in minutes. E2-P11 uses it to check the
 * rollover without waiting for a night. Outside development the offset is always zero, whatever is set.
 */
const clockOffsets = new Map<string, number>()

export function setDevClockOffset(userId: string, offsetMinutes: number): void {
  if (env.APP_MODE !== 'development') return
  if (offsetMinutes === 0) clockOffsets.delete(userId)
  else clockOffsets.set(userId, offsetMinutes)
}

function nowFor(userId: string): Date {
  const offset = env.APP_MODE === 'development' ? (clockOffsets.get(userId) ?? 0) : 0
  return new Date(Date.now() + offset * 60_000)
}

/** For signed-in API requests: start the day if needed and expose c.var.today. */
export const dayStartMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user
  if (user && !SKIP.test(c.req.path)) {
    const { today } = await withUser(user.id, (tx) => startDayIfNeeded(tx, nowFor(user.id)))
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
