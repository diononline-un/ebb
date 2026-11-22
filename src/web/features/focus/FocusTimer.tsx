import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FocusSession } from '../../../shared/schemas/focus.ts'
import { Button } from '../../ui/Button.tsx'
import { useCurrentFocus, useStopFocus } from './api.ts'
import { formatClock, remainingMs } from './remaining.ts'

export type FocusTimerProps = {
  session: FocusSession
  /** Ends the session: the Stop button, and a session that ran out while nobody was looking. */
  onStop: (id: string) => void
  /** Once, when the time runs out on screen; the quiet line then stays until the timer is closed. */
  onRanOut: (id: string) => void
}

/**
 * The rest of the running session. It counts from startedAt on every tick instead of counting
 * intervals, so a background tab comes back with the right time (DESIGN §11: no ring, no sound).
 * Mount one per session (key it by id): what it has watched belongs to that session.
 */
export function FocusTimer({ session, onStop, onRanOut }: FocusTimerProps) {
  const { t } = useTranslation('focus')
  const [now, setNow] = useState(() => Date.now())
  const remaining = remainingMs(session, now)
  // A session that ran out while the page was closed just ends; a late "break" notice would be noise.
  const watched = useRef(remaining > 0)
  const ended = useRef(false)

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    if (remaining > 0 || ended.current) return
    ended.current = true
    if (!watched.current) {
      onStop(session.id)
      return
    }
    onRanOut(session.id)
    // Push comes with E9; while the page is open, the browser's own notice is enough.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(t('timer.finished'))
    }
  }, [remaining, session.id, onStop, onRanOut, t])

  if (!watched.current) return null
  const ranOut = remaining === 0

  return (
    <section className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        {ranOut ? <p className="text-small text-ink-2">{t('timer.finished')}</p> : null}
        <p className="text-title font-mono tabular-nums">{formatClock(remaining)}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => onStop(session.id)}>
        {ranOut ? t('timer.close') : t('timer.stop')}
      </Button>
    </section>
  )
}

/**
 * The running session wherever the day is shown (Today, low mode). One that ran out on screen stays
 * until it is closed: the server has no open session any more, so the quiet line lives here.
 */
export function CurrentFocusTimer() {
  const current = useCurrentFocus()
  const stop = useStopFocus()
  const [ranOut, setRanOut] = useState<FocusSession | null>(null)
  const session = current.data ?? ranOut
  if (!session) return null

  return (
    <FocusTimer
      key={session.id}
      session={session}
      onStop={(id) => {
        setRanOut(null)
        stop.mutate(id)
      }}
      onRanOut={(id) => {
        setRanOut(session)
        stop.mutate(id)
      }}
    />
  )
}
