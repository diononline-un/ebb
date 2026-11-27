import { createMiddleware } from 'hono/factory'
import { localDate } from '../../shared/day.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { startDayIfNeededWithSettings } from '../domain/day/start-day.ts'
import { env } from '../env.ts'

// Paths that never start a day: sign-in itself, health checks, dev helpers, billing callbacks.
const SKIP = /^\/api\/(?:auth|dev|health)(?:\/|$)|^\/api\/billing\/webhook$/

/** How long a started day is reused before the settings are read again. */
const DAY_START_MS = 60_000

type DayStartCache = { today: string; timeZone: string; dayStartMinute: number; until: number }

/**
 * Where each person's day started, so the first request of a day pays for the settings read and the
 * next ones do not (E9-P6: every request cost ~16 ms of CPU, spread over several transactions).
 *
 * shortcut: one process only; with more than one instance this has to move to a shared store. P-1
 * allows no Redis, so the process keeps it (docs/betrieb.md, "Lasttest").
 */
const dayStarts = new Map<string, DayStartCache>()

/** Drops the cached day of one person; the next request reads the settings and starts again. */
export function forgetDay(userId: string): void {
  dayStarts.delete(userId)
}

/**
 * Development only: how far the clock is moved for one user, in minutes. E2-P11 uses it to check the
 * rollover without waiting for a night. Outside development the offset is always zero, whatever is set.
 */
const clockOffsets = new Map<string, number>()

export function setDevClockOffset(userId: string, offsetMinutes: number): void {
  if (env.APP_MODE !== 'development') return
  if (offsetMinutes === 0) clockOffsets.delete(userId)
  else clockOffsets.set(userId, offsetMinutes)
  // The cached day belongs to the old clock position.
  forgetDay(userId)
}

function nowFor(userId: string): Date {
  const offset = env.APP_MODE === 'development' ? (clockOffsets.get(userId) ?? 0) : 0
  return new Date(Date.now() + offset * 60_000)
}

/** For signed-in API requests: start the day if needed and expose c.var.today. */
export const dayStartMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user
  if (user && !SKIP.test(c.req.path)) {
    const cached = dayStarts.get(user.id)
    // The window alone is not enough: the dev clock or a jump at midnight must not keep the old
    // day. localDate() is pure wall-clock arithmetic, so this check costs no query.
    const hit =
      cached !== undefined &&
      Date.now() < cached.until &&
      localDate(nowFor(user.id), cached.timeZone, cached.dayStartMinute) === cached.today

    if (hit) {
      c.set('today', cached.today)
    } else {
      const { today, timeZone, dayStartMinute } = await withUser(user.id, (tx) =>
        startDayIfNeededWithSettings(tx, nowFor(user.id)),
      )
      c.set('today', today)
      dayStarts.set(user.id, { today, timeZone, dayStartMinute, until: Date.now() + DAY_START_MS })
    }
  }
  await next()
})

/** Today's date for the signed-in user, in a handler behind requireUser. */
export function todayOf(c: AppContext): string {
  const today = c.var.today
  if (!today) throw new Error('todayOf() used on a route the day-start middleware skips')
  return today
}
