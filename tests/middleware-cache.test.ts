import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { startDayIfNeededWithSettings } from '../src/server/domain/day/start-day.ts'
import { forgetAccess, setAccessClock } from '../src/server/middleware/entitlement.ts'
import { forgetDay } from '../src/server/middleware/day-start.ts'
import { addDays, localDate } from '../src/shared/day.ts'
import type { TodayView } from '../src/shared/schemas/task.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

// Counts the real day start without replacing it: the wrapper hands the call to the original, and
// the middleware keeps working on the real function (E9-P6: two requests, one day start).
vi.mock('../src/server/domain/day/start-day.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/server/domain/day/start-day.ts')>()
  return { ...original, startDayIfNeededWithSettings: vi.fn(original.startDayIfNeededWithSettings) }
})

const dayStart = vi.mocked(startDayIfNeededWithSettings)

const created: TestUser[] = []

/** A fresh account whose caches are dropped again after the test. */
async function newUser(): Promise<TestUser> {
  const user = await createUser()
  created.push(user)
  return user
}

beforeEach(async () => {
  await resetDb()
  dayStart.mockClear()
  setAccessClock(Date.now)
})

afterEach(() => {
  for (const user of created.splice(0)) {
    forgetDay(user.id)
    forgetAccess(user.id)
  }
})

afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function todayOf(user: TestUser): Promise<string> {
  return ((await (await as(user).get('/api/today')).json()) as TodayView).date
}

/** Minutes from now to the next 04:00 UTC (the default day start) plus one, so the new day counts. */
function minutesToNextDayStart(): number {
  const now = new Date()
  const minutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes()
  return 240 - minutesOfDay + (minutesOfDay >= 240 ? 1440 : 0) + 1
}

describe('day start cache', () => {
  it('starts the day on the first request and serves the second from the cache', async () => {
    const user = await newUser()
    expect(dayStart).not.toHaveBeenCalled()

    const first = (await (await as(user).get('/api/today')).json()) as TodayView
    const second = (await (await as(user).get('/api/today')).json()) as TodayView

    expect(dayStart).toHaveBeenCalledTimes(1)
    expect(second.date).toBe(first.date)
  })

  it('reads the settings again after PATCH /api/settings', async () => {
    const user = await newUser()
    await as(user).get('/api/today')
    expect(dayStart).toHaveBeenCalledTimes(1)

    const patched = await as(user).patch('/api/settings', { timezone: 'Pacific/Kiritimati' })
    expect(patched.status).toBe(200)

    const today = await todayOf(user)
    expect(dayStart).toHaveBeenCalledTimes(2)
    // UTC+14: the recomputed day belongs to the new time zone, not to the cached one.
    expect(today).toBe(localDate(new Date(), 'Pacific/Kiritimati', 240))
  })

  it('starts the new day when the dev clock crosses midnight', async () => {
    const user = await newUser()
    const today = await todayOf(user)
    expect((await as(user).post('/api/tasks', { title: 'from the old day' })).status).toBe(201)

    const moved = await as(user).post('/api/dev/clock', { offsetMinutes: minutesToNextDayStart() })
    expect(moved.status).toBe(200)

    const view = (await (await as(user).get('/api/today')).json()) as TodayView
    expect(dayStart).toHaveBeenCalledTimes(2)
    expect(view.date).toBe(addDays(today, 1))
    expect(view.rolledCount).toBe(1)
    expect(view.slots.inbox.map((task) => task.title)).toContain('from the old day')
  })
})

describe('access cache', () => {
  it('reuses a yes for thirty seconds, never caches a no', async () => {
    let now = Date.now()
    setAccessClock(() => now)
    const user = await newUser()

    expect((await as(user).post('/api/tasks', { title: 'while the trial runs' })).status).toBe(201)
    await withSystem(
      (tx) => tx`update user_access set trial_ends_at = now() - interval '1 day' where user_id = ${user.id}`,
    )
    // Inside the window the cached yes still stands.
    expect((await as(user).post('/api/tasks', { title: 'the last one it lets through' })).status).toBe(201)

    now += 30_000
    expect((await as(user).post('/api/tasks', { title: 'too late' })).status).toBe(402)

    // A no is not remembered: after paying, the next write goes through at once.
    await withSystem(
      (tx) => tx`update user_access set trial_ends_at = now() + interval '1 day' where user_id = ${user.id}`,
    )
    expect((await as(user).post('/api/tasks', { title: 'after paying' })).status).toBe(201)
  })
})
