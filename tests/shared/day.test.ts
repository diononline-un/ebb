import { describe, expect, it } from 'vitest'
import { addDays, isBefore, localDate, weekStart } from '../../src/shared/day.ts'

const at = (iso: string) => new Date(iso)

describe('localDate', () => {
  it('starts the day at 04:00 on the spring changeover (Europe/Berlin)', () => {
    // 2026-03-29: 02:00 CET becomes 03:00 CEST.
    expect(localDate(at('2026-03-29T01:59:00Z'), 'Europe/Berlin', 240)).toBe('2026-03-28')
    expect(localDate(at('2026-03-29T02:00:00Z'), 'Europe/Berlin', 240)).toBe('2026-03-29')
  })

  it('starts the day at 04:00 on the autumn changeover (Europe/Berlin)', () => {
    // 2026-10-25: 03:00 CEST becomes 02:00 CET.
    expect(localDate(at('2026-10-25T02:59:00Z'), 'Europe/Berlin', 240)).toBe('2026-10-24')
    expect(localDate(at('2026-10-25T03:00:00Z'), 'Europe/Berlin', 240)).toBe('2026-10-25')
  })

  it('keeps the plain local date when the day starts at midnight', () => {
    expect(localDate(at('2026-03-29T01:59:00Z'), 'Europe/Berlin', 0)).toBe('2026-03-29')
    expect(localDate(at('2026-11-21T23:30:00Z'), 'Europe/Berlin', 0)).toBe('2026-11-22')
    expect(localDate(at('2026-11-21T10:00:00Z'), 'UTC', 0)).toBe('2026-11-21')
  })

  it('handles UTC+14 (Pacific/Kiritimati)', () => {
    // 13:30 UTC is 03:30 next day there, 14:30 UTC is 04:30 next day.
    expect(localDate(at('2026-11-21T13:30:00Z'), 'Pacific/Kiritimati', 240)).toBe('2026-11-21')
    expect(localDate(at('2026-11-21T14:30:00Z'), 'Pacific/Kiritimati', 240)).toBe('2026-11-22')
    expect(localDate(at('2026-11-21T22:30:00Z'), 'Pacific/Kiritimati', 240)).toBe('2026-11-22')
  })

  it('handles UTC-11 (Pacific/Pago_Pago)', () => {
    // 14:00 UTC is 03:00 the same day there, 15:00 UTC is 04:00.
    expect(localDate(at('2026-11-21T14:00:00Z'), 'Pacific/Pago_Pago', 240)).toBe('2026-11-20')
    expect(localDate(at('2026-11-21T15:00:00Z'), 'Pacific/Pago_Pago', 240)).toBe('2026-11-21')
    expect(localDate(at('2026-11-21T10:00:00Z'), 'Pacific/Pago_Pago', 240)).toBe('2026-11-20')
  })

  it('accepts a late day start', () => {
    // 11:59 UTC in Berlin is 12:59, so the day has not started at 13:00; 12:00 UTC is exactly 13:00.
    expect(localDate(at('2026-11-21T11:59:00Z'), 'Europe/Berlin', 780)).toBe('2026-11-20')
    expect(localDate(at('2026-11-21T12:00:00Z'), 'Europe/Berlin', 780)).toBe('2026-11-21')
  })
})

describe('addDays', () => {
  it('crosses months, years and leap days', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-11-21', 7)).toBe('2026-11-28')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-11-21', 0)).toBe('2026-11-21')
  })

  it('does not drift on changeover days', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('rejects malformed dates', () => {
    expect(() => addDays('21.11.2026', 1)).toThrow(RangeError)
    expect(() => addDays('2026-11-21T00:00:00Z', 1)).toThrow(RangeError)
  })
})

describe('weekStart', () => {
  it('starts on Sunday (0)', () => {
    expect(weekStart('2026-01-01', 0)).toBe('2025-12-28')
    expect(weekStart('2025-12-28', 0)).toBe('2025-12-28')
    expect(weekStart('2026-01-04', 0)).toBe('2026-01-04')
    expect(weekStart('2026-11-21', 0)).toBe('2026-11-15')
  })

  it('starts on Monday (1) across the year boundary', () => {
    expect(weekStart('2026-01-01', 1)).toBe('2025-12-29')
    expect(weekStart('2025-12-28', 1)).toBe('2025-12-22')
    expect(weekStart('2025-12-31', 1)).toBe('2025-12-29')
    expect(weekStart('2026-01-05', 1)).toBe('2026-01-05')
  })

  it('rejects a week start outside 0..6', () => {
    expect(() => weekStart('2026-01-01', 7)).toThrow('invalid_week_start')
    expect(() => weekStart('2026-01-01', -1)).toThrow(RangeError)
  })
})

describe('isBefore', () => {
  it('compares calendar days', () => {
    expect(isBefore('2026-01-01', '2026-01-02')).toBe(true)
    expect(isBefore('2025-12-31', '2026-01-01')).toBe(true)
    expect(isBefore('2026-01-02', '2026-01-01')).toBe(false)
    expect(isBefore('2026-01-01', '2026-01-01')).toBe(false)
  })

  it('rejects malformed dates', () => {
    expect(() => isBefore('2026-1-1', '2026-01-02')).toThrow(RangeError)
    expect(() => isBefore('2026-01-01', 'morgen')).toThrow(RangeError)
  })
})
