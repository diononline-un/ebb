import { hasAccess, type SubscriptionStatus } from '../../shared/entitlement.ts'
import { withUser, type Tx } from '../db.ts'
import { env } from '../env.ts'
import { paddleClient, type PaddleClient } from './paddle.ts'

// E8-P6: a paying person covers members of their shared spaces with a seat. Paddle owns the list
// (`custom_data.seatUserIds`); here we only check the rules, ask Paddle, and then record the wish.
// The next webhook confirms it in `subscription_seat` (docs/specs/E08-billing.md).

export type SeatAction = 'cover' | 'release'

export type Seat = { userId: string; name: string }

export type SeatOverview = {
  subscriptionId: string | null
  covered: Seat[]
  pending: { userId: string; action: SeatAction }[]
  candidates: Seat[]
  max: number
}

/** A seat rule said no; the route turns it into its HTTP answer. */
export class SeatError extends Error {
  readonly status: 404 | 409 | 422 | 503
  readonly code: string

  constructor(status: 404 | 409 | 422 | 503, code: string) {
    super(code)
    this.name = 'SeatError'
    this.status = status
    this.code = code
  }
}

type SubscriptionRow = {
  id: string
  paddleSubscriptionId: string
  basePriceId: string
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
}

/** The caller's own subscription, active for the caller: anything else names nothing (404). */
async function paidSubscription(tx: Tx, subscriptionId: string): Promise<SubscriptionRow> {
  // RLS also lets a covered person read this row (E8-P6), so ownership needs its own condition.
  const [row] = await tx<SubscriptionRow[]>`
    select id, paddle_subscription_id, base_price_id, status, current_period_end
      from subscription where id = ${subscriptionId} and payer_user_id = app.uid()`
  if (!row) throw new SeatError(404, 'not_your_subscription')

  // A seat manager is a paying person, not a trial and not a guest on someone else's seat.
  const access = hasAccess({
    mode: env.APP_MODE,
    now: new Date(),
    trialEndsAt: null,
    ownSubscription: row,
  })
  if (access.reason !== 'own') throw new SeatError(404, 'not_your_subscription')
  return row
}

/** Covered people of the subscription, payer included. */
async function coveredSeats(tx: Tx, subscriptionId: string): Promise<Seat[]> {
  return tx<Seat[]>`select user_id, name from app.covered_seats(${subscriptionId})`
}

/** Covering needs a shared space; a personal space would let anyone "cover" a stranger. */
async function sharesSharedSpace(tx: Tx, memberId: string): Promise<boolean> {
  const [row] = await tx`
    select 1 from space s
      join space_member m on m.space_id = s.id and m.user_id = ${memberId}
     where s.kind = 'shared'
     limit 1`
  return Boolean(row)
}

/** Members of the caller's shared spaces that are neither covered, pending, nor the caller. */
async function candidatesFor(
  tx: Tx,
  userId: string,
  covered: Seat[],
  pending: { userId: string; action: SeatAction }[],
): Promise<Seat[]> {
  const hidden = new Set([userId, ...covered.map((seat) => seat.userId)])
  for (const request of pending) if (request.action === 'cover') hidden.add(request.userId)

  // RLS already limits `space` to the caller's spaces; only shared ones carry other people.
  const spaces = await tx<{ id: string }[]>`select id from space where kind = 'shared'`
  const seen = new Set<string>()
  const candidates: Seat[] = []
  for (const space of spaces) {
    const members = await tx<Seat[]>`select user_id, name from app.space_members(${space.id})`
    for (const member of members) {
      if (hidden.has(member.userId) || seen.has(member.userId)) continue
      seen.add(member.userId)
      // Someone who already sits on another subscription cannot be covered as well.
      const [seated] = await tx<{ seated: boolean }[]>`select app.is_seated(${member.userId}) as seated`
      if (seated?.seated) continue
      candidates.push({ userId: member.userId, name: member.name })
    }
  }
  return candidates
}

export async function seatOverview(userId: string): Promise<SeatOverview> {
  return withUser(userId, async (tx) => {
    const [own] = await tx<{ id: string }[]>`
      select id from subscription where payer_user_id = app.uid() order by updated_at desc limit 1`
    if (!own) {
      return { subscriptionId: null, covered: [], pending: [], candidates: [], max: env.MAX_EXTRA_SEATS }
    }

    const covered = await coveredSeats(tx, own.id)
    const pending = await tx<{ userId: string; action: SeatAction }[]>`
      select user_id, action from seat_request where subscription_id = ${own.id} order by requested_at`
    const candidates = await candidatesFor(tx, userId, covered, pending)
    return { subscriptionId: own.id, covered, pending, candidates, max: env.MAX_EXTRA_SEATS }
  })
}

/** The caller's subscription id, or null. The route needs it to name the subscription to change. */
export async function ownSubscriptionId(userId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const [own] = await tx<{ id: string }[]>`
      select id from subscription where payer_user_id = app.uid() order by updated_at desc limit 1`
    return own?.id ?? null
  })
}

type SeatPlan = { paddleSubscriptionId: string; basePriceId: string; seatUserIds: string[] }

async function coverPlan(tx: Tx, userId: string, subscriptionId: string, memberId: string): Promise<SeatPlan> {
  const subscription = await paidSubscription(tx, subscriptionId)
  // The payer keeps their own seat for good.
  if (memberId === userId) throw new SeatError(409, 'already_covered')
  if (!(await sharesSharedSpace(tx, memberId))) throw new SeatError(422, 'not_a_co_member')

  const [seated] = await tx<{ seated: boolean }[]>`select app.is_seated(${memberId}) as seated`
  if (seated?.seated) throw new SeatError(409, 'already_covered')

  const others = (await coveredSeats(tx, subscriptionId))
    .map((seat) => seat.userId)
    .filter((id) => id !== userId)
  const seatUserIds = [...others, memberId]
  if (seatUserIds.length > env.MAX_EXTRA_SEATS) throw new SeatError(422, 'seat_limit')

  return {
    paddleSubscriptionId: subscription.paddleSubscriptionId,
    basePriceId: subscription.basePriceId,
    seatUserIds,
  }
}

async function releasePlan(tx: Tx, userId: string, subscriptionId: string, memberId: string): Promise<SeatPlan> {
  const subscription = await paidSubscription(tx, subscriptionId)
  const others = (await coveredSeats(tx, subscriptionId))
    .map((seat) => seat.userId)
    .filter((id) => id !== userId)
  // Releasing is always allowed, even after the person left the shared space: otherwise a seat that
  // nobody can remove would keep costing money. Only a seat that exists can go.
  if (memberId === userId || !others.includes(memberId)) throw new SeatError(409, 'not_covered')

  return {
    paddleSubscriptionId: subscription.paddleSubscriptionId,
    basePriceId: subscription.basePriceId,
    seatUserIds: others.filter((id) => id !== memberId),
  }
}

/** Without a key and a seat price there is nothing to change; the answer says so. */
function billingSetup(): { client: PaddleClient; seatPriceId: string } {
  const client = paddleClient()
  const seatPriceId = env.PADDLE_PRICE_SEAT
  if (!client || !seatPriceId) throw new SeatError(503, 'billing_not_configured')
  return { client, seatPriceId }
}

/** Paddle gets the whole list, so one call always describes the complete seat state. */
async function pushSeats(
  client: PaddleClient,
  userId: string,
  plan: SeatPlan,
  seatPriceId: string,
): Promise<void> {
  await client.updateSubscription(plan.paddleSubscriptionId, {
    items: [
      { price_id: plan.basePriceId, quantity: 1 },
      ...(plan.seatUserIds.length > 0 ? [{ price_id: seatPriceId, quantity: plan.seatUserIds.length }] : []),
    ],
    custom_data: { userId, seatUserIds: plan.seatUserIds },
    proration_billing_mode: 'prorated_immediately',
  })
}

export async function coverMember(
  userId: string,
  subscriptionId: string,
  memberId: string,
): Promise<void> {
  const { client, seatPriceId } = billingSetup()
  const plan = await withUser(userId, (tx) => coverPlan(tx, userId, subscriptionId, memberId))

  // The wish is recorded only after Paddle accepted it: without a 2xx nothing local changes.
  await pushSeats(client, userId, plan, seatPriceId)
  await withUser(userId, (tx) => tx`select app.request_seat(${subscriptionId}, ${memberId}, 'cover')`)
}

export async function releaseMember(
  userId: string,
  subscriptionId: string,
  memberId: string,
): Promise<void> {
  const { client, seatPriceId } = billingSetup()
  const plan = await withUser(userId, (tx) => releasePlan(tx, userId, subscriptionId, memberId))

  await pushSeats(client, userId, plan, seatPriceId)
  await withUser(userId, (tx) => tx`select app.request_seat(${subscriptionId}, ${memberId}, 'release')`)
}
