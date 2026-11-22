import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem, withUser } from '../src/server/db.ts'
import { trackEvent } from '../src/server/domain/events/events.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type StoredEvent = { userId: string; name: string; props: Record<string, unknown> }

async function storedEvents(): Promise<StoredEvent[]> {
  return withSystem((tx) => tx<StoredEvent[]>`select user_id, name, props from product_event order by id`)
}

describe('POST /api/events', () => {
  it('stores the event of the signed-in person and answers 204', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/events', { name: 'anchor.set', props: { slot: 'block1', count: 2 } })

    expect(res.status).toBe(204)
    expect(await storedEvents()).toEqual([
      { userId: user.id, name: 'anchor.set', props: { slot: 'block1', count: 2 } },
    ])
  })

  it('stores an event without props', async () => {
    const user = await createUser()
    expect((await as(user).post('/api/events', { name: 'ritual.opened' })).status).toBe(204)
    expect((await storedEvents())[0]?.props).toEqual({})
  })

  it('refuses a name that does not match the pattern', async () => {
    const user = await createUser()
    for (const name of ['Anchor Set', 'Anchor.set', 'a', 'ANCHOR_SET', '9lives']) {
      const res = await as(user).post('/api/events', { name })
      expect(res.status, name).toBe(400)
      expect(((await res.json()) as { fields: Record<string, string[]> }).fields['name']).toBeDefined()
    }
    expect(await storedEvents()).toEqual([])
  })

  it('refuses props that are not a small object of counters', async () => {
    const user = await createUser()
    const tooMany = Object.fromEntries(Array.from({ length: 9 }, (_unused, index) => [`k${index}`, index]))
    expect((await as(user).post('/api/events', { name: 'anchor.set', props: tooMany })).status).toBe(400)
    expect((await as(user).post('/api/events', { name: 'anchor.set', props: { note: 'x'.repeat(41) } })).status).toBe(400)
    expect((await as(user).post('/api/events', { name: 'anchor.set', props: ['list'] })).status).toBe(400)
    expect(await storedEvents()).toEqual([])
  })

  it('keeps the events of other people out of sight', async () => {
    const writer = await createUser()
    const stranger = await createUser()
    await as(writer).post('/api/events', { name: 'anchor.set' })

    // The request role can only read its own rows (RLS policy event_read_own, migration 0003).
    const seenByWriter = await withUser(writer.id, (tx) => tx<{ name: string }[]>`select name from product_event`)
    const seenByStranger = await withUser(stranger.id, (tx) => tx<{ name: string }[]>`select name from product_event`)
    expect(seenByWriter.map((row) => row.name)).toEqual(['anchor.set'])
    expect(seenByStranger).toEqual([])
  })

  it('writes nothing in selfhost mode', async () => {
    const user = await createUser()
    await withUser(user.id, (tx) => trackEvent(tx, { name: 'anchor.set' }, 'selfhost'))
    expect(await storedEvents()).toEqual([])

    // Same transaction, same code path, only the mode differs.
    await withUser(user.id, (tx) => trackEvent(tx, { name: 'anchor.set' }, 'production'))
    expect((await storedEvents()).map((event) => event.userId)).toEqual([user.id])
  })

  it('answers 401 without a session', async () => {
    const anonymous = { id: '', email: '', cookie: '' } as TestUser
    expect((await as(anonymous).post('/api/events', { name: 'anchor.set' })).status).toBe(401)
  })
})
