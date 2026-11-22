import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem, withUser } from '../src/server/db.ts'
import { bootstrapUser } from '../src/server/domain/users/bootstrap.ts'
import { as, createUser, ownerSql, resetDb } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

describe('bootstrapUser', () => {
  it('creates personal space, owner membership, settings and a 7-day trial on sign-up', async () => {
    const user = await createUser()

    // Data checks go through the system role: the owner role is bound by FORCE RLS like everyone else.
    const spaces = await withSystem((tx) => tx`select id, kind, name from space where owner_id = ${user.id}`)
    expect(spaces).toHaveLength(1)
    expect(spaces[0]).toMatchObject({ kind: 'personal', name: '' })

    const members = await withSystem((tx) => tx`select role from space_member where user_id = ${user.id}`)
    expect(members).toEqual([{ role: 'owner' }])

    const [settings] = await withSystem(
      (tx) => tx`select timezone, day_start_minute from user_settings where user_id = ${user.id}`,
    )
    expect(settings).toEqual({ timezone: 'UTC', dayStartMinute: 240 })

    const [access] = await withSystem(
      (tx) => tx<{ days: number }[]>`
        select extract(epoch from trial_ends_at - now()) / 86400 as days from user_access where user_id = ${user.id}`,
    )
    expect(Number(access?.days)).toBeGreaterThan(6.99)
    expect(Number(access?.days)).toBeLessThanOrEqual(7)
  })

  it('is idempotent', async () => {
    const user = await createUser()
    await bootstrapUser(user.id)
    await bootstrapUser(user.id)
    const [row] = await withSystem(
      (tx) => tx<{ spaces: number; members: number }[]>`
        select (select count(*)::int from space where owner_id = ${user.id}) as spaces,
               (select count(*)::int from space_member where user_id = ${user.id}) as members`,
    )
    expect(row).toEqual({ spaces: 1, members: 1 })
  })
})

describe('GET /api/me', () => {
  it('returns user, settings, personal space and trial end', async () => {
    const user = await createUser()
    const res = await as(user).get('/api/me')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body['user']).toMatchObject({ id: user.id, email: user.email })
    expect(body['settings']).toMatchObject({ timezone: 'UTC', locale: 'en' })
    expect(body['settings']).not.toHaveProperty('userId')
    expect(body['personalSpaceId']).toMatch(/^[0-9a-f-]{36}$/)
    expect(body['trialEndsAt']).toBeTruthy()
  })
})

describe('row level security', () => {
  it('a user sees neither the space nor the settings of another user', async () => {
    const a = await createUser()
    const b = await createUser()
    const seen = await withUser(b.id, async (tx) => ({
      spaces: await tx`select id from space where owner_id = ${a.id}`,
      members: await tx`select 1 from space_member where user_id = ${a.id}`,
      settings: await tx`select 1 from user_settings where user_id = ${a.id}`,
      access: await tx`select 1 from user_access where user_id = ${a.id}`,
    }))
    expect(seen).toEqual({ spaces: [], members: [], settings: [], access: [] })
  })

  it('the request role cannot change its own trial', async () => {
    const user = await createUser()
    await expect(
      withUser(user.id, (tx) => tx`update user_access set trial_ends_at = now() + interval '1 year'`),
    ).rejects.toThrow(/permission denied/)
  })

  it('the request role cannot create spaces or memberships directly', async () => {
    const user = await createUser()
    await expect(
      withUser(user.id, (tx) => tx`insert into space (kind, owner_id) values ('shared', ${user.id})`),
    ).rejects.toThrow(/permission denied/)
    const [space] = await withSystem((tx) => tx<{ id: string }[]>`select id from space where owner_id = ${user.id}`)
    await expect(
      withUser(user.id, (tx) => tx`insert into space_member (space_id, user_id, role) values (${space!.id}, 'x', 'member')`),
    ).rejects.toThrow(/permission denied/)
  })

  it('renaming is limited to the name column, and only the owner may do it', async () => {
    const user = await createUser()
    await expect(withUser(user.id, (tx) => tx`update space set kind = 'shared'`)).rejects.toThrow(/permission denied/)
    const renamed = await withUser(user.id, (tx) => tx`update space set name = 'Mine' returning id`)
    expect(renamed).toHaveLength(1)
  })

  it('lets only the creator read invitations (E7)', async () => {
    const a = await createUser()
    const b = await createUser()
    const space = (await (await as(a).post('/api/spaces', { name: 'Home' })).json()) as { id: string }
    expect((await as(a).post(`/api/spaces/${space.id}/invites`, {})).status).toBe(201)

    // The creator reads her own invite; everyone else sees nothing at all.
    expect(await withUser(a.id, (tx) => tx`select id from space_invite`)).toHaveLength(1)
    expect(await withUser(b.id, (tx) => tx`select id from space_invite`)).toHaveLength(0)
  })
})
