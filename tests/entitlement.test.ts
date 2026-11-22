import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app.ts'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

/** Lets the trial of that person run out (the system role, FORCE RLS binds the owner too). */
async function endTrial(user: TestUser): Promise<void> {
  await withSystem((tx) => tx`update user_access set trial_ends_at = now() - interval '1 day' where user_id = ${user.id}`)
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const EXEMPT = [/^\/api\/auth\//, /^\/api\/billing\//, /^\/api\/export\b/, /^\/api\/settings\b/, /^\/api\/account\b/]

describe('writing without access', () => {
  it('answers 402 on every writing route that is not exempt', async () => {
    const user = await createUser()
    await endTrial(user)

    const writable = createApp()
      .routes.filter((route) => route.method !== 'ALL' && !SAFE.has(route.method))
      .map((route) => route.path)
      .filter((path) => path.startsWith('/api/'))
      .filter((path) => !EXEMPT.some((pattern) => pattern.test(path)))
      .map((path) => path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000'))

    expect(writable.length).toBeGreaterThan(10)
    for (const path of new Set(writable)) {
      const res = await as(user).post(path, {})
      expect(res.status, `${path} should answer 402`).toBe(402)
    }
  })

  it('lets reading, export and settings through', async () => {
    const user = await createUser()
    await endTrial(user)

    expect((await as(user).get('/api/today')).status).toBe(200)
    expect((await as(user).get('/api/export')).status).toBe(200)
    expect((await as(user).patch('/api/settings', { locale: 'en' })).status).toBe(200)
    expect((await as(user).get('/api/me')).status).toBe(200)
  })

  it('tells the client why it is read-only', async () => {
    const user = await createUser()
    await endTrial(user)
    const me = (await (await as(user).get('/api/me')).json()) as {
      access: { access: boolean; reason: string; trialEndsAt: string | null; selfhost: boolean }
    }
    expect(me.access.access).toBe(false)
    expect(me.access.reason).toBe('none')
    expect(me.access.selfhost).toBe(false)
    expect(me.access.trialEndsAt).toContain('T')
  })

  it('keeps writing while the trial runs', async () => {
    const user = await createUser()
    expect((await as(user).post('/api/tasks', { title: 'still allowed' })).status).toBe(201)
    const me = (await (await as(user).get('/api/me')).json()) as { access: { access: boolean; reason: string } }
    expect(me.access).toMatchObject({ access: true, reason: 'trial' })
  })
})
