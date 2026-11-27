import { hasAccess, type SubscriptionStatus } from '../../shared/entitlement.ts'
import { withUser, type Tx } from '../db.ts'
import { env } from '../env.ts'
import { paddleClient, type PaddleClient } from './paddle.ts'

// E8-P6: a paying person covers members of their shared spaces with a seat. Paddle owns the list
// (`custom_data.seatUserIds`); here we only check the rules, ask Paddle, and then record the wish.
// The next webhook confirms it in `subscription_seat` (docs/specs/E08-billing.md).

export type SeatAction = 'cover' | 'release'

export type Seat = { userId: string; name: string }

/** A wish Paddle has not confirmed yet. */
export type PendingRequest = { userId: string; action: SeatAction }

export type SeatOverview = {
  subscriptionId: string | null
  covered: Seat[]
  pending: PendingRequest[]
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

/** The open wishes of the subscription, oldest first: their order survives into Paddle's list. */
async function openRequests(tx: Tx, subscriptionId: string): Promise<PendingRequest[]> {
  return tx<PendingRequest[]>`
    select user_id, action from seat_request where subscription_id = ${subscriptionId}
     order by requested_at`
}

/** Confirmed seats without the payer, and the wishes that Paddle has not confirmed yet. */
async function seatState(
  tx: Tx,
  subscriptionId: string,
  payerId: string,
): Promise<{ confirmed: string[]; open: PendingRequest[] }> {
  const covered = await coveredSeats(tx, subscriptionId)
  return {
    confirmed: covered.map((seat) => seat.userId).filter((id) => id !== payerId),
    open: await openRequests(tx, subscriptionId),
  }
}

/**
 * The seat list Paddle holds after the next call: confirmed seats without the payer, plus open cover
 * wishes, minus open release wishes, and then the new action. A wish that is still waiting for its
 * webhook must not fall out of the list, or a second cover would drop the first one.
 */
function nextSeatUserIds(
  state: { confirmed: string[]; open: PendingRequest[] },
  memberId: string,
  action: SeatAction,
): string[] {
  const list = new Set(state.confirmed)
  for (const request of state.open) {
    if (request.action === 'cover') list.add(request.userId)
    else list.delete(request.userId)
  }
  if (action === 'cover') list.add(memberId)
  else list.delete(memberId)
  return [...list]
}

/** Someone who already sits on another subscription cannot be covered as well. */
async function isSeated(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx<{ userId: string }[]>`
    select seated_among as user_id from app.seated_among(${[userId]})`
  return rows.length > 0
}

/** Members of the caller's shared spaces that are neither covered, pending, nor the caller. */
async function candidatesFor(
  tx: Tx,
  userId: string,
  covered: Seat[],
  pending: PendingRequest[],
): Promise<Seat[]> {
  const hidden = new Set([userId, ...covered.map((seat) => seat.userId)])
  for (const request of pending) if (request.action === 'cover') hidden.add(request.userId)

  // One query for everyone the caller shares a shared space with, one for those who already sit:
  // no query per space or per person.
  const members = (await tx<Seat[]>`select user_id, name from app.shared_members()`).filter(
    (member) => !hidden.has(member.userId),
  )
  if (members.length === 0) return []
  const seated = new Set(
    (
      await tx<{ userId: string }[]>`
        select seated_among as user_id from app.seated_among(${members.map((member) => member.userId)})`
    ).map((row) => row.userId),
  )
  return members.filter((member) => !seated.has(member.userId))
}

export async function seatOverview(userId: string): Promise<SeatOverview> {
  return withUser(userId, async (tx) => {
    const [own] = await tx<{ id: string }[]>`
      select id from subscription where payer_user_id = app.uid() order by updated_at desc limit 1`
    if (!own) {
      return { subscriptionId: null, covered: [], pending: [], candidates: [], max: env.MAX_EXTRA_SEATS }
    }

    const covered = await coveredSeats(tx, own.id)
    const pending = await openRequests(tx, own.id)
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
  const state = await seatState(tx, subscriptionId, userId)
  // The payer keeps their own seat for good; a confirmed seat or an open cover wish already holds one.
  if (
    memberId === userId ||
    state.confirmed.includes(memberId) ||
    state.open.some((request) => request.userId === memberId && request.action === 'cover')
  ) {
    throw new SeatError(409, 'already_covered')
  }
  if (!(await sharesSharedSpace(tx, memberId))) throw new SeatError(422, 'not_a_co_member')
  if (await isSeated(tx, memberId)) throw new SeatError(409, 'already_covered')

  const seatUserIds = nextSeatUserIds(state, memberId, 'cover')
  if (seatUserIds.length > env.MAX_EXTRA_SEATS) throw new SeatError(422, 'seat_limit')

  return {
    paddleSubscriptionId: subscription.paddleSubscriptionId,
    basePriceId: subscription.basePriceId,
    seatUserIds,
  }
}

async function releasePlan(tx: Tx, userId: string, subscriptionId: string, memberId: string): Promise<SeatPlan> {
  const subscription = await paidSubscription(tx, subscriptionId)
  const state = await seatState(tx, subscriptionId, userId)
  // Releasing is always allowed, even after the person left the shared space: otherwise a seat that
  // nobody can remove would keep costing money. Only a seat or an open cover wish can go, and a wish
  // that is already being released cannot go twice.
  const open = state.open.find((request) => request.userId === memberId)
  const releasable = (state.confirmed.includes(memberId) || open?.action === 'cover') && open?.action !== 'release'
  if (memberId === userId || !releasable) throw new SeatError(409, 'not_covered')

  return {
    paddleSubscriptionId: subscription.paddleSubscriptionId,
    basePriceId: subscription.basePriceId,
    seatUserIds: nextSeatUserIds(state, memberId, 'release'),
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
