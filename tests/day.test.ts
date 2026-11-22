import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type Today = { date: string; energy: string | null; ritualDoneAt: string | null }

async function today(user: TestUser): Promise<Today> {
  return (await (await as(user).get('/api/today')).json()) as Today
}

describe('PUT /api/day/energy', () => {
  it('sets and changes the energy of today', async () => {
    const user = await createUser()
    const day = (await today(user)).date

    const low = await as(user).put('/api/day/energy', { energy: 'low' })
    expect(low.status).toBe(200)
    expect(await low.json()).toEqual({ date: day, energy: 'low' })
    expect((await today(user)).energy).toBe('low')

    await as(user).put('/api/day/energy', { energy: 'good' })
    expect((await today(user)).energy).toBe('good')
  })

  it('rejects anything but low and good', async () => {
    const user = await createUser()
    const res = await as(user).put('/api/day/energy', { energy: 'medium' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('energy')
  })

  it('touches only the own day', async () => {
    const a = await createUser()
    const b = await createUser()
    await today(b)
    await as(a).put('/api/day/energy', { energy: 'low' })
    const rows = await withSystem((tx) => tx`select energy from day_entry where user_id = ${b.id}`)
    expect(rows.every((row) => row['energy'] === null)).toBe(true)
  })

  it('answers 401 without a session', async () => {
    const res = await (await import('../src/server/app.ts')).createApp().request('/api/day/energy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ energy: 'low' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/day/ritual-done', () => {
  it('records the first finish and keeps it', async () => {
    const user = await createUser()
    expect((await today(user)).ritualDoneAt).toBeNull()

    const first = (await (await as(user).post('/api/day/ritual-done')).json()) as { ritualDoneAt: string }
    const second = (await (await as(user).post('/api/day/ritual-done')).json()) as { ritualDoneAt: string }

    expect(first.ritualDoneAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(second.ritualDoneAt).toBe(first.ritualDoneAt)
    expect((await today(user)).ritualDoneAt).toBe(first.ritualDoneAt)
  })
})
