// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FocusSession } from '../../src/shared/schemas/focus.ts'
import { FocusTimer } from '../../src/web/features/focus/FocusTimer.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

const SESSION: FocusSession = {
  id: '0b5f0a2e-4c66-4f6e-9e35-5a1c1d1f2a3b',
  taskId: null,
  slot: null,
  plannedMinutes: 25,
  startedAt: '2026-11-22T09:00:00.000Z',
  endedAt: null,
}

beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setUp(onStop: (id: string) => void) {
  // Only the clock and the one interval are fake: React's own scheduling keeps running.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(SESSION.startedAt))
  return render(<FocusTimer session={SESSION} onStop={onStop} />)
}

describe('FocusTimer', () => {
  it('shows the rest of the session and catches up after ten minutes away', () => {
    const { container } = setUp(() => {})
    expect(container.textContent).toContain('25:00')

    // The tab was in the background for ten minutes. One tick fires, and it reads the clock instead
    // of counting the intervals it missed, so the timer jumps to the right minute.
    act(() => {
      vi.setSystemTime(new Date('2026-11-22T09:09:59.000Z'))
      vi.advanceTimersByTime(1000)
    })
    expect(container.textContent).toContain('15:00')
  })

  it('stops the session once when the time is up', () => {
    const onStop = vi.fn()
    const { container } = setUp(onStop)

    act(() => {
      vi.setSystemTime(new Date('2026-11-22T09:24:59.000Z'))
      vi.advanceTimersByTime(1000)
    })

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledWith(SESSION.id)
    expect(container.textContent).toContain('00:00')
    expect(container.textContent).toContain('Time for a break')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('stops when the button is pressed', () => {
    const onStop = vi.fn()
    const { getByRole } = setUp(onStop)

    fireEvent.click(getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalledWith(SESSION.id)
  })
})
