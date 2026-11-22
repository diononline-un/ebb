import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import type { InviteIssued, Space } from '../src/shared/schemas/spaces.ts'
import type { Task, TodayView } from '../src/shared/schemas/task.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

/** A shared space with `owner` and `member` in it. */
async function sharedWith(owner: TestUser, member: TestUser): Promise<Space> {
  const space = (await (await as(owner).post('/api/spaces', { name: 'Home' })).json()) as Space
  const invite = (await (await as(owner).post(`/api/spaces/${space.id}/invites`, {})).json()) as InviteIssued
  await as(member).post('/api/spaces/join', { token: invite.token })
  return space
}

async function addTask(user: TestUser, body: Record<string, unknown>): Promise<Task> {
  const res = await as(user).post('/api/tasks', body)
  expect(res.status).toBe(201)
  return ((await res.json()) as { task: Task }).task
}

describe('assignee', () => {
  it('lets the owner give a shared task to a member', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })

    const res = await as(owner).patch(`/api/tasks/${task.id}`, { assigneeId: member.id })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { task: Task }).task.assigneeId).toBe(member.id)
  })

  it('refuses someone who is not in the space', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const space = (await (await as(owner).post('/api/spaces', { name: 'Home' })).json()) as Space
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })

    const res = await as(owner).patch(`/api/tasks/${task.id}`, { assigneeId: stranger.id })
    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe('assignee_not_member')
  })

  it('keeps personal tasks with their owner whatever the client sends', async () => {
    const a = await createUser()
    const b = await createUser()
    const task = await addTask(a, { title: 'mine', assigneeId: b.id })
    expect(task.assigneeId).toBe(a.id)
  })
})

describe('claim', () => {
  it('takes an unassigned task and answers 409 once someone else has it', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })

    const first = await as(member).post(`/api/tasks/${task.id}/claim`)
    expect(first.status).toBe(200)
    expect(((await first.json()) as Task).assigneeId).toBe(member.id)

    const again = await as(owner).post(`/api/tasks/${task.id}/claim`)
    expect(again.status).toBe(409)
    expect(((await again.json()) as { code: string }).code).toBe('already_assigned')

    // Claiming your own task is not a conflict.
    expect((await as(member).post(`/api/tasks/${task.id}/claim`)).status).toBe(200)
  })
})

describe('the plan of a shared task', () => {
  it('belongs to the person responsible, not to everyone in the space', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })
    await as(owner).patch(`/api/tasks/${task.id}`, { assigneeId: member.id })

    const blocked = await as(owner).patch(`/api/tasks/${task.id}`, { slot: 'block2', must: true })
    expect(blocked.status).toBe(403)
    expect(((await blocked.json()) as { code: string }).code).toBe('not_your_plan')

    // Renaming is not planning, and the responsible person may move it.
    expect((await as(owner).patch(`/api/tasks/${task.id}`, { title: 'renamed' })).status).toBe(200)
    expect((await as(member).patch(`/api/tasks/${task.id}`, { slot: 'block2' })).status).toBe(200)
  })

  it('stays open while nobody is responsible', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })

    expect((await as(member).patch(`/api/tasks/${task.id}`, { must: true })).status).toBe(200)
  })
})

describe('GET /api/spaces/:id/tasks', () => {
  it('lists what nobody took and, with filter=all, everything open', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const open = await addTask(owner, { title: 'nobody took this', spaceId: space.id })
    const mine = await addTask(owner, { title: 'for the member', spaceId: space.id })
    await as(owner).patch(`/api/tasks/${mine.id}`, { assigneeId: member.id })

    const unassigned = (await (await as(member).get(`/api/spaces/${space.id}/tasks`)).json()) as Task[]
    expect(unassigned.map((task) => task.id)).toEqual([open.id])

    const all = (await (await as(member).get(`/api/spaces/${space.id}/tasks?filter=all`)).json()) as Task[]
    expect(all).toHaveLength(2)
  })

  it('answers 404 for a space of someone else', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const space = (await (await as(owner).post('/api/spaces', { name: 'Home' })).json()) as Space
    expect((await as(stranger).get(`/api/spaces/${space.id}/tasks`)).status).toBe(404)
  })
})

describe('the day of a member', () => {
  it('brings the shared task with the name of its space', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })
    await as(owner).patch(`/api/tasks/${task.id}`, { assigneeId: member.id })

    const today = (await (await as(member).get('/api/today')).json()) as TodayView
    expect(today.slots.inbox.map((row) => row.title)).toContain('shared work')
    expect(today.spaces?.find((row) => row.id === space.id)?.name).toBe('Home')
  })
})
