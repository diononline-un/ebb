import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { localDate, weekStart } from './day.ts'
import type { Notify } from './schemas/settings.ts'

// E9-P2: the reminder rules, pure and without IO (docs/architektur.md, PRD F14). The job reads the
// facts, this module decides what is due. Times like "07:30" are wall-clock: the calendar date from
// localClock(), never the app day from day_start_minute.

export type ReminderKind = 'morning' | 'habit' | 'weeklyReset' | 'errands' | 'timer' | 'trial'

/** One reminder the job may send. `ref` separates repeats of the same kind, `localDate` scopes it. */
export type Due = {
  kind: ReminderKind
  ref: string
  localDate: string
  titleKey: string
  bodyKey: string
  url: string
  vars?: Record<string, string>
}

export type ReminderSettings = {
  timezone: string
  dayStartMinute: number
  morningReminder: string | null
  weeklyResetDow: number
  weeklyResetTime: string
  errandsDow: number | null
  quietStart: string
  quietEnd: string
  notify: Notify
}

export type ReminderHabit = {
  id: string
  name: string
  reminderTime: string
  weekdays: number[] | null
  /** A habit_log row for the app day exists. */
  doneToday: boolean
}

export type ReminderTimer = { id: string; startedAt: Date; plannedMinutes: number }

/** Everything the rules need, loaded by the job in one batched pass per table. */
export type ReminderFacts = {
  /** day_entry.ritual_done_at is set for the app day. */
  ritualDone: boolean
  habits: ReminderHabit[]
  /** weekly_reset.completed_at is set for the week that ends on the weekly reset day. */
  weeklyResetDone: boolean
  errandsOpen: number
  trialEndsAt: Date | null
  timers: ReminderTimer[]
}

export type ReminderInput = { now: Date; settings: ReminderSettings; facts: ReminderFacts }

const MINUTES_PER_HOUR = 60
const HOUR_MS = 60 * 60 * 1000
const DEFAULT_WINDOW_MINUTES = 15
const TRIAL_WINDOW_HOURS = 48
/** Errands and the trial reminder have fixed wall-clock minutes (PRD F14). */
const ERRANDS_MINUTE = 9 * MINUTES_PER_HOUR
const TRIAL_MINUTE = 10 * MINUTES_PER_HOUR

/** The person's wall clock: calendar date, minute of day and weekday (0 = Sunday), in their zone. */
export function localClock(now: Date, timeZone: string): { date: string; minute: number; dow: number } {
  const local = new TZDate(now.getTime(), timeZone)
  return {
    date: format(local, 'yyyy-MM-dd'),
    minute: local.getHours() * MINUTES_PER_HOUR + local.getMinutes(),
    dow: local.getDay(),
  }
}

/** "HH:MM" or "HH:MM:SS" from user_settings/habit as minutes after midnight. */
export function minuteOfDay(time: string): number {
  const [hours = '', minutes = ''] = time.split(':')
  return Number(hours) * MINUTES_PER_HOUR + Number(minutes)
}

/**
 * Quiet hours as the half-open range [quietStart, quietEnd), crossing midnight when start > end.
 * Equal endpoints are no quiet hours at all, so a user can switch them off by setting both equal.
 */
export function inQuietHours(minute: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false
  if (quietStart < quietEnd) return minute >= quietStart && minute < quietEnd
  return minute >= quietStart || minute < quietEnd
}

/**
 * The target minute is reached and at most `windowMinutes` ago. The window catches a missed minute
 * after a restart; an older reminder is dropped instead of sent late (PRD F14).
 */
export function isDue(targetMinute: number, nowMinute: number, windowMinutes = DEFAULT_WINDOW_MINUTES): boolean {
  const behind = nowMinute - targetMinute
  return behind >= 0 && behind <= windowMinutes
}

/** The local calendar date of a timestamp in the person's zone, for the trial reminder's key. */
function dateIn(zone: string, at: Date): string {
  return format(new TZDate(at.getTime(), zone), 'yyyy-MM-dd')
}

/**
 * All reminders due at `now`. The order is the kind order; the job sends them as they come.
 * Quiet hours drop everything except the timer: a session that ends at 23:00 is worth the one push.
 */
export function dueReminders(input: ReminderInput): Due[] {
  const { now, settings, facts } = input
  const clock = localClock(now, settings.timezone)
  const quiet = inQuietHours(clock.minute, minuteOfDay(settings.quietStart), minuteOfDay(settings.quietEnd))
  const notify = settings.notify
  const due: Due[] = []

  if (
    notify.morning &&
    settings.morningReminder !== null &&
    !facts.ritualDone &&
    !quiet &&
    isDue(minuteOfDay(settings.morningReminder), clock.minute)
  ) {
    due.push({
      kind: 'morning',
      ref: '',
      localDate: clock.date,
      titleKey: 'morning.title',
      bodyKey: 'morning.body',
      url: '/ritual',
    })
  }

  if (notify.habits && !quiet) {
    for (const habit of facts.habits) {
      if (habit.doneToday) continue
      if (habit.weekdays !== null && !habit.weekdays.includes(clock.dow)) continue
      if (!isDue(minuteOfDay(habit.reminderTime), clock.minute)) continue
      due.push({
        kind: 'habit',
        ref: habit.id,
        localDate: clock.date,
        titleKey: 'habit.title',
        bodyKey: 'habit.body',
        url: '/habits',
        vars: { name: habit.name },
      })
    }
  }

  // The reset looks at the week that ends on its own day (domain/reset/stats.ts weekOf), keyed by the
  // app day, so the ref carries that week's start: the same week the reset page shows.
  const today = localDate(now, settings.timezone, settings.dayStartMinute)
  const week = weekStart(today, (settings.weeklyResetDow + 1) % 7)
  if (
    notify.weeklyReset &&
    !facts.weeklyResetDone &&
    clock.dow === settings.weeklyResetDow &&
    !quiet &&
    isDue(minuteOfDay(settings.weeklyResetTime), clock.minute)
  ) {
    due.push({
      kind: 'weeklyReset',
      ref: week,
      localDate: clock.date,
      titleKey: 'weeklyReset.title',
      bodyKey: 'weeklyReset.body',
      url: '/reset',
    })
  }

  if (
    notify.errands &&
    settings.errandsDow !== null &&
    clock.dow === settings.errandsDow &&
    facts.errandsOpen > 0 &&
    !quiet &&
    isDue(ERRANDS_MINUTE, clock.minute)
  ) {
    due.push({
      kind: 'errands',
      ref: '',
      localDate: clock.date,
      titleKey: 'errands.title',
      bodyKey: 'errands.body',
      url: '/errands',
    })
  }

  if (notify.trial && facts.trialEndsAt !== null && !quiet && isDue(TRIAL_MINUTE, clock.minute)) {
    const left = facts.trialEndsAt.getTime() - now.getTime()
    if (left > 0 && left <= TRIAL_WINDOW_HOURS * HOUR_MS) {
      // Both parts of the key are the end date: whichever day the 10:00 window hits first, the
      // second one finds the row from the first and stays quiet.
      const endDate = dateIn(settings.timezone, facts.trialEndsAt)
      due.push({
        kind: 'trial',
        ref: endDate,
        localDate: endDate,
        titleKey: 'trial.title',
        bodyKey: 'trial.body',
        url: '/settings/billing',
      })
    }
  }

  // The timer is the one reminder quiet hours do not hold back, and it needs no clock window: a
  // finished session counts no matter how long ago it ended.
  if (notify.timer) {
    for (const timer of facts.timers) {
      if (timer.startedAt.getTime() + timer.plannedMinutes * 60 * 1000 > now.getTime()) continue
      due.push({
        kind: 'timer',
        ref: timer.id,
        localDate: clock.date,
        titleKey: 'timer.title',
        bodyKey: 'timer.body',
        url: '/today',
      })
    }
  }

  return due
}
