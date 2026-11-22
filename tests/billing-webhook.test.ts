import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applyEvent } from '../src/server/billing/apply.ts'
import { signatureOf } from '../src/server/billing/signature.ts'
import { createApp } from '../src/server/app.ts'
import { closeDb, withSystem } from '../src/server/db.ts'
import { env } from '../src/server/env.ts'
import { createUser, ownerSql, resetDb } from './harness.ts'

// A secret for the test run: the route reads it from env, which env.ts has already parsed.
const SECRET = 'paddle_test_secret_0000000000000000'
Object.defineProperty(env, 'PADDLE_WEBHOOK_SECRET', { value: SECRET, configurable: true })
Object.defineProperty(env, 'PADDLE_PRICE_SEAT', { value: 'pri_seat', configurable: true })

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

const app = createApp()

/** An event as Paddle sends it (fields from the documented subscription payload). */
function subscriptionEvent(payerId: string, patch: Record<string, unknown> = {}) {
  const occurredAt = new Date().toISOString()
  return {
    event_id: `evt_${crypto.randomUUID()}`,
    event_type: 'subscription.updated',
    occurred_at: occurredAt,
    data: {
      subscription: {
        id: 'sub_01',
        customerId: 'ctm_01',
        status: 'active',
        customData: { userId: payerId },
        currentBillingPeriod: { startsAt: occurredAt, endsAt: '2026-12-22T10:00:00.000Z' },
        items: [{ priceId: 'pri_base' }, { priceId: 'pri_seat' }],
        ...patch,
      },
    },
  }
}

function post(body: string, signature: string | null, stamp = Math.floor(Date.now() / 1000)) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  headers['paddle-signature'] = signature ?? `ts=${stamp};h1=${signatureOf(SECRET, String(stamp), body)}`
  return app.request('/api/billing/webhook', { method: 'POST', headers, body })
}

describe('POST /api/billing/webhook', () => {
  it('stores a signed event once, even when Paddle delivers it twice', async () => {
    const user = await createUser()
    const body = JSON.stringify(subscriptionEvent(user.id))

    expect((await post(body, null)).status).toBe(200)
    expect((await post(body, null)).status).toBe(200)

    const events = await withSystem((tx) => tx<{ eventId: string }[]>`select event_id from billing_event`)
    expect(events).toHaveLength(1)
  })

  it('refuses a wrong signature and an old one', async () => {
    const user = await createUser()
    const body = JSON.stringify(subscriptionEvent(user.id))
    const stamp = Math.floor(Date.now() / 1000)

    expect((await post(body, `ts=${stamp};h1=${'a'.repeat(64)}`)).status).toBe(401)
    expect((await post(body, null, stamp - 6 * 60)).status).toBe(401)
    expect((await post(body, 'nonsense')).status).toBe(401)
    expect((await post(body, `h1=${'a'.repeat(64)}`)).status).toBe(401)
  })

  it('refuses a body without an event id and one above a megabyte', async () => {
    const user = await createUser()
    const broken = JSON.stringify({ event_type: 'subscription.updated', data: {} })
    expect((await post(broken, null)).status).toBe(400)

    const big = JSON.stringify(subscriptionEvent(user.id, { padding: 'x'.repeat(1024 * 1024) }))
    expect((await post(big, null)).status).toBe(413)
  })
})

describe('applyEvent', () => {
  it('stores the subscription, the period and the seats of the payer', async () => {
    const payer = await createUser()
    const event = subscriptionEvent(payer.id)

    const result = await withSystem((tx) =>
      applyEvent(tx, event.event_type, event, { seatPriceId: 'pri_seat' }),
    )
    expect(result.action).toBe('stored')

    const rows = await withSystem(
      (tx) => tx<{ status: string; basePriceId: string; extraSeats: number; currentPeriodEnd: Date }[]>`
        select status, base_price_id, extra_seats, current_period_end from subscription`,
    )
    expect(rows[0]).toMatchObject({ status: 'active', basePriceId: 'pri_base', extraSeats: 1 })
    expect(rows[0]?.currentPeriodEnd).toBeInstanceOf(Date)

    const seats = await withSystem((tx) => tx<{ userId: string }[]>`select user_id from subscription_seat`)
    expect(seats.map((seat) => seat.userId)).toEqual([payer.id])
  })

  it('keeps one row per subscription across updates and skips what it cannot read', async () => {
    const payer = await createUser()
    const first = subscriptionEvent(payer.id)
    await withSystem((tx) => applyEvent(tx, first.event_type, first, { seatPriceId: 'pri_seat' }))

    const canceled = subscriptionEvent(payer.id, { status: 'canceled' })
    await withSystem((tx) => applyEvent(tx, canceled.event_type, canceled, { seatPriceId: 'pri_seat' }))

    const rows = await withSystem((tx) => tx<{ status: string; count: number }[]>`
      select status, count(*)::int as count from subscription group by status`)
    expect(rows).toEqual([{ status: 'canceled', count: 1 }])

    const noPayer = subscriptionEvent('', { customData: {} })
    expect(
      (await withSystem((tx) => applyEvent(tx, noPayer.event_type, noPayer, { seatPriceId: null }))).action,
    ).toBe('skipped')
  })
})
