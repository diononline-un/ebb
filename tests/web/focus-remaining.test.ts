import { describe, expect, it } from 'vitest'
import { formatClock, remainingMs } from '../../src/web/features/focus/remaining.ts'

const START = '2026-11-22T09:00:00.000Z'
const MINUTE = 60_000

describe('remainingMs', () => {
  it('starts with the whole session', () => {
    expect(remainingMs({ startedAt: START, plannedMinutes: 25 }, Date.parse(START))).toBe(25 * MINUTE)
  })

  it('drops the time already spent', () => {
    expect(remainingMs({ startedAt: START, plannedMinutes: 25 }, Date.parse(START) + 10 * MINUTE)).toBe(15 * MINUTE)
  })

  it('never goes below zero', () => {
    expect(remainingMs({ startedAt: START, plannedMinutes: 10 }, Date.parse(START) + 120 * MINUTE)).toBe(0)
  })
})

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [59_000, '00:59'],
    [25 * MINUTE, '25:00'],
    [90 * MINUTE, '1:30:00'],
  ])('formats %i ms as %s', (ms, clock) => {
    expect(formatClock(ms)).toBe(clock)
  })
})
