import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setPaddleClientForTests, type PaddleClient } from '../src/server/billing/paddle.ts'
import { closeDb, withSystem } from '../src/server/db.ts'
import { env } from '../src/server/env.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

// E8-P5: the billing page reads what it needs from the environment; the customer portal is the one
// route that talks to Paddle, and the fake client keeps every run off the network.

const CUSTOMER_ID = 'ctm_01'
const PORTAL_URL = 'https://sandbox-customer-portal.paddle.com/portal/cpls_01'

type PortalCall = { customerId: string }
let calls: PortalCall[] = []

/** A client with the portal; the seat tests' fake (E8-P6) only changes seats. */
function portalClient(): PaddleClient {
  return {
    async updateSubscription() {},
    async createPortalSession(customerId) {
      calls.push({ customerId })
      return PORTAL_URL
    },
  }
}

const original = {
  APP_MODE: env.APP_MODE,
  PADDLE_CLIENT_TOKEN: env.PADDLE_CLIENT_TOKEN,
  PADDLE_PRICE_FOUNDER: env.PADDLE_PRICE_FOUNDER,
}

/** The environment is the whole configuration of this route, so a test may rewrite it. */
function setEnv(key: keyof typeof original, value: string | undefined): void {
  Object.defineProperty(env, key, { value, configurable: true })
}

/** Writes the subscription the webhook job would have written for a paying person. */
async function seedSubscription(payer: TestUser): Promise<void> {
  await withSystem(
    (tx) => tx`
      insert into subscription (payer_user_id, paddle_subscription_id, paddle_customer_id, status, base_price_id)
      values (${payer.id}, ${`sub_${payer.id}`}, ${CUSTOMER_ID}, 'active', 'pri_base')`,
  )
}

beforeEach(async () => {
  await resetDb()
  calls = []
  setPaddleClientForTests(portalClient())
})

afterEach(() => {
  for (const [key, value] of Object.entries(original)) setEnv(key as keyof typeof original, value)
})

afterAll(async () => {
  setPaddleClientForTests(null)
  await closeDb()
  await ownerSql.end()
})

describe('GET /api/billing-config', () => {
  it('says payments are not set up while the Paddle variables are missing', async () => {
    const user = await createUser()
    const response = await as(user).get('/api/billing-config')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      configured: false,
      environment: null,
      clientToken: null,
      priceId: null,
    })
  })

  it('is configured and in the sandbox once the client token and the active price are set', async () => {
    setEnv('PADDLE_CLIENT_TOKEN', 'test_client_token')
    setEnv('PADDLE_PRICE_FOUNDER', 'pri_founder')
    const user = await createUser()
    const response = await as(user).get('/api/billing-config')

    expect(await response.json()).toMatchObject({
      configured: true,
      environment: 'sandbox',
      clientToken: 'test_client_token',
      priceId: 'pri_founder',
      founder: true,
    })
  })

  it('names nothing in self-host, where there is no billing', async () => {
    const user = await createUser()
    setEnv('APP_MODE', 'selfhost')

    const response = await as(user).get('/api/billing-config')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'not_found' })
  })
})

describe('POST /api/billing-config/portal', () => {
  it('answers 404 without an own subscription', async () => {
    const user = await createUser()
    const response = await as(user).post('/api/billing-config/portal')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'not_your_subscription' })
    expect(calls).toEqual([])
  })

  it('answers 503 without a Paddle key', async () => {
    // No key means no client at all, the same as a deployment without Paddle.
    setPaddleClientForTests(null)
    const user = await createUser()
    await seedSubscription(user)

    const response = await as(user).post('/api/billing-config/portal')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'billing_not_configured' })
  })

  it('returns the portal link of the payer', async () => {
    const user = await createUser()
    await seedSubscription(user)

    const response = await as(user).post('/api/billing-config/portal')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: PORTAL_URL })
    expect(calls).toEqual([{ customerId: CUSTOMER_ID }])
  })

  it('stays closed in self-host', async () => {
    const user = await createUser()
    setEnv('APP_MODE', 'selfhost')

    const response = await as(user).post('/api/billing-config/portal')

    expect(response.status).toBe(404)
  })
})
