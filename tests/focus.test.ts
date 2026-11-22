import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type Session = { id: string; taskId: string | null; slot: string | null; plannedMinutes: number; startedAt: string; endedAt: string | null }

async function start(user: TestUser, body: Record<string, unknown>) {
  const res = await as(user).post('/api/focus', body)
  return { status: res.status, body: (await res.json()) as Session & { code?: string } }
}

async function current(user: TestUser): Promise<Session | null> {
  return (await (await as(user).get('/api/focus/current')).json()) as Session | null
}

describe('focus sessions', () => {
  it('starts a session for a block and returns it as current', async () => {
    const user = await createUser()
    const started = await start(user, { plannedMinutes: 25, slot: 'block1' })

    expect(started.status).toBe(201)
    expect(started.body).toMatchObject({ slot: 'block1', taskId: null, plannedMinutes: 25, endedAt: null })
    expect((await current(user))?.id).toBe(started.body.id)
  })

  it('ends the running session when a new one starts', async () => {
    const user = await createUser()
    const first = await start(user, { plannedMinutes: 50 })
    const second = await start(user, { plannedMinutes: 10 })

    const [old] = await withSystem((tx) => tx`select ended_at from focus_session where id = ${first.body.id}`)
    expect(old?.['endedAt']).toBeInstanceOf(Date)
    expect((await current(user))?.id).toBe(second.body.id)
  })

  it('stops a session once and answers the same session on a second stop', async () => {
    const user = await createUser()
    const started = await start(user, { plannedMinutes: 25 })

    const stop1 = (await (await as(user).post(`/api/focus/${started.body.id}/stop`)).json()) as Session
    const stop2 = (await (await as(user).post(`/api/focus/${started.body.id}/stop`)).json()) as Session

    expect(stop1.endedAt).not.toBeNull()
    expect(stop2.endedAt).toBe(stop1.endedAt)
    expect(await current(user)).toBeNull()
  })

  it('links a task of the user and refuses tasks it cannot see', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const task = ((await (await as(owner).post('/api/tasks', { title: 'write the report' })).json()) as {
      task: { id: string }
    }).task

    expect((await start(owner, { plannedMinutes: 10, taskId: task.id })).body.taskId).toBe(task.id)

    const foreign = await start(stranger, { plannedMinutes: 10, taskId: task.id })
    expect(foreign.status).toBe(422)
    expect(foreign.body.code).toBe('unknown_task')
  })

  it('validates the length', async () => {
    const user = await createUser()
    expect((await start(user, { plannedMinutes: 3 })).status).toBe(400)
    expect((await start(user, { plannedMinutes: 181 })).status).toBe(400)
  })

  it('keeps sessions private', async () => {
    const a = await createUser()
    const b = await createUser()
    await start(a, { plannedMinutes: 25 })
    expect(await current(b)).toBeNull()
  })
})
