// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FocusSession } from '../../src/shared/schemas/focus.ts'
import { CurrentFocusTimer, FocusTimer } from '../../src/web/features/focus/FocusTimer.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

// The container reads the server's running session; here the test decides what the server says.
const server = vi.hoisted(() => ({ current: null as FocusSession | null, stop: vi.fn() }))

vi.mock('../../src/web/features/focus/api.ts', () => ({
  useCurrentFocus: () => ({ data: server.current }),
  useStopFocus: () => ({ mutate: server.stop }),
}))

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
  server.current = null
  server.stop.mockReset()
})

function fakeClock(at: string) {
  // Only the clock and the one interval are fake: React's own scheduling keeps running.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(at))
}

function setUp(onStop: (id: string) => void = () => {}, onRanOut: (id: string) => void = () => {}) {
  fakeClock(SESSION.startedAt)
  return render(<FocusTimer session={SESSION} onStop={onStop} onRanOut={onRanOut} />)
}

function runOut() {
  act(() => {
    vi.setSystemTime(new Date('2026-11-22T09:24:59.000Z'))
    vi.advanceTimersByTime(1000)
  })
}

describe('FocusTimer', () => {
  it('shows the rest of the session and catches up after ten minutes away', () => {
    const { container } = setUp()
    expect(container.textContent).toContain('25:00')

    // The tab was in the background for ten minutes. One tick fires, and it reads the clock instead
    // of counting the intervals it missed, so the timer jumps to the right minute.
    act(() => {
      vi.setSystemTime(new Date('2026-11-22T09:09:59.000Z'))
      vi.advanceTimersByTime(1000)
    })
    expect(container.textContent).toContain('15:00')
  })

  it('ends the session once when the time runs out on screen', () => {
    const onStop = vi.fn()
    const onRanOut = vi.fn()
    const { container, getByRole } = setUp(onStop, onRanOut)

    runOut()

    expect(onRanOut).toHaveBeenCalledTimes(1)
    expect(onRanOut).toHaveBeenCalledWith(SESSION.id)
    expect(onStop).not.toHaveBeenCalled()
    expect(container.textContent).toContain('00:00')
    expect(container.textContent).toContain('Time for a break')
    expect(getByRole('button', { name: 'Close' })).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onRanOut).toHaveBeenCalledTimes(1)
  })

  it('quietly ends a session that ran out while the page was closed', () => {
    const onStop = vi.fn()
    const onRanOut = vi.fn()
    fakeClock('2026-11-22T13:00:00.000Z')
    const { container } = render(<FocusTimer session={SESSION} onStop={onStop} onRanOut={onRanOut} />)

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onRanOut).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })

  it('stops when the button is pressed', () => {
    const onStop = vi.fn()
    const { getByRole } = setUp(onStop)

    fireEvent.click(getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalledWith(SESSION.id)
  })
})

describe('CurrentFocusTimer', () => {
  it('keeps the quiet line after the server has closed the session, until it is closed', () => {
    server.current = SESSION
    fakeClock(SESSION.startedAt)
    const { container, getByRole, rerender } = render(<CurrentFocusTimer />)

    runOut()
    expect(server.stop).toHaveBeenCalledTimes(1)
    expect(server.stop).toHaveBeenCalledWith(SESSION.id)

    // The refetch after the stop finds no running session any more.
    server.current = null
    rerender(<CurrentFocusTimer />)
    expect(container.textContent).toContain('Time for a break')

    fireEvent.click(getByRole('button', { name: 'Close' }))
    expect(container.textContent).toBe('')
  })
})
