import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applyEvent } from '../src/server/billing/apply.ts'
import { PaddleError, setPaddleClientForTests, type PaddleClient, type PaddleSubscriptionPatch } from '../src/server/billing/paddle.ts'
import { coverMember } from '../src/server/billing/seats.ts'
import { closeDb, withSystem } from '../src/server/db.ts'
import { env } from '../src/server/env.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

// E8-P6: seats are changed through Paddle only. The fake records every call, so no test reaches the
// network; a price id and a small limit keep the setups readable.
const SEAT_PRICE = 'pri_seat'
const BASE_PRICE = 'pri_base'
const PADDLE_ID = 'sub_01'

Object.defineProperty(env, 'PADDLE_PRICE_SEAT', { value: SEAT_PRICE, configurable: true })
Object.defineProperty(env, 'MAX_EXTRA_SEATS', { value: 1, configurable: true })

type Call = { id: string; body: PaddleSubscriptionPatch }
let calls: Call[] = []

function fakePaddle(): PaddleClient {
  return {
    async updateSubscription(id, body) {
      calls.push({ id, body })
    },
  }
}

beforeEach(async () => {
  await resetDb()
  calls = []
  setPaddleClientForTests(fakePaddle())
})

afterAll(async () => {
  setPaddleClientForTests(null)
  await closeDb()
  await ownerSql.end()
})

/** Paddle's subscription payload; the patch overrides single fields. */
function payload(payer: TestUser, patch: Record<string, unknown> = {}): { data?: unknown } {
  return {
    data: {
      subscription: {
        id: PADDLE_ID,
        customerId: 'ctm_01',
        status: 'active',
        customData: { userId: payer.id },
        currentBillingPeriod: { endsAt: '2026-12-22T10:00:00.000Z' },
        items: [{ priceId: BASE_PRICE }],
        ...patch,
      },
    },
  }
}

/** Writes the subscription the way the webhook job does. */
async function apply(payer: TestUser, patch: Record<string, unknown> = {}): Promise<void> {
  await withSystem((tx) => applyEvent(tx, 'subscription.updated', payload(payer, patch), { seatPriceId: SEAT_PRICE }))
}

async function localSubscriptionId(): Promise<string> {
  const [row] = await withSystem(
    (tx) => tx<{ id: string }[]>`select id from subscription where paddle_subscription_id = ${PADDLE_ID}`,
  )
  if (!row) throw new Error('no subscription seeded')
  return row.id
}

async function coveredUserIds(): Promise<string[]> {
  const rows = await withSystem(
    (tx) => tx<{ userId: string }[]>`select user_id from subscription_seat order by created_at`,
  )
  return rows.map((row) => row.userId)
}

/** The payer opens a shared space and every member joins through a real invitation. */
async function sharedSpaceWith(owner: TestUser, members: TestUser[]): Promise<string> {
  const created = await as(owner).post('/api/spaces', { name: 'seats' })
  if (created.status !== 201) throw new Error(`space failed: ${created.status} ${await created.text()}`)
  const { id } = (await created.json()) as { id: string }

  for (const member of members) {
    const invite = await as(owner).post(`/api/spaces/${id}/invites`, {})
    if (invite.status !== 201) throw new Error(`invite failed: ${invite.status} ${await invite.text()}`)
    const { token } = (await invite.json()) as { token: string }
    const joined = await as(member).post('/api/spaces/join', { token })
    if (joined.status !== 200) throw new Error(`join failed: ${joined.status} ${await joined.text()}`)
  }
  return id
}

async function endTrial(user: TestUser): Promise<void> {
  await withSystem((tx) => tx`update user_access set trial_ends_at = now() - interval '1 day' where user_id = ${user.id}`)
}

describe('GET /api/billing/seats', () => {
  it('names the covered people, the open wishes and who could still be covered', async () => {
    const payer = await createUser()
    const member = await createUser()
    const outsider = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer)

    const view = (await (await as(payer).get('/api/billing/seats')).json()) as {
      subscriptionId: string
      covered: { userId: string }[]
      pending: unknown[]
      candidates: { userId: string }[]
      max: number
    }
    expect(view.subscriptionId).toBe(await localSubscriptionId())
    expect(view.covered.map((seat) => seat.userId)).toEqual([payer.id])
    expect(view.pending).toEqual([])
    expect(view.candidates.map((seat) => seat.userId)).toEqual([member.id])
    expect(view.candidates.map((seat) => seat.userId)).not.toContain(outsider.id)
    expect(view.max).toBe(1)
  })

  it('shows no subscription as null instead of inventing one', async () => {
    const user = await createUser()
    const view = (await (await as(user).get('/api/billing/seats')).json()) as {
      subscriptionId: string | null
      covered: unknown[]
      max: number
    }
    expect(view).toMatchObject({ subscriptionId: null, covered: [], max: 1 })
  })
})

describe('cover', () => {
  it('asks Paddle for one more seat and shows the wish as pending until the webhook confirms', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer)

    expect((await as(payer).post('/api/billing/seats/cover', { memberId: member.id })).status).toBe(204)

    expect(calls).toEqual([
      {
        id: PADDLE_ID,
        body: {
          items: [
            { price_id: BASE_PRICE, quantity: 1 },
            { price_id: SEAT_PRICE, quantity: 1 },
          ],
          custom_data: { userId: payer.id, seatUserIds: [member.id] },
          proration_billing_mode: 'prorated_immediately',
        },
      },
    ])

    const view = (await (await as(payer).get('/api/billing/seats')).json()) as {
      covered: { userId: string }[]
      pending: { userId: string; action: string }[]
      candidates: unknown[]
    }
    expect(view.pending).toEqual([{ userId: member.id, action: 'cover' }])
    expect(view.covered.map((seat) => seat.userId)).toEqual([payer.id])
    expect(view.candidates).toEqual([])
  })

  it('turns the confirmed list into a seat that gives the covered person access', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await endTrial(member)
    await apply(payer)
    await as(payer).post('/api/billing/seats/cover', { memberId: member.id })

    // The webhook Paddle sends for the change carries the whole list.
    await apply(payer, {
      customData: { userId: payer.id, seatUserIds: [member.id] },
      items: [{ priceId: BASE_PRICE }, { priceId: SEAT_PRICE, quantity: 1 }],
    })

    expect(await coveredUserIds()).toEqual([payer.id, member.id])
    const open = await withSystem(
      (tx) => tx<{ count: number }[]>`select count(*)::int as count from seat_request`,
    )
    expect(open[0]?.count).toBe(0)

    const me = (await (await as(member).get('/api/me')).json()) as { access: { access: boolean; reason: string } }
    expect(me.access).toMatchObject({ access: true, reason: 'seat' })
  })

  it('answers 404 for a subscription that is not the caller’s', async () => {
    const payer = await createUser()
    const stranger = await createUser()
    await sharedSpaceWith(payer, [stranger])
    await apply(stranger)
    const strangerSubscription = await localSubscriptionId()

    await expect(coverMember(payer.id, strangerSubscription, stranger.id)).rejects.toMatchObject({
      status: 404,
      code: 'not_your_subscription',
    })
    expect(calls).toEqual([])
  })

  it('keeps a covered person out of the seat list they sit on', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer, {
      customData: { userId: payer.id, seatUserIds: [member.id] },
      items: [{ priceId: BASE_PRICE }, { priceId: SEAT_PRICE, quantity: 1 }],
    })
    const subscriptionId = await localSubscriptionId()

    // The seat holder may read the row (that is how hasAccess answers), but must not change it.
    await expect(coverMember(member.id, subscriptionId, payer.id)).rejects.toMatchObject({
      status: 404,
      code: 'not_your_subscription',
    })
    expect(calls).toEqual([])
  })

  it('answers 404 when the caller has no subscription at all', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])

    expect((await as(payer).post('/api/billing/seats/cover', { memberId: member.id })).status).toBe(404)
    expect(calls).toEqual([])
  })

  it('refuses someone who shares no space with the payer', async () => {
    const payer = await createUser()
    const outsider = await createUser()
    await apply(payer)

    const response = await as(payer).post('/api/billing/seats/cover', { memberId: outsider.id })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ code: 'not_a_co_member' })
    expect(calls).toEqual([])
  })

  it('stops at the seat limit', async () => {
    const payer = await createUser()
    const first = await createUser()
    const second = await createUser()
    await sharedSpaceWith(payer, [first, second])
    await apply(payer, {
      customData: { userId: payer.id, seatUserIds: [first.id] },
      items: [{ priceId: BASE_PRICE }, { priceId: SEAT_PRICE, quantity: 1 }],
    })

    const response = await as(payer).post('/api/billing/seats/cover', { memberId: second.id })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ code: 'seat_limit' })
    expect(calls).toEqual([])
  })

  it('refuses to cover the same person twice', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer, {
      customData: { userId: payer.id, seatUserIds: [member.id] },
      items: [{ priceId: BASE_PRICE }, { priceId: SEAT_PRICE, quantity: 1 }],
    })

    const response = await as(payer).post('/api/billing/seats/cover', { memberId: member.id })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'already_covered' })
    expect(calls).toEqual([])
  })

  it('answers 503 when no Paddle key or seat price is configured', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer)
    setPaddleClientForTests(null)

    const response = await as(payer).post('/api/billing/seats/cover', { memberId: member.id })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'billing_not_configured' })
  })
})

describe('release', () => {
  it('drops the seat item and the confirmed event removes the seat again', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await endTrial(member)
    await apply(payer, {
      customData: { userId: payer.id, seatUserIds: [member.id] },
      items: [{ priceId: BASE_PRICE }, { priceId: SEAT_PRICE, quantity: 1 }],
    })

    expect((await as(payer).post('/api/billing/seats/release', { memberId: member.id })).status).toBe(204)
    expect(calls).toEqual([
      {
        id: PADDLE_ID,
        body: {
          items: [{ price_id: BASE_PRICE, quantity: 1 }],
          custom_data: { userId: payer.id, seatUserIds: [] },
          proration_billing_mode: 'prorated_immediately',
        },
      },
    ])

    const pending = (await (await as(payer).get('/api/billing/seats')).json()) as {
      pending: { userId: string; action: string }[]
    }
    expect(pending.pending).toEqual([{ userId: member.id, action: 'release' }])

    await apply(payer, { customData: { userId: payer.id, seatUserIds: [] } })

    expect(await coveredUserIds()).toEqual([payer.id])
    const me = (await (await as(member).get('/api/me')).json()) as { access: { access: boolean; reason: string } }
    expect(me.access).toMatchObject({ access: false, reason: 'none' })
  })

  it('refuses a person who has no seat', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer)

    const response = await as(payer).post('/api/billing/seats/release', { memberId: member.id })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'not_covered' })
    expect(calls).toEqual([])
  })
})

describe('Paddle failures', () => {
  it('keeps the local state untouched when Paddle answers with an error', async () => {
    const payer = await createUser()
    const member = await createUser()
    await sharedSpaceWith(payer, [member])
    await apply(payer)
    setPaddleClientForTests({
      async updateSubscription() {
        throw new PaddleError(500)
      },
    })

    const response = await as(payer).post('/api/billing/seats/cover', { memberId: member.id })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ code: 'billing_failed' })

    const requests = await withSystem((tx) => tx<{ count: number }[]>`select count(*)::int as count from seat_request`)
    expect(requests[0]?.count).toBe(0)
  })
})
