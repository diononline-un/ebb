import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { deliverToUser } from '../src/server/push/deliver.ts'
import type { PushPayload } from '../src/server/push/send.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

const ENDPOINT = 'https://push.example.test/anna'

function subscription(endpoint = ENDPOINT) {
  return { endpoint, keys: { p256dh: 'BNcKp1zP-encryption-key', auth: 'auth-secret' } }
}

function store(user: TestUser, endpoint = ENDPOINT) {
  return as(user).post('/api/push/subscriptions', subscription(endpoint))
}

type Stored = { userId: string; endpoint: string; lastSuccessAt: Date | null }

/** RLS hides these rows from the request role of another person, so the system role reads them. */
function stored(): Promise<Stored[]> {
  return withSystem(
    (tx) => tx`select user_id, endpoint, last_success_at from push_subscription order by endpoint, user_id`,
  )
}

const PAYLOAD: PushPayload = { title: 'Morning ritual', body: 'Three tasks, ten minutes', url: '/today' }

describe('GET /api/push/key', () => {
  it('answers null while the deployment has no VAPID keys', async () => {
    const user = await createUser()
    const res = await as(user).get('/api/push/key')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ publicKey: null })
  })
})

describe('POST /api/push/subscriptions', () => {
  it('stores the subscription of the signed-in person', async () => {
    const user = await createUser()

    expect((await store(user)).status).toBe(204)

    expect(await stored()).toEqual([{ userId: user.id, endpoint: ENDPOINT, lastSuccessAt: null }])
  })

  it('moves a known endpoint to the person who subscribes last', async () => {
    const anna = await createUser('anna@example.test')
    const ben = await createUser('ben@example.test')
    await store(anna)

    expect((await store(ben)).status).toBe(204)

    expect(await stored()).toEqual([{ userId: ben.id, endpoint: ENDPOINT, lastSuccessAt: null }])
  })

  it('answers 400 for a body that is not an https subscription', async () => {
    const user = await createUser()

    const insecure = await as(user).post('/api/push/subscriptions', {
      ...subscription('http://push.example.test/anna'),
    })
    expect(insecure.status).toBe(400)
    const insecureBody = (await insecure.json()) as { code: string; fields: Record<string, string[]> }
    expect(insecureBody.code).toBe('invalid_body')
    expect(Object.keys(insecureBody.fields)).toEqual(['endpoint'])

    const noKeys = await as(user).post('/api/push/subscriptions', { endpoint: ENDPOINT })
    expect(noKeys.status).toBe(400)
    expect(Object.keys((await noKeys.json()).fields)).toEqual(['keys'])

    const tooLong = await as(user).post('/api/push/subscriptions', {
      endpoint: `https://push.example.test/${'x'.repeat(2048)}`,
    })
    expect(tooLong.status).toBe(400)

    expect(await stored()).toEqual([])
  })
})

describe('DELETE /api/push/subscriptions', () => {
  it("keeps a stranger's subscription and answers 204 anyway", async () => {
    const anna = await createUser('anna@example.test')
    const ben = await createUser('ben@example.test')
    await store(ben)

    const res = await as(anna).request('DELETE', '/api/push/subscriptions', { endpoint: ENDPOINT })

    expect(res.status).toBe(204)
    expect(await stored()).toEqual([{ userId: ben.id, endpoint: ENDPOINT, lastSuccessAt: null }])
  })

  it('answers 204 when there was nothing to delete', async () => {
    const user = await createUser()

    const res = await as(user).request('DELETE', '/api/push/subscriptions', { endpoint: ENDPOINT })

    expect(res.status).toBe(204)
    expect(await stored()).toEqual([])
  })

  it('removes the own subscription', async () => {
    const user = await createUser()
    await store(user)

    expect((await as(user).request('DELETE', '/api/push/subscriptions', { endpoint: ENDPOINT })).status).toBe(204)

    expect(await stored()).toEqual([])
  })
})

describe('deliverToUser', () => {
  it('drops the subscription the push service reports as gone', async () => {
    const user = await createUser()
    await store(user)

    const result = await withSystem((tx) => deliverToUser(tx, user.id, PAYLOAD, async () => 'gone'))

    expect(result).toEqual({ sent: 0, removed: 1 })
    expect(await stored()).toEqual([])
  })

  it('marks the subscription after a successful send', async () => {
    const user = await createUser()
    await store(user)

    const result = await withSystem((tx) => deliverToUser(tx, user.id, PAYLOAD, async () => 'ok'))

    expect(result).toEqual({ sent: 1, removed: 0 })
    const [row] = await stored()
    expect(row?.lastSuccessAt).toBeInstanceOf(Date)
  })

  it('keeps the subscription when the send fails', async () => {
    const user = await createUser()
    await store(user)

    const result = await withSystem((tx) => deliverToUser(tx, user.id, PAYLOAD, async () => 'error'))

    expect(result).toEqual({ sent: 0, removed: 0 })
    expect(await stored()).toEqual([{ userId: user.id, endpoint: ENDPOINT, lastSuccessAt: null }])
  })

  it('sends only to the subscriptions of that person', async () => {
    const anna = await createUser('anna@example.test')
    const ben = await createUser('ben@example.test')
    await store(anna, 'https://push.example.test/anna')
    await store(ben, 'https://push.example.test/ben')
    const reached: string[] = []

    const result = await withSystem((tx) =>
      deliverToUser(tx, anna.id, PAYLOAD, async (target) => {
        reached.push(target.endpoint)
        return 'ok'
      }),
    )

    expect(result).toEqual({ sent: 1, removed: 0 })
    expect(reached).toEqual(['https://push.example.test/anna'])
  })
})

describe('DELETE /api/account', () => {
  it('carries the push subscriptions with the account', async () => {
    const user = await createUser()
    await store(user)

    const res = await as(user).request('DELETE', '/api/account', { confirm: user.email })

    expect(res.status).toBe(204)
    expect(await stored()).toEqual([])
  })
})
