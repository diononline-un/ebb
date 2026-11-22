import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import { addDays, dayOfWeek } from '../src/shared/day.ts'
import type { Recurrence } from '../src/shared/schemas/recurrence.ts'
import type { TodayView } from '../src/shared/schemas/task.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function todayOf(user: TestUser): Promise<string> {
  return ((await (await as(user).get('/api/today')).json()) as TodayView).date
}

async function createRecurrence(user: TestUser, body: Record<string, unknown>): Promise<Recurrence> {
  const res = await as(user).post('/api/recurrences', { title: 'Water the plants', rule: { freq: 'daily' }, ...body })
  expect(res.status).toBe(201)
  return (await res.json()) as Recurrence
}

/** Moves the user's clock one day forward, which starts a new day on the next request. */
async function moveADay(user: TestUser): Promise<void> {
  const res = await as(user).post('/api/dev/clock', { offsetMinutes: 24 * 60 })
  expect(res.status).toBe(200)
}

function titlesOf(view: TodayView): string[] {
  return [
    ...(view.anchor ? [view.anchor.title] : []),
    ...view.must.map((task) => task.title),
    ...view.slots.inbox.map((task) => task.title),
  ]
}

describe('POST /api/recurrences', () => {
  it('stores a rule and lists it', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const rule = await createRecurrence(user, { startsOn: today, rule: { freq: 'weekly', weekdays: [1, 3] } })
    expect(rule.rule).toEqual({ freq: 'weekly', weekdays: [1, 3] })

    const list = (await (await as(user).get('/api/recurrences')).json()) as Recurrence[]
    expect(list.map((row) => row.id)).toEqual([rule.id])
  })

  it('refuses a rule without a frequency and a start without a day', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    expect((await as(user).post('/api/recurrences', { title: 'Broken', rule: { interval: 3 }, startsOn: today })).status).toBe(400)
    expect((await as(user).post('/api/recurrences', { title: 'Broken', rule: { freq: 'daily' } })).status).toBe(400)
  })
})

describe('instances at the day start', () => {
  it('brings the task of a daily rule into the new day, once', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    await createRecurrence(user, { startsOn: today })

    await moveADay(user)
    const day = (await (await as(user).get('/api/today')).json()) as TodayView
    expect(day.date).toBe(addDays(today, 1))
    expect(titlesOf(day)).toContain('Water the plants')

    // The same day again: the start runs no second time, so nothing doubles.
    const again = (await (await as(user).get('/api/today')).json()) as TodayView
    expect(titlesOf(again).filter((title) => title === 'Water the plants')).toHaveLength(1)
  })

  it('leaves a day alone when the rule does not ask for it', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const tomorrowDow = dayOfWeek(addDays(today, 1))
    const otherDay = (tomorrowDow + 1) % 7
    await createRecurrence(user, { startsOn: today, rule: { freq: 'weekly', weekdays: [otherDay] } })

    await moveADay(user)
    const day = (await (await as(user).get('/api/today')).json()) as TodayView
    expect(titlesOf(day)).not.toContain('Water the plants')
  })

  it('stops when the rule is switched off', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const rule = await createRecurrence(user, { startsOn: today })
    await as(user).patch(`/api/recurrences/${rule.id}`, { active: false })

    await moveADay(user)
    const day = (await (await as(user).get('/api/today')).json()) as TodayView
    expect(titlesOf(day)).not.toContain('Water the plants')
  })

  it('uses the changed rule from the next instance on', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const rule = await createRecurrence(user, { startsOn: today })
    await as(user).patch(`/api/recurrences/${rule.id}`, { title: 'Water all the plants' })

    await moveADay(user)
    const day = (await (await as(user).get('/api/today')).json()) as TodayView
    expect(titlesOf(day)).toContain('Water all the plants')
    expect(titlesOf(day)).not.toContain('Water the plants')
  })

  it('keeps rules of other people out of my day', async () => {
    const a = await createUser()
    const b = await createUser()
    const today = await todayOf(a)
    await createRecurrence(a, { startsOn: today })

    await moveADay(b)
    const day = (await (await as(b).get('/api/today')).json()) as TodayView
    expect(titlesOf(day)).not.toContain('Water the plants')
  })

  it('carries the project of the rule into the instance', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const project = (await (await as(user).post('/api/projects', { name: 'Move the office' })).json()) as {
      project: { id: string }
    }
    await createRecurrence(user, { startsOn: today, projectId: project.project.id })

    await moveADay(user)
    const day = (await (await as(user).get('/api/today')).json()) as TodayView
    const instance = day.slots.inbox.find((task) => task.title === 'Water the plants')
    expect(instance?.projectId).toBe(project.project.id)
    expect(instance?.recurrenceId).toBeTruthy()
  })
})

describe('DELETE /api/recurrences/:id', () => {
  it('removes the rule and keeps the tasks it made', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const rule = await createRecurrence(user, { startsOn: today })

    await moveADay(user)
    const day = (await (await as(user).get('/api/today')).json()) as TodayView
    const instance = day.slots.inbox.find((task) => task.title === 'Water the plants')
    expect(instance).toBeTruthy()

    expect((await as(user).delete(`/api/recurrences/${rule.id}`)).status).toBe(204)
    const held = (await (await as(user).get(`/api/tasks/${instance?.id}`)).json()) as {
      task: { recurrenceId: string | null }
    }
    expect(held.task.recurrenceId).toBeNull()
  })
})
