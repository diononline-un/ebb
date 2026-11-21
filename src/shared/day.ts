import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

/**
 * The user's calendar day as YYYY-MM-DD. Before dayStartMinute the previous day still counts
 * (docs/architektur.md, "Tagesbeginn"): with the default 04:00, 03:59 belongs to yesterday.
 *
 * The comparison is wall-clock on purpose. Shifting by elapsed minutes would answer "2026-03-28"
 * for 04:00 on the spring changeover day, because four real hours before 04:00 CEST is still the
 * 28th; the user's clock says 04:00, so it is today.
 */
export function localDate(now: Date, timeZone: string, dayStartMinute: number): string {
  const local = new TZDate(now.getTime(), timeZone)
  const minutesOfDay = local.getHours() * 60 + local.getMinutes()
  const date = format(local, 'yyyy-MM-dd')
  return minutesOfDay < dayStartMinute ? addDays(date, -1) : date
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

type DateParts = { year: number; month: number; day: number }

function parts(date: string): DateParts {
  const match = ISO_DATE.exec(date)
  if (!match?.[1] || !match[2] || !match[3]) throw new RangeError(`invalid_date: ${date}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/** Calendar arithmetic runs on a UTC midnight. Parsing a local day with new Date('YYYY-MM-DD') would
 *  read it as UTC and could land on the wrong day, which is the trap this avoids. */
function asUtc(date: string): Date {
  const { year, month, day } = parts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIso(utc: Date): string {
  const year = utc.getUTCFullYear()
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utc.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: string, n: number): string {
  const utc = asUtc(date)
  utc.setUTCDate(utc.getUTCDate() + n)
  return toIso(utc)
}

/** 0 = Sunday … 6 = Saturday, same numbering as user_settings.weekly_reset_dow. */
function dayOfWeek(date: string): number {
  return asUtc(date).getUTCDay()
}

/** First day of the week that contains `date`, for a week starting on weekStartDow (0 = Sunday). */
export function weekStart(date: string, weekStartDow: number): string {
  if (!Number.isInteger(weekStartDow) || weekStartDow < 0 || weekStartDow > 6) {
    throw new RangeError(`invalid_week_start: ${weekStartDow}`)
  }
  const back = (dayOfWeek(date) - weekStartDow + 7) % 7
  return addDays(date, -back)
}

export function isBefore(a: string, b: string): boolean {
  // Padded ISO days order lexicographically, so no Date is involved and no timezone can interfere.
  parts(a)
  parts(b)
  return a < b
}
