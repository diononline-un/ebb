import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import { addDays, dayOfWeek } from '../src/shared/day.ts'
import type { Habit, HabitDay, HabitsToday } from '../src/shared/schemas/habits.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type Today = { date: string }

async function todayOf(user: TestUser): Promise<string> {
  return ((await (await as(user).get('/api/today')).json()) as Today).date
}

async function createHabit(user: TestUser, body: Record<string, unknown> = {}): Promise<Habit> {
  const res = await as(user).post('/api/habits', { name: 'Ten minutes of tidying', ...body })
  expect(res.status).toBe(201)
  return (await res.json()) as Habit
}

async function habitsToday(user: TestUser): Promise<HabitsToday> {
  return (await (await as(user).get('/api/habits/today')).json()) as HabitsToday
}

describe('POST /api/habits', () => {
  it('creates a daily habit', async () => {
    const user = await createUser()
    const habit = await createHabit(user)
    expect(habit).toMatchObject({ name: 'Ten minutes of tidying', cadence: 'daily', weekdays: null, archivedAt: null })
  })

  it('needs a target for a weekly count and a known goal', async () => {
    const user = await createUser()
    const missing = await as(user).post('/api/habits', { name: 'Run', cadence: 'weekly_count' })
    expect(missing.status).toBe(422)
    expect(((await missing.json()) as { code: string }).code).toBe('weekly_target_required')

    const unknownGoal = await as(user).post('/api/habits', { name: 'Run', goalId: crypto.randomUUID() })
    expect(unknownGoal.status).toBe(422)
    expect(((await unknownGoal.json()) as { code: string }).code).toBe('unknown_goal')

    const created = await createHabit(user, { name: 'Run', cadence: 'weekly_count', weeklyTarget: 3 })
    expect(created).toMatchObject({ cadence: 'weekly_count', weeklyTarget: 3 })
  })

  it('refuses a weekday outside the week', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/habits', { name: 'Run', weekdays: [7] })
    expect(res.status).toBe(400)
    // The field error names the entry that failed, so a form can point at the box.
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('weekdays.0')
  })
})

describe('PUT und DELETE /api/habits/:id/log/:date', () => {
  it('ticks today and takes it back', async () => {
    const user = await createUser()
    const habit = await createHabit(user)
    const today = await todayOf(user)

    const done = await as(user).put(`/api/habits/${habit.id}/log/${today}`)
    expect(done.status).toBe(200)
    expect((await done.json()) as HabitDay).toEqual({ habitId: habit.id, date: today, done: true })
    expect((await habitsToday(user)).habits[0]).toMatchObject({ doneToday: true, week: { done: 1, target: 7 } })

    const undone = await as(user).delete(`/api/habits/${habit.id}/log/${today}`)
    expect(undone.status).toBe(204)
    expect((await habitsToday(user)).habits[0]).toMatchObject({ doneToday: false, week: { done: 0, target: 7 } })
  })

  it('lets yesterday be caught up and closes older days', async () => {
    const user = await createUser()
    const habit = await createHabit(user)
    const today = await todayOf(user)

    expect((await as(user).put(`/api/habits/${habit.id}/log/${addDays(today, -1)}`)).status).toBe(200)
    const old = await as(user).put(`/api/habits/${habit.id}/log/${addDays(today, -2)}`)
    expect(old.status).toBe(422)
    expect(((await old.json()) as { code: string }).code).toBe('day_locked')
    expect((await as(user).delete(`/api/habits/${habit.id}/log/${addDays(today, -3)}`)).status).toBe(422)
  })

  it('answers 404 for a foreign habit', async () => {
    const a = await createUser()
    const b = await createUser()
    const habit = await createHabit(a)
    const today = await todayOf(a)
    expect((await as(b).put(`/api/habits/${habit.id}/log/${today}`)).status).toBe(404)
  })
})

describe('GET /api/habits/today', () => {
  it('lists the habits of the day and hides the archived ones', async () => {
    const user = await createUser()
    const habit = await createHabit(user)
    expect((await habitsToday(user)).habits.map((row) => row.id)).toEqual([habit.id])

    const archived = await as(user).patch(`/api/habits/${habit.id}`, { archived: true })
    expect(archived.status).toBe(200)
    expect((await habitsToday(user)).habits).toEqual([])

    // Archived habits stay visible in the management list.
    const all = (await (await as(user).get('/api/habits')).json()) as Habit[]
    expect(all.map((row) => row.id)).toEqual([habit.id])
  })

  it('lists a weekday habit only on its days', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const dueToday = await createHabit(user, { name: 'Due today', weekdays: [dayOfWeek(today)] })
    await createHabit(user, { name: 'Another day', weekdays: [dayOfWeek(addDays(today, 1))] })

    expect((await habitsToday(user)).habits.map((row) => row.id)).toEqual([dueToday.id])
  })

  it('keeps a weekly count on the list only while it needs work', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const habit = await createHabit(user, { name: 'Run', cadence: 'weekly_count', weeklyTarget: 2 })

    await as(user).put(`/api/habits/${habit.id}/log/${today}`)
    expect((await habitsToday(user)).habits[0]).toMatchObject({ doneToday: true, week: { done: 1, target: 2 } })

    await as(user).put(`/api/habits/${habit.id}/log/${addDays(today, -1)}`)
    expect((await habitsToday(user)).habits[0]).toMatchObject({ doneToday: true, week: { done: 2, target: 2 } })

    // One log taken back: there is work left again, so the habit stays for today.
    await as(user).delete(`/api/habits/${habit.id}/log/${today}`)
    expect((await habitsToday(user)).habits[0]).toMatchObject({ doneToday: false, week: { done: 1, target: 2 } })
  })

  it('leaves the day once a weekly count is filled from another day', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const habit = await createHabit(user, { name: 'Call one friend', cadence: 'weekly_count', weeklyTarget: 1 })

    await as(user).put(`/api/habits/${habit.id}/log/${addDays(today, -1)}`)
    // Target filled yesterday: nothing left for today, and nothing to untick either.
    expect((await habitsToday(user)).habits).toEqual([])
  })
})

describe('PATCH /api/habits/:id', () => {
  it('switches between a daily habit and a weekly count', async () => {
    const user = await createUser()
    const habit = await createHabit(user)

    const weekly = await as(user).patch(`/api/habits/${habit.id}`, { cadence: 'weekly_count', weeklyTarget: 4 })
    expect(weekly.status).toBe(200)
    expect(await weekly.json()).toMatchObject({ cadence: 'weekly_count', weeklyTarget: 4 })

    // Back to daily: the target no longer means anything and is dropped.
    const daily = await as(user).patch(`/api/habits/${habit.id}`, { cadence: 'daily' })
    expect(await daily.json()).toMatchObject({ cadence: 'daily', weeklyTarget: null })
  })

  it('refuses a weekly count without a target', async () => {
    const user = await createUser()
    const habit = await createHabit(user)
    const res = await as(user).patch(`/api/habits/${habit.id}`, { cadence: 'weekly_count', weeklyTarget: null })
    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe('weekly_target_required')
  })

  it('renames and moves a habit', async () => {
    const user = await createUser()
    const habit = await createHabit(user)
    const res = await as(user).patch(`/api/habits/${habit.id}`, { name: 'Read a page', position: 3, reminderTime: '07:30' })
    expect(await res.json()).toMatchObject({ name: 'Read a page', position: 3, reminderTime: '07:30' })
  })
})

describe('PUT /api/onboarding', () => {
  it('remembers the step and finishes once', async () => {
    const user = await createUser()

    const step = await as(user).put('/api/onboarding', { step: 4 })
    expect(step.status).toBe(200)
    expect(await step.json()).toEqual({ step: 4 })

    const me = (await (await as(user).get('/api/me')).json()) as { settings: { onboardingStep: number; onboardingDoneAt: string | null } }
    expect(me.settings.onboardingStep).toBe(4)
    expect(me.settings.onboardingDoneAt).toBeNull()

    const done = await as(user).post('/api/onboarding/done')
    expect(done.status).toBe(200)
    const finished = (await done.json()) as { onboardingDoneAt: string }
    expect(finished.onboardingDoneAt).toBeTruthy()

    const again = await as(user).post('/api/onboarding/done')
    expect(((await again.json()) as { onboardingDoneAt: string }).onboardingDoneAt).toBe(finished.onboardingDoneAt)
  })

  it('refuses a step outside the nine', async () => {
    const user = await createUser()
    const res = await as(user).put('/api/onboarding', { step: 12 })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('step')
  })
})
