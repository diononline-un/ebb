import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FocusSession } from '../../../shared/schemas/focus.ts'
import { Button } from '../../ui/Button.tsx'
import { formatClock, remainingMs } from './remaining.ts'

export type FocusTimerProps = {
  session: FocusSession
  /** Ends the session: once when the time is up, and whatever the Stop button answers. */
  onStop: (id: string) => void
}

/**
 * The rest of the running session. It counts from startedAt on every tick instead of counting
 * intervals, so a background tab comes back with the right time (DESIGN §11: no ring, no sound).
 */
export function FocusTimer({ session, onStop }: FocusTimerProps) {
  const { t } = useTranslation('focus')
  const [now, setNow] = useState(() => Date.now())
  const stopped = useRef<string | null>(null)
  const remaining = remainingMs(session, now)

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    if (remaining > 0 || stopped.current === session.id) return
    stopped.current = session.id
    onStop(session.id)
    // Push comes with E9; while the page is open, the browser's own notice is enough.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(t('timer.finished'))
    }
  }, [remaining, session.id, onStop, t])

  return (
    <section className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        {remaining === 0 ? <p className="text-small text-ink-2">{t('timer.finished')}</p> : null}
        <p className="text-title font-mono tabular-nums">{formatClock(remaining)}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => onStop(session.id)}>
        {t('timer.stop')}
      </Button>
    </section>
  )
}
