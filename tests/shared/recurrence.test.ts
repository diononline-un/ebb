import { describe, expect, it } from 'vitest'
import { nextOccurrence, occursOn } from '../../src/shared/recurrence.ts'
import type { RecurrenceRule } from '../../src/shared/recurrence.ts'

const daily: RecurrenceRule = { freq: 'daily' }
const weekdays: RecurrenceRule = { freq: 'weekdays' }
const mondayWednesdayFriday: RecurrenceRule = { freq: 'weekly', weekdays: [1, 3, 5] }
const everyThreeDays: RecurrenceRule = { freq: 'every_n_days', interval: 3 }
const monthly31: RecurrenceRule = { freq: 'monthly', monthDay: 31 }
const monthly29: RecurrenceRule = { freq: 'monthly', monthDay: 29 }

describe('occursOn daily', () => {
  it('ist ab startsOn jeden Kalendertag fällig', () => {
    expect(occursOn(daily, '2026-05-06', '2026-05-06')).toBe(true)
    expect(occursOn(daily, '2026-05-06', '2026-05-07')).toBe(true)
    expect(occursOn(daily, '2026-05-06', '2026-06-06')).toBe(true)
    expect(occursOn(daily, '2026-05-06', '2027-05-06')).toBe(true)
  })

  it('ist vor startsOn nicht fällig', () => {
    expect(occursOn(daily, '2026-05-06', '2026-05-05')).toBe(false)
    expect(occursOn(daily, '2026-05-06', '2025-12-31')).toBe(false)
  })
})

describe('occursOn weekdays', () => {
  it('ist Montag bis Freitag fällig und am Wochenende nicht', () => {
    const table = [
      ['2026-03-23', true], // Monday
      ['2026-03-24', true], // Tuesday
      ['2026-03-25', true], // Wednesday
      ['2026-03-26', true], // Thursday
      ['2026-03-27', true], // Friday
      ['2026-03-28', false], // Saturday
      ['2026-03-29', false], // Sunday
    ] as const
    for (const [date, expected] of table) expect(occursOn(weekdays, '2026-03-01', date)).toBe(expected)
  })

  it('ist vor startsOn auch an Werktagen nicht fällig', () => {
    expect(occursOn(weekdays, '2026-03-25', '2026-03-24')).toBe(false)
    expect(occursOn(weekdays, '2026-03-25', '2026-03-25')).toBe(true)
  })
})

describe('occursOn weekly', () => {
  it('ist nur an den gewählten Wochentagen fällig', () => {
    const table = [
      ['2026-05-04', true], // Monday
      ['2026-05-05', false], // Tuesday
      ['2026-05-06', true], // Wednesday
      ['2026-05-07', false], // Thursday
      ['2026-05-08', true], // Friday
      ['2026-05-09', false], // Saturday
      ['2026-05-10', false], // Sunday
      ['2026-05-11', true], // Monday
      ['2026-05-13', true], // Wednesday
    ] as const
    for (const [date, expected] of table) expect(occursOn(mondayWednesdayFriday, '2026-05-01', date)).toBe(expected)
  })

  it('ist vor startsOn nicht fällig', () => {
    expect(occursOn(mondayWednesdayFriday, '2026-05-06', '2026-05-04')).toBe(false)
  })
})

describe('occursOn every_n_days', () => {
  it('ist ab startsOn alle drei Tage fällig', () => {
    const table = [
      ['2026-01-29', false],
      ['2026-01-30', true], // startsOn
      ['2026-01-31', false],
      ['2026-02-01', false],
      ['2026-02-02', true], // month change
      ['2026-02-03', false],
      ['2026-02-04', false],
      ['2026-02-05', true],
    ] as const
    for (const [date, expected] of table) expect(occursOn(everyThreeDays, '2026-01-30', date)).toBe(expected)
  })

  it('zählt ab startsOn und nicht ab Monatsanfang', () => {
    expect(occursOn(everyThreeDays, '2026-01-30', '2026-02-02')).toBe(true)
    expect(occursOn(everyThreeDays, '2026-01-31', '2026-02-02')).toBe(false)
  })

  it('springt mit Intervall 1 auf jeden Tag', () => {
    expect(occursOn({ freq: 'every_n_days', interval: 1 }, '2026-01-30', '2026-02-02')).toBe(true)
  })
})

describe('occursOn monthly', () => {
  it('31. fällt in kurzen Monaten auf den letzten Tag', () => {
    const table = [
      ['2026-01-30', false],
      ['2026-01-31', true], // January
      ['2026-02-27', false],
      ['2026-02-28', true], // February 2026 ends on the 28th
      ['2026-03-30', false],
      ['2026-03-31', true], // March
      ['2026-04-29', false],
      ['2026-04-30', true], // April
      ['2026-05-31', true], // May
    ] as const
    for (const [date, expected] of table) expect(occursOn(monthly31, '2026-01-01', date)).toBe(expected)
  })

  it('29. ist im Schaltjahr am 29.02. fällig', () => {
    expect(occursOn(monthly29, '2026-01-01', '2028-02-29')).toBe(true)
    expect(occursOn(monthly29, '2026-01-01', '2028-02-28')).toBe(false)
    expect(occursOn(monthly29, '2026-01-01', '2027-02-28')).toBe(true) // no leap year: last day
  })

  it('31. fällt im Schaltjahr auf den 29.02.', () => {
    expect(occursOn(monthly31, '2026-01-01', '2028-02-29')).toBe(true)
    expect(occursOn(monthly31, '2026-01-01', '2028-02-28')).toBe(false)
  })

  it('ist vor startsOn nicht fällig', () => {
    expect(occursOn(monthly31, '2026-02-01', '2026-01-31')).toBe(false)
  })

  it('ist für den unmöglichen Tag 0 nie fällig', () => {
    const impossible: RecurrenceRule = { freq: 'monthly', monthDay: 0 }
    expect(occursOn(impossible, '2026-01-01', '2026-01-31')).toBe(false)
    expect(occursOn(impossible, '2026-01-01', '2026-02-28')).toBe(false)
  })
})

describe('nextOccurrence', () => {
  it('daily: ist der Stichtag selbst fällig, kommt der nächste Tag', () => {
    expect(nextOccurrence(daily, '2026-01-01', '2026-05-06')).toBe('2026-05-07')
    expect(nextOccurrence(daily, '2026-05-06', '2026-05-06')).toBe('2026-05-07')
  })

  it('daily: vor startsOn ist der erste Fälligkeitstag startsOn', () => {
    expect(nextOccurrence(daily, '2026-05-06', '2026-01-01')).toBe('2026-05-06')
    expect(nextOccurrence(daily, '2026-05-06', '2026-05-05')).toBe('2026-05-06')
  })

  it('weekdays: springt vom Freitag auf den Montag', () => {
    expect(nextOccurrence(weekdays, '2026-01-01', '2026-05-08')).toBe('2026-05-11') // Friday → Monday
    expect(nextOccurrence(weekdays, '2026-01-01', '2026-05-10')).toBe('2026-05-11') // Sunday → Monday
    expect(nextOccurrence(weekdays, '2026-01-01', '2026-05-11')).toBe('2026-05-12') // due itself → next day
  })

  it('weekly: springt über das Wochenende', () => {
    expect(nextOccurrence(mondayWednesdayFriday, '2026-01-01', '2026-05-06')).toBe('2026-05-08') // Wed → Fri
    expect(nextOccurrence(mondayWednesdayFriday, '2026-01-01', '2026-05-08')).toBe('2026-05-11') // Fri → Mon
    expect(nextOccurrence(mondayWednesdayFriday, '2026-05-01', '2026-04-01')).toBe('2026-05-01') // startsOn
  })

  it('every_n_days: drei Tage weiter, auch über den Monatswechsel', () => {
    expect(nextOccurrence(everyThreeDays, '2026-01-30', '2026-01-30')).toBe('2026-02-02')
    expect(nextOccurrence(everyThreeDays, '2026-01-30', '2026-02-01')).toBe('2026-02-02')
    expect(nextOccurrence(everyThreeDays, '2026-01-30', '2026-02-02')).toBe('2026-02-05')
  })

  it('monthly: der nächste Monat, in dem der Tag existiert oder der letzte gilt', () => {
    expect(nextOccurrence(monthly31, '2026-01-01', '2026-01-31')).toBe('2026-02-28')
    expect(nextOccurrence(monthly31, '2026-01-01', '2026-02-28')).toBe('2026-03-31')
    expect(nextOccurrence(monthly31, '2026-01-01', '2026-04-30')).toBe('2026-05-31')
    expect(nextOccurrence(monthly29, '2026-01-01', '2028-02-29')).toBe('2028-03-29')
  })

  it('wirft RangeError für unmögliche Regeln', () => {
    expect(() => nextOccurrence({ freq: 'monthly', monthDay: 0 }, '2026-01-01', '2026-01-01')).toThrow(RangeError)
    expect(() => nextOccurrence({ freq: 'weekly', weekdays: [] }, '2026-01-01', '2026-01-01')).toThrow(RangeError)
    expect(() => nextOccurrence({ freq: 'every_n_days', interval: 0 }, '2026-01-01', '2026-01-01')).toThrow(
      'invalid_interval',
    )
  })
})

describe('summer time', () => {
  it('ändert nichts: daily liefert über den 2026-03-29 hinweg jeden Kalendertag', () => {
    const table = ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']
    for (const date of table) expect(occursOn(daily, '2026-03-01', date)).toBe(true)

    let day = nextOccurrence(daily, '2026-03-01', '2026-03-28')
    expect(day).toBe('2026-03-29')
    day = nextOccurrence(daily, '2026-03-01', day)
    expect(day).toBe('2026-03-30')
  })

  it('ändert nichts: daily über den 2026-10-25 hinweg', () => {
    expect(nextOccurrence(daily, '2026-10-01', '2026-10-24')).toBe('2026-10-25')
    expect(nextOccurrence(daily, '2026-10-01', '2026-10-25')).toBe('2026-10-26')
    expect(occursOn(everyThreeDays, '2026-10-24', '2026-10-27')).toBe(true)
  })
})
