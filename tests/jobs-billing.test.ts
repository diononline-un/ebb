import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { env } from '../src/server/env.ts'
import { processBillingEvents } from '../src/server/jobs/billing.ts'
import { createUser, ownerSql, resetDb } from './harness.ts'

// E8-P6: the job needs the seat price id to tell the base plan from the seats.
Object.defineProperty(env, 'PADDLE_PRICE_SEAT', { value: 'pri_seat', configurable: true })

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type Payload = Record<string, unknown>

async function storeEvent(eventId: string, occurredAt: string, payload: Payload, type = 'subscription.updated') {
  await withSystem(
    (tx) => tx`
      insert into billing_event (event_id, type, occurred_at, payload)
      values (${eventId}, ${type}, ${new Date(occurredAt)}, ${JSON.stringify(payload)}::text::jsonb)`,
  )
  return eventId
}

function subscription(payer: string, status = 'active'): Payload {
  return {
    data: {
      subscription: {
        id: 'sub_01',
        customerId: 'ctm_01',
        status,
        customData: { userId: payer },
        currentBillingPeriod: { endsAt: '2026-12-22T10:00:00.000Z' },
        items: [{ priceId: 'pri_base' }],
      },
    },
  }
}

describe('processBillingEvents', () => {
  it('applies stored events in the order they happened and marks them done', async () => {
    const payer = await createUser()
    await storeEvent('evt_new', '2026-11-22T12:00:00.000Z', subscription(payer.id, 'canceled'))
    await storeEvent('evt_old', '2026-11-22T11:00:00.000Z', subscription(payer.id, 'active'))

    const result = await processBillingEvents()
    expect(result).toEqual({ processed: 2, failed: 0 })

    const [row] = await withSystem((tx) => tx<{ status: string }[]>`select status from subscription`)
    expect(row?.status).toBe('canceled')

    const open = await withSystem((tx) => tx<{ count: number }[]>`
      select count(*)::int as count from billing_event where processed_at is null`)
    expect(open[0]?.count).toBe(0)
  })

  it('moves on past an event it cannot read', async () => {
    const payer = await createUser()
    await storeEvent('evt_junk', '2026-11-22T11:00:00.000Z', { data: {} })
    await storeEvent('evt_good', '2026-11-22T12:00:00.000Z', subscription(payer.id))

    // A payload that carries no subscription is skipped and closed, not retried forever.
    expect(await processBillingEvents()).toEqual({ processed: 2, failed: 0 })
    const done = await withSystem((tx) => tx<{ count: number }[]>`
      select count(*)::int as count from billing_event where processed_at is not null`)
    expect(done[0]?.count).toBe(2)
    const [row] = await withSystem((tx) => tx<{ status: string }[]>`select status from subscription`)
    expect(row?.status).toBe('active')
  })

  it('does nothing and says so when the store is empty', async () => {
    expect(await processBillingEvents()).toEqual({ processed: 0, failed: 0 })
  })

  it('counts the quantity of the seat item, not the number of items', async () => {
    const payer = await createUser()
    const stored = subscription(payer.id)
    const subscriptionData = (stored.data as { subscription: Record<string, unknown> }).subscription
    subscriptionData.items = [{ priceId: 'pri_base' }, { priceId: 'pri_seat', quantity: 3 }]
    await storeEvent('evt_seats', '2026-11-22T11:00:00.000Z', stored)

    expect(await processBillingEvents()).toEqual({ processed: 1, failed: 0 })
    const [row] = await withSystem((tx) => tx<{ extraSeats: number }[]>`select extra_seats from subscription`)
    expect(row?.extraSeats).toBe(3)
  })
})
