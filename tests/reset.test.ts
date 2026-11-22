import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { addDays } from '../src/shared/day.ts'
import type { ResetCurrent, ResetHistoryWeek } from '../src/shared/schemas/reset.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function todayOf(user: TestUser): Promise<string> {
  return ((await (await as(user).get('/api/today')).json()) as { date: string }).date
}

async function current(user: TestUser): Promise<ResetCurrent> {
  const res = await as(user).get('/api/reset/current')
  expect(res.status).toBe(200)
  return (await res.json()) as ResetCurrent
}

async function addTask(user: TestUser, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await as(user).post('/api/tasks', body)
  expect(res.status).toBe(201)
  return ((await res.json()) as { task: { id: string } }).task
}

/** A task that slid three times: the shape the stuck step looks for. FORCE RLS binds the owner too. */
async function makeStuck(user: TestUser, title: string): Promise<string> {
  const task = await addTask(user, { title })
  await withSystem((tx) => tx`update task set push_count = 3 where id = ${task.id}`)
  return task.id
}

describe('GET /api/reset/current', () => {
  it('opens the week with empty answers and the seven days ahead', async () => {
    const user = await createUser()
    const reset = await current(user)

    expect(reset.step).toBe(0)
    expect(reset.wentWell).toBe('')
    expect(reset.completedAt).toBeNull()
    expect(reset.outlook).toHaveLength(7)
    expect(reset.stuck).toEqual([])
    expect(reset.stats.anchorDays).toBe(0)
    expect(reset.stats.tasksDone).toBe(0)
  })

  it('counts the numbers of the week without grading them', async () => {
    const user = await createUser()
    const today = await todayOf(user)

    const anchor = await addTask(user, { title: 'the one thing', doDate: today })
    await as(user).patch(`/api/tasks/${anchor.id}`, { anchor: true })
    await as(user).patch(`/api/tasks/${anchor.id}`, { status: 'done' })

    const habit = (await (await as(user).post('/api/habits', { name: 'Tidy ten minutes' })).json()) as { id: string }
    await as(user).put(`/api/habits/${habit.id}/log/${today}`)

    await as(user).post('/api/focus', { plannedMinutes: 25, taskId: anchor.id })
    const session = (await (await as(user).post('/api/focus', { plannedMinutes: 25 })).json()) as { id: string }
    await as(user).post(`/api/focus/${session.id}/stop`)

    const reset = await current(user)
    expect(reset.stats.anchorDays).toBe(1)
    expect(reset.stats.tasksDone).toBe(1)
    expect(reset.stats.focusMinutes).toBe(50)
    expect(reset.stats.habits[0]).toMatchObject({ name: 'Tidy ten minutes', week: { done: 1, target: 7 } })
  })
})

describe('PATCH /api/reset/current', () => {
  it('keeps the answers and the step, also across a reload', async () => {
    const user = await createUser()
    const saved = await as(user).patch('/api/reset/current', { wentWell: 'the mornings were calm', step: 1 })
    expect(saved.status).toBe(200)

    const reset = await current(user)
    expect(reset.wentWell).toBe('the mornings were calm')
    expect(reset.step).toBe(1)

    // A second patch touches only what it names.
    await as(user).patch('/api/reset/current', { change: 'fewer musts' })
    const after = await current(user)
    expect(after.wentWell).toBe('the mornings were calm')
    expect(after.change).toBe('fewer musts')
  })

  it('refuses a step outside the four', async () => {
    const user = await createUser()
    const res = await as(user).patch('/api/reset/current', { step: 9 })
    expect(res.status).toBe(400)
  })
})

describe('stuck tasks', () => {
  it('lists what slid three times and needs a decision', async () => {
    const user = await createUser()
    const id = await makeStuck(user, 'write the invoice')
    const reset = await current(user)
    expect(reset.stuck.map((task) => task.id)).toEqual([id])
  })

  it('moves a task with a new date and clears the counter', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const id = await makeStuck(user, 'write the invoice')

    const res = await as(user).post(`/api/reset/stuck/${id}`, { decision: 'date', date: addDays(today, 3) })
    expect(res.status).toBe(200)

    const reset = await current(user)
    expect(reset.stuck).toEqual([])
    const detail = (await (await as(user).get(`/api/tasks/${id}`)).json()) as {
      task: { doDate: string; pushCount: number }
    }
    expect(detail.task.doDate).toBe(addDays(today, 3))
    expect(detail.task.pushCount).toBe(0)
  })

  it('sets a task aside, splits it or deletes it', async () => {
    const user = await createUser()
    const skipped = await makeStuck(user, 'skipped one')
    const split = await makeStuck(user, 'split one')
    const deleted = await makeStuck(user, 'deleted one')

    await as(user).post(`/api/reset/stuck/${skipped}`, { decision: 'skip' })
    await as(user).post(`/api/reset/stuck/${split}`, { decision: 'split' })
    await as(user).post(`/api/reset/stuck/${deleted}`, { decision: 'delete' })

    expect((await current(user)).stuck).toEqual([])
    const skippedTask = (await (await as(user).get(`/api/tasks/${skipped}`)).json()) as { task: { status: string } }
    expect(skippedTask.task.status).toBe('skipped')
    expect((await as(user).get(`/api/tasks/${deleted}`)).status).toBe(404)
  })

  it('needs a day when the decision is a new date', async () => {
    const user = await createUser()
    const id = await makeStuck(user, 'write the invoice')
    const res = await as(user).post(`/api/reset/stuck/${id}`, { decision: 'date' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('date')
  })
})

describe('POST /api/reset/complete', () => {
  it('waits while a stuck task has no decision', async () => {
    const user = await createUser()
    await makeStuck(user, 'write the invoice')
    const res = await as(user).post('/api/reset/complete')
    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe('stuck_open')
  })

  it('finishes the week once every decision is taken, and keeps the first moment', async () => {
    const user = await createUser()
    const id = await makeStuck(user, 'write the invoice')
    await as(user).post(`/api/reset/stuck/${id}`, { decision: 'skip' })

    const first = await as(user).post('/api/reset/complete')
    expect(first.status).toBe(200)
    const { completedAt } = (await first.json()) as { completedAt: string }
    expect(completedAt).toBeTruthy()

    const again = await as(user).post('/api/reset/complete')
    expect(((await again.json()) as { completedAt: string }).completedAt).toBe(completedAt)
    expect((await current(user)).step).toBe(4)
  })
})

describe('GET /api/reset/history', () => {
  it('keeps earlier weeks readable', async () => {
    const user = await createUser()
    await as(user).patch('/api/reset/current', { wentWell: 'the mornings were calm' })
    await as(user).post('/api/reset/complete')

    // The next day belongs to the next week at the earliest, so a second week is written by hand.
    const clock = await as(user).post('/api/dev/clock', { offsetMinutes: 7 * 24 * 60 })
    expect(clock.status).toBe(200)
    await as(user).patch('/api/reset/current', { wentWell: 'a quieter week' })

    const weeks = (await (await as(user).get('/api/reset/history')).json()) as ResetHistoryWeek[]
    expect(weeks).toHaveLength(2)
    expect(weeks[0]?.wentWell).toBe('a quieter week')
    expect(weeks[1]?.wentWell).toBe('the mornings were calm')
  })
})
