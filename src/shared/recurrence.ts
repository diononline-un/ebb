import { addDays, isBefore, weekStart } from './day.ts'

/** A recurrence rule as it sits in `recurrence.rule` (jsonb), see docs/architektur.md. */
export type RecurrenceRule =
  | { freq: 'daily' }
  | { freq: 'weekdays' }
  | { freq: 'weekly'; weekdays: number[] }
  | { freq: 'every_n_days'; interval: number }
  | { freq: 'monthly'; monthDay: number }

/** Monday to Friday, 0 = Sunday as in day.ts and user_settings.weekly_reset_dow. */
const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5]

/** A week start on `dow` equals the day itself only when the day is that weekday, so the weekday
 *  numbering stays in day.ts and no Date object enters the calendar arithmetic. */
function isOneOfWeekdays(date: string, weekdays: number[]): boolean {
  return weekdays.some((dow) => weekStart(date, dow) === date)
}

/** The month is the first seven characters of a day, so the next day tells whether this one was the last. */
function isLastDayOfMonth(date: string): boolean {
  return addDays(date, 1).slice(0, 7) !== date.slice(0, 7)
}

/** Whether the rule is due on this calendar day, including startsOn and never before it. */
export function occursOn(rule: RecurrenceRule, startsOn: string, date: string): boolean {
  // isBefore validates both days as YYYY-MM-DD, so the cases below may slice them.
  if (isBefore(date, startsOn)) return false

  switch (rule.freq) {
    case 'daily':
      return true
    case 'weekdays':
      return isOneOfWeekdays(date, MONDAY_TO_FRIDAY)
    case 'weekly':
      return isOneOfWeekdays(date, rule.weekdays)
    case 'every_n_days': {
      const { interval } = rule
      if (!Number.isInteger(interval) || interval < 1) throw new RangeError(`invalid_interval: ${interval}`)
      // Stepping in whole intervals counts from startsOn as specified and stays linear in the number
      // of occurrences, not in the number of days.
      let day = startsOn
      while (isBefore(day, date)) day = addDays(day, interval)
      return day === date
    }
    case 'monthly': {
      const dayOfMonth = Number(date.slice(8, 10))
      if (dayOfMonth === rule.monthDay) return true
      // A configured day past the end of the month falls on that month's last day (31st in April → 30th).
      return isLastDayOfMonth(date) && rule.monthDay > dayOfMonth
    }
  }
}

/** The first due calendar day strictly after `after`. */
export function nextOccurrence(rule: RecurrenceRule, startsOn: string, after: string): string {
  let day = isBefore(after, startsOn) ? startsOn : addDays(after, 1)
  // 400 days are a year plus a leap day; a rule that does not fire within that never fires (monthly with
  // monthDay 0 is the real case), so it is an error rather than an endless search.
  for (let i = 0; i < 400; i += 1) {
    if (occursOn(rule, startsOn, day)) return day
    day = addDays(day, 1)
  }
  throw new RangeError(`no_occurrence: ${rule.freq} within 400 days of ${after}`)
}
