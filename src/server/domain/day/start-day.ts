import { localDate } from '../../../shared/day.ts'
import type { Tx } from '../../db.ts'
import { generateInstances } from '../recurrences/recurrences.ts'

export type DayStart = {
  /** The user's calendar day, 'YYYY-MM-DD' (day starts at day_start_minute, default 04:00). */
  today: string
  /** Tasks moved by this call, or null when the day had already started. */
  rolledCount: number | null
}

export type DayStartDetails = DayStart & {
  /** The settings the day was computed from: middleware/day-start.ts caches them with the day. */
  timeZone: string
  dayStartMinute: number
}

/**
 * Starts the user's day exactly once and rolls unfinished work into today's inbox.
 * Runs inside withUser on the first request of a day (middleware/day-start.ts); no cron (A3).
 */
export async function startDayIfNeeded(tx: Tx, now: Date): Promise<DayStart> {
  const { today, rolledCount } = await startDayIfNeededWithSettings(tx, now)
  return { today, rolledCount }
}

/**
 * The day start plus the settings it read anyway, so the middleware can reuse them without a second
 * query (E9-P6). Same work as startDayIfNeeded, only a wider answer.
 */
export async function startDayIfNeededWithSettings(tx: Tx, now: Date): Promise<DayStartDetails> {
  const [settings] = await tx<{ timezone: string; dayStartMinute: number }[]>`
    select timezone, day_start_minute from user_settings where user_id = app.uid()`
  if (!settings) throw new Error('missing user_settings row')
  const { timezone: timeZone, dayStartMinute } = settings
  const today = localDate(now, timeZone, dayStartMinute)

  // Claim the day. Parallel requests wait on the row lock and re-check the condition after the
  // first commit, so exactly one of them gets a row back and does the rollover.
  const claimed = await tx`
    update user_settings set last_day_started = ${today}
    where user_id = app.uid() and (last_day_started is null or last_day_started < ${today})
    returning 1`
  if (claimed.length === 0) return { today, rolledCount: null, timeZone, dayStartMinute }

  // The rollover rule lives here and nowhere else (docs/specs/E02-kern.md): started or open work
  // from past days comes back to today's inbox, re-triaged from scratch; the deadline stays.
  // Waiting, done, skipped and undated tasks (errands) never roll.
  const rolled = await tx`
    update task
       set do_date = ${today}, slot = 'inbox', must = false, anchor = false, push_count = push_count + 1
     where assignee_id = app.uid() and status in ('todo', 'doing') and do_date < ${today}
     returning id`

  // Recurring work for today comes after the rollover, so its instances are not rolled again.
  await generateInstances(tx, today)

  await tx`
    insert into day_entry (date, rolled_count) values (${today}, ${rolled.length})
    on conflict (user_id, date) do update set rolled_count = day_entry.rolled_count + excluded.rolled_count`

  return { today, rolledCount: rolled.length, timeZone, dayStartMinute }
}
