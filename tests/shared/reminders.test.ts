import { describe, expect, it } from 'vitest'
import {
  dueReminders,
  inQuietHours,
  isDue,
  localClock,
  type ReminderFacts,
  type ReminderSettings,
} from '../../src/shared/reminders.ts'
import type { Notify } from '../../src/shared/schemas/settings.ts'

// E9-P2: the reminder rules are pure, so the clock and the facts come in and the due list comes out.

const at = (iso: string) => new Date(iso)

/** Monday 2026-06-01, 07:30 in Berlin (CEST). */
const MONDAY_0730 = at('2026-06-01T05:30:00Z')

function only(kind: keyof Notify): Notify {
  return {
    morning: false,
    habits: false,
    weeklyReset: false,
    errands: false,
    timer: false,
    trial: false,
    [kind]: true,
  }
}

function none(): Notify {
  return {
    morning: false,
    habits: false,
    weeklyReset: false,
    errands: false,
    timer: false,
    trial: false,
  }
}

function settings(overrides: Partial<ReminderSettings> = {}): ReminderSettings {
  return {
    timezone: 'Europe/Berlin',
    dayStartMinute: 240,
    morningReminder: '07:30',
    weeklyResetDow: 1,
    weeklyResetTime: '07:30',
    errandsDow: 1,
    quietStart: '21:00',
    quietEnd: '07:00',
    notify: only('morning'),
    ...overrides,
  }
}

function facts(overrides: Partial<ReminderFacts> = {}): ReminderFacts {
  return {
    ritualDone: false,
    habits: [],
    weeklyResetDone: false,
    errandsOpen: 0,
    trialEndsAt: null,
    timers: [],
    ...overrides,
  }
}

function kinds(due: ReturnType<typeof dueReminders>): string[] {
  return due.map((entry) => entry.kind)
}

describe('localClock', () => {
  it('reads the Berlin clock across the spring changeover (2026-03-29)', () => {
    // 02:00 CET becomes 03:00 CEST at 01:00 UTC.
    expect(localClock(at('2026-03-29T00:59:00Z'), 'Europe/Berlin')).toEqual({
      date: '2026-03-29',
      minute: 119,
      dow: 0,
    })
    expect(localClock(at('2026-03-29T01:00:00Z'), 'Europe/Berlin')).toEqual({
      date: '2026-03-29',
      minute: 180,
      dow: 0,
    })
  })

  it('reads the Berlin clock across the autumn changeover (2026-10-25)', () => {
    // 03:00 CEST becomes 02:00 CET at 01:00 UTC: 02:30 happens twice, the date stays the same.
    expect(localClock(at('2026-10-25T00:30:00Z'), 'Europe/Berlin')).toEqual({
      date: '2026-10-25',
      minute: 150,
      dow: 0,
    })
    expect(localClock(at('2026-10-25T01:30:00Z'), 'Europe/Berlin')).toEqual({
      date: '2026-10-25',
      minute: 150,
      dow: 0,
    })
  })

  it('reads the New York clock across the spring changeover (2026-03-08)', () => {
    // 02:00 EST becomes 03:00 EDT at 07:00 UTC.
    expect(localClock(at('2026-03-08T06:59:00Z'), 'America/New_York')).toEqual({
      date: '2026-03-08',
      minute: 119,
      dow: 0,
    })
    expect(localClock(at('2026-03-08T07:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-03-08',
      minute: 180,
      dow: 0,
    })
  })

  it('reads Tokyo without a changeover (UTC+9)', () => {
    // 15:00 UTC is midnight of the next day there.
    expect(localClock(at('2026-11-21T15:00:00Z'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-22',
      minute: 0,
      dow: 0,
    })
    expect(localClock(at('2026-11-21T14:59:00Z'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-21',
      minute: 1439,
      dow: 6,
    })
  })
})

describe('inQuietHours', () => {
  it('covers the night when quiet hours cross midnight', () => {
    const start = 21 * 60
    const end = 7 * 60
    expect(inQuietHours(21 * 60, start, end)).toBe(true)
    expect(inQuietHours(23 * 60 + 59, start, end)).toBe(true)
    expect(inQuietHours(0, start, end)).toBe(true)
    expect(inQuietHours(6 * 60 + 59, start, end)).toBe(true)
    expect(inQuietHours(7 * 60, start, end)).toBe(false)
    expect(inQuietHours(20 * 60 + 59, start, end)).toBe(false)
  })

  it('covers a range inside one day when start is before end', () => {
    const start = 12 * 60
    const end = 14 * 60
    expect(inQuietHours(12 * 60, start, end)).toBe(true)
    expect(inQuietHours(13 * 60 + 59, start, end)).toBe(true)
    expect(inQuietHours(14 * 60, start, end)).toBe(false)
    expect(inQuietHours(11 * 60 + 59, start, end)).toBe(false)
  })

  it('treats equal endpoints as switched off', () => {
    expect(inQuietHours(12 * 60, 9 * 60, 9 * 60)).toBe(false)
  })
})

describe('isDue', () => {
  it('accepts the target minute and the last minute of the window', () => {
    expect(isDue(450, 450)).toBe(true)
    expect(isDue(450, 465)).toBe(true)
  })

  it('rejects one minute after the window and any minute before the target', () => {
    expect(isDue(450, 466)).toBe(false)
    expect(isDue(450, 449)).toBe(false)
  })

  it('honours a custom window', () => {
    expect(isDue(450, 455, 5)).toBe(true)
    expect(isDue(450, 456, 5)).toBe(false)
  })
})

describe('dueReminders morning', () => {
  it('is due at the reminder time while the ritual is open', () => {
    const due = dueReminders({ now: MONDAY_0730, settings: settings(), facts: facts() })

    expect(due).toEqual([
      {
        kind: 'morning',
        ref: '',
        localDate: '2026-06-01',
        titleKey: 'morning.title',
        bodyKey: 'morning.body',
        url: '/ritual',
      },
    ])
  })

  it('stays quiet when the ritual is done, the reminder is off or there is no time', () => {
    expect(dueReminders({ now: MONDAY_0730, settings: settings(), facts: facts({ ritualDone: true }) })).toEqual([])

    const off = settings({ notify: none() })
    expect(dueReminders({ now: MONDAY_0730, settings: off, facts: facts() })).toEqual([])

    const withoutTime = settings({ morningReminder: null })
    expect(dueReminders({ now: MONDAY_0730, settings: withoutTime, facts: facts() })).toEqual([])
  })

  it('drops out of quiet hours and out of the window', () => {
    const quiet = settings({ quietStart: '07:00', quietEnd: '09:00' })
    expect(dueReminders({ now: MONDAY_0730, settings: quiet, facts: facts() })).toEqual([])

    const late = at('2026-06-01T05:46:00Z')
    expect(dueReminders({ now: late, settings: settings(), facts: facts() })).toEqual([])
  })
})

describe('dueReminders habit', () => {
  const habit = { id: 'habit-1', name: 'Stretch', reminderTime: '07:30', weekdays: null, doneToday: false }

  it('is due for a habit without weekdays', () => {
    const due = dueReminders({
      now: MONDAY_0730,
      settings: settings({ notify: only('habits') }),
      facts: facts({ habits: [habit] }),
    })

    expect(due).toEqual([
      {
        kind: 'habit',
        ref: 'habit-1',
        localDate: '2026-06-01',
        titleKey: 'habit.title',
        bodyKey: 'habit.body',
        url: '/habits',
        vars: { name: 'Stretch' },
      },
    ])
  })

  it('is due on a listed weekday and quiet on another', () => {
    const monday = { ...habit, weekdays: [1] }
    const wednesday = { ...habit, weekdays: [3] }
    const input = { now: MONDAY_0730, settings: settings({ notify: only('habits') }), facts: facts() }

    expect(kinds(dueReminders({ ...input, facts: facts({ habits: [monday] }) }))).toEqual(['habit'])
    expect(dueReminders({ ...input, facts: facts({ habits: [wednesday] }) })).toEqual([])
  })

  it('stays quiet after a log, with the type off or in quiet hours', () => {
    const base = { now: MONDAY_0730, settings: settings({ notify: only('habits') }), facts: facts() }

    expect(dueReminders({ ...base, facts: facts({ habits: [{ ...habit, doneToday: true }] }) })).toEqual([])
    expect(
      dueReminders({
        now: MONDAY_0730,
        settings: settings({ notify: none() }),
        facts: facts({ habits: [habit] }),
      }),
    ).toEqual([])
    expect(
      dueReminders({
        now: MONDAY_0730,
        settings: settings({ notify: only('habits'), quietStart: '07:00', quietEnd: '09:00' }),
        facts: facts({ habits: [habit] }),
      }),
    ).toEqual([])
  })
})

describe('dueReminders weeklyReset', () => {
  it('is due on the reset day of an unfinished week', () => {
    const due = dueReminders({ now: MONDAY_0730, settings: settings({ notify: only('weeklyReset') }), facts: facts() })

    expect(due).toEqual([
      {
        kind: 'weeklyReset',
        ref: '2026-05-26',
        localDate: '2026-06-01',
        titleKey: 'weeklyReset.title',
        bodyKey: 'weeklyReset.body',
        url: '/reset',
      },
    ])
  })

  it('stays quiet after a completed week, on another weekday, with the type off or in quiet hours', () => {
    const base = { now: MONDAY_0730, facts: facts() }

    expect(
      dueReminders({ ...base, settings: settings({ notify: only('weeklyReset') }), facts: facts({ weeklyResetDone: true }) }),
    ).toEqual([])
    expect(
      dueReminders({ ...base, settings: settings({ notify: only('weeklyReset'), weeklyResetDow: 3 }) }),
    ).toEqual([])
    expect(dueReminders({ ...base, settings: settings({ notify: none() }) })).toEqual([])
    expect(
      dueReminders({
        ...base,
        settings: settings({ notify: only('weeklyReset'), quietStart: '07:00', quietEnd: '09:00' }),
      }),
    ).toEqual([])
  })
})

describe('dueReminders errands', () => {
  const nineBerlin = at('2026-06-01T07:05:00Z')

  it('is due at 09:00 on the errands day while errands are open', () => {
    const due = dueReminders({
      now: nineBerlin,
      settings: settings({ notify: only('errands') }),
      facts: facts({ errandsOpen: 2 }),
    })

    expect(due).toEqual([
      {
        kind: 'errands',
        ref: '',
        localDate: '2026-06-01',
        titleKey: 'errands.title',
        bodyKey: 'errands.body',
        url: '/errands',
      },
    ])
  })

  it('stays quiet without open errands, on another weekday, with the type off or in quiet hours', () => {
    expect(
      dueReminders({ now: nineBerlin, settings: settings({ notify: only('errands') }), facts: facts() }),
    ).toEqual([])
    expect(
      dueReminders({
        now: nineBerlin,
        settings: settings({ notify: only('errands'), errandsDow: 3 }),
        facts: facts({ errandsOpen: 2 }),
      }),
    ).toEqual([])
    expect(
      dueReminders({
        now: nineBerlin,
        settings: settings({ notify: none() }),
        facts: facts({ errandsOpen: 2 }),
      }),
    ).toEqual([])
    expect(
      dueReminders({
        now: nineBerlin,
        settings: settings({ notify: only('errands'), quietStart: '09:00', quietEnd: '17:00' }),
        facts: facts({ errandsOpen: 2 }),
      }),
    ).toEqual([])
  })
})

describe('dueReminders trial', () => {
  const tenBerlin = at('2026-06-01T08:00:00Z')

  it('is due at 10:00 within the last 48 hours, once per end date', () => {
    const due = dueReminders({
      now: tenBerlin,
      settings: settings({ notify: only('trial') }),
      facts: facts({ trialEndsAt: at('2026-06-02T08:00:00Z') }),
    })

    expect(due).toEqual([
      {
        kind: 'trial',
        ref: '2026-06-02',
        localDate: '2026-06-02',
        titleKey: 'trial.title',
        bodyKey: 'trial.body',
        url: '/settings/billing',
      },
    ])
  })

  it('stays quiet before the 48 hour window, after the end, with the type off or in quiet hours', () => {
    const options = { now: tenBerlin, settings: settings({ notify: only('trial') }) }

    expect(
      dueReminders({ ...options, facts: facts({ trialEndsAt: at('2026-06-04T08:01:00Z') }) }),
    ).toEqual([])
    expect(
      dueReminders({ ...options, facts: facts({ trialEndsAt: at('2026-06-01T07:59:00Z') }) }),
    ).toEqual([])
    expect(
      dueReminders({
        now: tenBerlin,
        settings: settings({ notify: none() }),
        facts: facts({ trialEndsAt: at('2026-06-02T08:00:00Z') }),
      }),
    ).toEqual([])
    expect(
      dueReminders({
        now: tenBerlin,
        settings: settings({ notify: only('trial'), quietStart: '10:00', quietEnd: '17:00' }),
        facts: facts({ trialEndsAt: at('2026-06-02T08:00:00Z') }),
      }),
    ).toEqual([])
  })
})

describe('dueReminders timer', () => {
  const night = at('2026-06-01T21:00:00Z')

  it('is due at any minute once the session has run out, quiet hours included', () => {
    const due = dueReminders({
      now: night,
      settings: settings({ notify: only('timer') }),
      facts: facts({ timers: [{ id: 'session-1', startedAt: at('2026-06-01T20:30:00Z'), plannedMinutes: 25 }] }),
    })

    expect(due).toEqual([
      {
        kind: 'timer',
        ref: 'session-1',
        localDate: '2026-06-01',
        titleKey: 'timer.title',
        bodyKey: 'timer.body',
        url: '/today',
      },
    ])
  })

  it('stays quiet while the session still runs and when the type is off', () => {
    const running = { id: 'session-1', startedAt: at('2026-06-01T20:50:00Z'), plannedMinutes: 25 }
    expect(
      dueReminders({
        now: night,
        settings: settings({ notify: only('timer') }),
        facts: facts({ timers: [running] }),
      }),
    ).toEqual([])
    expect(
      dueReminders({
        now: night,
        settings: settings({ notify: none() }),
        facts: facts({ timers: [{ ...running, startedAt: at('2026-06-01T20:30:00Z') }] }),
      }),
    ).toEqual([])
  })
})
