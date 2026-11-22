/** Milliseconds left in a session, counted from the start the server sent; never below zero. */
export function remainingMs(session: { startedAt: string; plannedMinutes: number }, now: number): number {
  const endsAt = Date.parse(session.startedAt) + session.plannedMinutes * 60_000
  return Math.max(0, endsAt - now)
}

/** MM:SS, and H:MM:SS from one hour on, so the clock keeps the same width while it runs. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  const seconds = total % 60
  const minutes = Math.floor(total / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}
