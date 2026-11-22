import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import type { Goal } from '../src/shared/schemas/goals.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function goals(user: TestUser): Promise<Goal[]> {
  return (await (await as(user).get('/api/goals')).json()) as Goal[]
}

async function createGoal(user: TestUser, body: Record<string, unknown> = {}): Promise<Goal> {
  const res = await as(user).post('/api/goals', { title: 'Be calmer at work', ...body })
  expect(res.status).toBe(201)
  return (await res.json()) as Goal
}

describe('GET /api/goals', () => {
  it('answers an empty list for a new account', async () => {
    const user = await createUser()
    expect(await goals(user)).toEqual([])
  })

  it('keeps the order it was given', async () => {
    const user = await createUser()
    const first = await createGoal(user, { title: 'First' })
    const second = await createGoal(user, { title: 'Second' })
    expect(first.position).toBe(0)
    expect(second.position).toBe(1)
    expect((await goals(user)).map((goal) => goal.title)).toEqual(['First', 'Second'])

    const moved = await as(user).patch(`/api/goals/${second.id}`, { position: 0 })
    expect(moved.status).toBe(200)
    expect(((await moved.json()) as Goal).position).toBe(0)
  })
})

describe('POST /api/goals', () => {
  it('stores title, why and status', async () => {
    const user = await createUser()
    const goal = await createGoal(user, { why: 'Because the evenings are too short.', status: 'paused' })
    expect(goal).toMatchObject({ title: 'Be calmer at work', why: 'Because the evenings are too short.', status: 'paused' })
    expect(goal.why).toBe('Because the evenings are too short.')
  })

  it('refuses an empty title', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/goals', { title: '   ' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('title')
  })

  it('stops at five active goals and says why', async () => {
    const user = await createUser()
    for (let index = 0; index < 5; index += 1) await createGoal(user, { title: `Goal ${index}` })

    const sixth = await as(user).post('/api/goals', { title: 'One too many' })
    expect(sixth.status).toBe(422)
    expect(((await sixth.json()) as { code: string }).code).toBe('too_many_goals')

    // A paused goal takes no place, and reactivating one needs a free one.
    const paused = await createGoal(user, { title: 'Paused', status: 'paused' })
    expect(paused.status).toBe('paused')
    const reactivate = await as(user).patch(`/api/goals/${paused.id}`, { status: 'active' })
    expect(reactivate.status).toBe(422)
    expect(((await reactivate.json()) as { code: string }).code).toBe('too_many_goals')
  })

  it('keeps goals of different people apart', async () => {
    const a = await createUser()
    const b = await createUser()
    await createGoal(a)
    expect(await goals(b)).toEqual([])
  })
})

describe('PATCH /api/goals/:id', () => {
  it('changes what a goal says', async () => {
    const user = await createUser()
    const goal = await createGoal(user)
    const res = await as(user).patch(`/api/goals/${goal.id}`, { title: 'Sleep more', why: 'It decides the day.', status: 'done' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ title: 'Sleep more', why: 'It decides the day.', status: 'done' })
  })

  it('answers 404 for an unknown goal', async () => {
    const user = await createUser()
    const res = await as(user).patch(`/api/goals/${crypto.randomUUID()}`, { title: 'Nope' })
    expect(res.status).toBe(404)
  })

  it('refuses a body that cannot be a patch', async () => {
    const user = await createUser()
    const goal = await createGoal(user)
    const res = await as(user).patch(`/api/goals/${goal.id}`, { position: -1 })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('position')
  })
})

describe('DELETE /api/goals/:id', () => {
  it('removes the goal and leaves the habit without one', async () => {
    const user = await createUser()
    const goal = await createGoal(user)
    const habit = await as(user).post('/api/habits', { name: 'Ten minutes of tidying', goalId: goal.id })
    const created = (await habit.json()) as { id: string }

    const deleted = await as(user).delete(`/api/goals/${goal.id}`)
    expect(deleted.status).toBe(204)
    expect(await goals(user)).toEqual([])

    const habits = (await (await as(user).get('/api/habits')).json()) as { id: string; goalId: string | null }[]
    expect(habits.find((row) => row.id === created.id)?.goalId).toBeNull()
  })

  it('answers 404 the second time', async () => {
    const user = await createUser()
    const goal = await createGoal(user)
    await as(user).delete(`/api/goals/${goal.id}`)
    expect((await as(user).delete(`/api/goals/${goal.id}`)).status).toBe(404)
  })
})
