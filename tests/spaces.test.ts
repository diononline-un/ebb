import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import type { InviteIssued, Member, Space } from '../src/shared/schemas/spaces.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function createSpace(user: TestUser, name = 'Home'): Promise<Space> {
  const res = await as(user).post('/api/spaces', { name })
  expect(res.status).toBe(201)
  return (await res.json()) as Space
}

async function invite(user: TestUser, spaceId: string): Promise<InviteIssued> {
  const res = await as(user).post(`/api/spaces/${spaceId}/invites`, {})
  expect(res.status).toBe(201)
  return (await res.json()) as InviteIssued
}

describe('POST /api/spaces', () => {
  it('creates a shared space with the creator as owner', async () => {
    const user = await createUser()
    const created = await createSpace(user)
    expect(created).toMatchObject({ name: 'Home', kind: 'shared', role: 'owner', memberCount: 1 })
  })

  it('refuses an empty name', async () => {
    const user = await createUser()
    expect((await as(user).post('/api/spaces', { name: '  ' })).status).toBe(400)
  })
})

describe('GET /api/spaces', () => {
  it('brings the personal space first and the shared ones after it', async () => {
    const user = await createUser()
    await createSpace(user, 'Home')
    const spaces = (await (await as(user).get('/api/spaces')).json()) as Space[]
    expect(spaces[0]?.kind).toBe('personal')
    expect(spaces[1]?.name).toBe('Home')
  })
})

describe('invitations', () => {
  it('lets a second person join exactly once', async () => {
    const owner = await createUser()
    const guest = await createUser()
    const space = await createSpace(owner)
    const issued = await invite(owner, space.id)
    expect(issued.token).toHaveLength(64)

    const joined = await as(guest).post('/api/spaces/join', { token: issued.token })
    expect(joined.status).toBe(200)
    expect(((await joined.json()) as { spaceId: string }).spaceId).toBe(space.id)

    const spaces = (await (await as(guest).get('/api/spaces')).json()) as Space[]
    expect(spaces.some((row) => row.id === space.id && row.role === 'member')).toBe(true)

    // The same token a second time names nothing; the answer does not say why.
    const again = await as(guest).post('/api/spaces/join', { token: issued.token })
    expect(again.status).toBe(404)
    expect(((await again.json()) as { code: string }).code).toBe('invite_invalid')

    const members = (await (await as(owner).get(`/api/spaces/${space.id}/members`)).json()) as Member[]
    expect(members).toHaveLength(2)
  })

  it('answers the same for an unknown token', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/spaces/join', { token: 'a'.repeat(64) })
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('invite_invalid')
  })

  it('lets only the owner invite and revoke', async () => {
    const owner = await createUser()
    const guest = await createUser()
    const space = await createSpace(owner)
    const issued = await invite(owner, space.id)
    await as(guest).post('/api/spaces/join', { token: issued.token })

    const second = (await (await as(owner).post(`/api/spaces/${space.id}/invites`, {})).json()) as InviteIssued
    const byGuest = await as(guest).post(`/api/spaces/${space.id}/invites`, {})
    expect(byGuest.status).toBe(422)
    expect(((await byGuest.json()) as { code: string }).code).toBe('owner_only')

    expect((await as(owner).delete(`/api/spaces/invites/${second.id}`)).status).toBe(204)
    const joined = await as(await createUser()).post('/api/spaces/join', { token: second.token })
    expect(joined.status).toBe(404)
  })
})

describe('members', () => {
  it('lets a member leave and gives the tasks back to nobody', async () => {
    const owner = await createUser()
    const guest = await createUser()
    const space = await createSpace(owner)
    const issued = await invite(owner, space.id)
    await as(guest).post('/api/spaces/join', { token: issued.token })

    const leave = await as(guest).post(`/api/spaces/${space.id}/leave`)
    expect(leave.status).toBe(204)
    const members = (await (await as(owner).get(`/api/spaces/${space.id}/members`)).json()) as Member[]
    expect(members.map((member) => member.userId)).toEqual([owner.id])
  })

  it('never lets the owner walk away and only deletes with the name', async () => {
    const owner = await createUser()
    const space = await createSpace(owner)

    const leave = await as(owner).post(`/api/spaces/${space.id}/leave`)
    expect(leave.status).toBe(422)
    expect(((await leave.json()) as { code: string }).code).toBe('owner_cannot_leave')

    const refused = await as(owner).request('DELETE', `/api/spaces/${space.id}`, { name: 'Wrong' })
    expect(refused.status).toBe(422)
    expect(((await refused.json()) as { code: string }).code).toBe('name_mismatch')

    const deleted = await as(owner).request('DELETE', `/api/spaces/${space.id}`, { name: 'Home' })
    expect(deleted.status).toBe(204)
    const spaces = (await (await as(owner).get('/api/spaces')).json()) as Space[]
    expect(spaces.some((row) => row.id === space.id)).toBe(false)
  })

  it('lets the owner remove a member and rename the space', async () => {
    const owner = await createUser()
    const guest = await createUser()
    const space = await createSpace(owner)
    const issued = await invite(owner, space.id)
    await as(guest).post('/api/spaces/join', { token: issued.token })

    const renamed = await as(owner).patch(`/api/spaces/${space.id}`, { name: 'Flat' })
    expect(renamed.status).toBe(200)
    expect(((await renamed.json()) as Space).name).toBe('Flat')

    expect((await as(owner).delete(`/api/spaces/${space.id}/members/${guest.id}`)).status).toBe(204)
    const spaces = (await (await as(guest).get('/api/spaces')).json()) as Space[]
    expect(spaces.some((row) => row.id === space.id)).toBe(false)
  })
})
