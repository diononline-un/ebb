import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import type { InviteIssued, Member, Space } from '../src/shared/schemas/spaces.ts'
import type { Task } from '../src/shared/schemas/task.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

// E7-P6: every way someone could reach into a space they are not (or not enough) part of. Each attempt
// must fail, and it must fail without telling the attacker whether the thing exists.

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function sharedWith(owner: TestUser, ...members: TestUser[]): Promise<Space> {
  const space = (await (await as(owner).post('/api/spaces', { name: 'Home' })).json()) as Space
  for (const member of members) {
    const invite = (await (await as(owner).post(`/api/spaces/${space.id}/invites`, {})).json()) as InviteIssued
    await as(member).post('/api/spaces/join', { token: invite.token })
  }
  return space
}

async function addTask(user: TestUser, body: Record<string, unknown>): Promise<Task> {
  const res = await as(user).post('/api/tasks', body)
  expect(res.status).toBe(201)
  return ((await res.json()) as { task: Task }).task
}

describe('a stranger', () => {
  it('sees nothing of the space and cannot touch its tasks', async () => {
    const owner = await createUser()
    const member = await createUser()
    const stranger = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })

    expect(((await (await as(stranger).get('/api/spaces')).json()) as Space[]).some((row) => row.id === space.id)).toBe(false)
    expect((await as(stranger).get(`/api/spaces/${space.id}/tasks`)).status).toBe(404)
    expect((await as(stranger).get(`/api/spaces/${space.id}/members`)).status).toBe(404)
    expect((await as(stranger).patch(`/api/tasks/${task.id}`, { title: 'taken' })).status).toBe(404)
    expect((await as(stranger).delete(`/api/tasks/${task.id}`)).status).toBe(404)
    expect((await as(stranger).post(`/api/tasks/${task.id}/claim`)).status).toBe(404)
    expect((await as(stranger).post(`/api/tasks/${task.id}/triage`, { kind: 'errand' })).status).toBe(404)
  })

  it('cannot steal an invitation token that was already used', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await (await as(owner).post('/api/spaces', { name: 'Home' })).json() as Space
    const invite = (await (await as(owner).post(`/api/spaces/${space.id}/invites`, {})).json()) as InviteIssued
    await as(member).post('/api/spaces/join', { token: invite.token })

    const third = await createUser()
    const replay = await as(third).post('/api/spaces/join', { token: invite.token })
    expect(replay.status).toBe(404)
    expect(((await replay.json()) as { code: string }).code).toBe('invite_invalid')
  })
})

describe('a member without the owner role', () => {
  it('cannot invite, remove, rename or delete', async () => {
    const owner = await createUser()
    const member = await createUser()
    const other = await createUser()
    const space = await sharedWith(owner, member, other)

    const invite = await as(member).post(`/api/spaces/${space.id}/invites`, {})
    expect(invite.status).toBe(422)
    expect(((await invite.json()) as { code: string }).code).toBe('owner_only')

    const remove = await as(member).delete(`/api/spaces/${space.id}/members/${other.id}`)
    expect(remove.status).toBe(422)
    expect(((await remove.json()) as { code: string }).code).toBe('owner_only')

    expect((await as(member).patch(`/api/spaces/${space.id}`, { name: 'Mine now' })).status).toBe(422)
    expect((await as(member).request('DELETE', `/api/spaces/${space.id}`, { name: 'Home' })).status).toBe(422)
  })

  it('cannot take a task another member already has', async () => {
    const owner = await createUser()
    const member = await createUser()
    const other = await createUser()
    const space = await sharedWith(owner, member, other)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })
    await as(owner).patch(`/api/tasks/${task.id}`, { assigneeId: other.id })

    const steal = await as(member).post(`/api/tasks/${task.id}/claim`)
    expect(steal.status).toBe(409)

    const plan = await as(member).patch(`/api/tasks/${task.id}`, { slot: 'block3' })
    expect(plan.status).toBe(403)
    expect(((await plan.json()) as { code: string }).code).toBe('not_your_plan')
  })

  it('cannot delete the task of another member', async () => {
    const owner = await createUser()
    const member = await createUser()
    const other = await createUser()
    const space = await sharedWith(owner, member, other)
    const task = await addTask(other, { title: 'theirs', spaceId: space.id })

    // Deleting is for the creator or the space owner; anyone else cannot even see it as theirs.
    expect((await as(member).delete(`/api/tasks/${task.id}`)).status).toBe(404)
  })
})

describe('the owner', () => {
  it('cannot walk away and cannot delete a personal space', async () => {
    const owner = await createUser()
    const space = (await (await as(owner).post('/api/spaces', { name: 'Home' })).json()) as Space
    const personal = ((await (await as(owner).get('/api/spaces')).json()) as Space[]).find((row) => row.kind === 'personal')

    expect((await as(owner).post(`/api/spaces/${space.id}/leave`)).status).toBe(422)
    expect((await as(owner).post(`/api/spaces/${personal?.id}/leave`)).status).toBe(422)
    expect((await as(owner).request('DELETE', `/api/spaces/${personal?.id}`, { name: personal?.name })).status).toBe(422)
  })

  it('can never remove itself as the last owner', async () => {
    const owner = await createUser()
    const space = (await (await as(owner).post('/api/spaces', { name: 'Home' })).json()) as Space
    const res = await as(owner).delete(`/api/spaces/${space.id}/members/${owner.id}`)
    expect(res.status).toBe(422)
    const members = (await (await as(owner).get(`/api/spaces/${space.id}/members`)).json()) as Member[]
    expect(members).toHaveLength(1)
  })
})

describe('leaving', () => {
  it('takes the person out and leaves their tasks unassigned', async () => {
    const owner = await createUser()
    const member = await createUser()
    const space = await sharedWith(owner, member)
    const task = await addTask(owner, { title: 'shared work', spaceId: space.id })
    const assigned = await as(owner).patch(`/api/tasks/${task.id}`, { assigneeId: member.id })
    expect(((await assigned.json()) as { task: Task }).task.assigneeId).toBe(member.id)

    expect((await as(member).post(`/api/spaces/${space.id}/leave`)).status).toBe(204)
    const detail = (await (await as(owner).get(`/api/tasks/${task.id}`)).json()) as { task: Task }
    expect(detail.task.assigneeId).toBeNull()
    // A left member cannot claim anything in that space any more.
    expect((await as(member).post(`/api/tasks/${task.id}/claim`)).status).toBe(404)
  })
})
