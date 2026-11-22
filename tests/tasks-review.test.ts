import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays } from '../src/shared/day.ts'
import { closeDb } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

// Rules decided in the review of E2-P4..P11 (Claude): drop positions, leaving today, the inbox view,
// double taps on "to task".

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type TaskJson = { id: string; title: string; [key: string]: unknown }

async function todayOf(user: TestUser): Promise<string> {
  return ((await (await as(user).get('/api/today')).json()) as { date: string }).date
}

async function add(user: TestUser, title: string, body: Record<string, unknown> = {}): Promise<TaskJson> {
  const response = await as(user).post('/api/tasks', { title, ...body })
  expect(response.status).toBe(201)
  return ((await response.json()) as { task: TaskJson }).task
}

async function patch(user: TestUser, id: string, body: Record<string, unknown>) {
  const response = await as(user).patch(`/api/tasks/${id}`, body)
  return { status: response.status, body: (await response.json()) as { task: TaskJson; code?: string } }
}

async function block(user: TestUser, slot: string): Promise<string[]> {
  const view = (await (await as(user).get('/api/today')).json()) as { slots: Record<string, TaskJson[]> }
  return (view.slots[slot] ?? []).map((task) => task.title)
}

describe('dropping a task at a position', () => {
  async function fourInBlock1(user: TestUser) {
    const tasks: TaskJson[] = []
    for (const title of ['a', 'b', 'c', 'd']) tasks.push(await add(user, title, { slot: 'block1' }))
    expect(await block(user, 'block1')).toEqual(['a', 'b', 'c', 'd'])
    return tasks
  }

  it('moving down lands exactly on the target index', async () => {
    const user = await createUser()
    const [a] = await fourInBlock1(user)
    expect((await patch(user, a!.id, { position: 2 })).status).toBe(200)
    expect(await block(user, 'block1')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moving up lands exactly on the target index', async () => {
    const user = await createUser()
    const tasks = await fourInBlock1(user)
    expect((await patch(user, tasks[3]!.id, { position: 1 })).status).toBe(200)
    expect(await block(user, 'block1')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('dropping into another block inserts before the task at that index', async () => {
    const user = await createUser()
    await fourInBlock1(user)
    const x = await add(user, 'x', { slot: 'block2' })
    expect((await patch(user, x.id, { slot: 'block1', position: 1 })).status).toBe(200)
    expect(await block(user, 'block1')).toEqual(['a', 'x', 'b', 'c', 'd'])
    expect(await block(user, 'block2')).toEqual([])
  })
})

describe('leaving today', () => {
  it('drops anchor and must when the task moves to another day', async () => {
    const user = await createUser()
    const day = await todayOf(user)
    const task = await add(user, 'proposal', { slot: 'block1' })
    expect((await patch(user, task.id, { anchor: true, must: true })).status).toBe(200)

    const moved = await patch(user, task.id, { doDate: addDays(day, 1) })

    expect(moved.status).toBe(200)
    expect(moved.body.task).toMatchObject({ doDate: addDays(day, 1), anchor: false, must: false })
  })

  it('drops them as well when the task becomes an errand', async () => {
    const user = await createUser()
    const task = await add(user, 'post the parcel', { slot: 'block1' })
    await patch(user, task.id, { anchor: true })
    const moved = await patch(user, task.id, { slot: 'errands' })
    expect(moved.body.task).toMatchObject({ slot: 'errands', doDate: null, anchor: false })
  })

  it('still refuses an explicit anchor on another day', async () => {
    const user = await createUser()
    const day = await todayOf(user)
    const task = await add(user, 'later', { slot: 'block1' })
    const moved = await patch(user, task.id, { doDate: addDays(day, 2), anchor: true })
    expect(moved.status).toBe(422)
    expect(moved.body.code).toBe('anchor_not_today')
  })
})

describe('inbox view', () => {
  it('shows today and older, not tasks already parked on a later day', async () => {
    const user = await createUser()
    const day = await todayOf(user)
    await add(user, 'unsorted')
    const later = await add(user, 'sorted for tomorrow')
    await as(user).post(`/api/tasks/${later.id}/triage`, { kind: 'later', date: addDays(day, 1) })

    const inbox = (await (await as(user).get('/api/tasks?view=inbox')).json()) as {
      groups: { tasks: TaskJson[] }[]
    }
    const tomorrow = (await (await as(user).get('/api/tasks?view=tomorrow')).json()) as {
      groups: { tasks: TaskJson[] }[]
    }

    expect(inbox.groups.flatMap((group) => group.tasks.map((task) => task.title))).toEqual(['unsorted'])
    expect(tomorrow.groups.flatMap((group) => group.tasks.map((task) => task.title))).toEqual(['sorted for tomorrow'])
  })
})

describe('dump line to task', () => {
  it('creates one task even when two requests race', async () => {
    const user = await createUser()
    const line = (await (
      await as(user).post('/api/dump', { clientId: crypto.randomUUID(), text: 'renew passport' })
    ).json()) as { id: string }

    const [first, second] = await Promise.all([
      as(user).post(`/api/dump/${line.id}/to-task`),
      as(user).post(`/api/dump/${line.id}/to-task`),
    ])
    const ids = [((await first.json()) as TaskJson).id, ((await second.json()) as TaskJson).id]

    expect(ids[0]).toBe(ids[1])
  })
})
