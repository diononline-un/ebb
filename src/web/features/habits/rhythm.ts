/** Weekday names come from the locale instead of a key table; 0 = Sunday, like weekStart(). */
export function shortDay(day: number, locale: string): string {
  // 2026-11-15 is a Sunday, so adding the day index lands on that weekday.
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 10, 15 + day)),
  )
}
