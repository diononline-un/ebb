import type { Tx } from '../db.ts'

// E8-P3: what an event does to `subscription` and `subscription_seat`. Paddle's payloads carry the
// subscription id, the customer, the status, the items and `custom_data.userId` (docs/02-prd.md §9).

export type PaddleSubscription = {
  id?: unknown
  customerId?: unknown
  status?: unknown
  items?: unknown
  customData?: unknown
  currentBillingPeriod?: unknown
}

const STATUSES = new Set(['active', 'trialing', 'past_due', 'canceled', 'paused'])

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** The person an event belongs to: Paddle sends it back in `custom_data.userId`. */
export function payerOf(subscription: PaddleSubscription): string | null {
  const custom = subscription.customData
  if (!custom || typeof custom !== 'object') return null
  return text((custom as Record<string, unknown>)['userId'])
}

/** The period end, as Paddle sends it inside the billing period object. */
export function periodEndOf(subscription: PaddleSubscription): Date | null {
  const period = subscription.currentBillingPeriod
  if (!period || typeof period !== 'object') return null
  const endsAt = text((period as Record<string, unknown>)['endsAt'])
  if (!endsAt) return null
  const date = new Date(endsAt)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Price ids of the items, so the base plan and the seats can be told apart. */
export function priceIdsOf(subscription: PaddleSubscription): string[] {
  const items = subscription.items
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (item && typeof item === 'object' ? text((item as Record<string, unknown>)['priceId']) : null))
    .filter((value): value is string => value !== null)
}

export type ApplyContext = {
  /** The seat price id from the environment; every other price is the base plan. */
  seatPriceId: string | null
}

export type ApplyResult = { action: 'skipped' | 'stored'; reason?: string }

/**
 * One event, one transaction. A subscription event stores the subscription and, when it carries the
 * seat price, the seats of its shared spaces; a transaction only flips the payer onto the row.
 */
export async function applyEvent(
  tx: Tx,
  type: string,
  payload: { data?: unknown },
  context: ApplyContext,
): Promise<ApplyResult> {
  const data = payload.data as { subscription?: PaddleSubscription } | undefined
  const subscription = data?.subscription
  if (!subscription || !text(subscription.id)) return { action: 'skipped', reason: 'no_subscription' }

  const subscriptionId = text(subscription.id) as string
  const customerId = text(subscription.customerId)
  const status = text(subscription.status)
  if (!customerId || !status || !STATUSES.has(status)) return { action: 'skipped', reason: 'incomplete' }

  const payer = payerOf(subscription)
  if (!payer) return { action: 'skipped', reason: 'no_payer' }

  const prices = priceIdsOf(subscription)
  const seatPrice = context.seatPriceId
  const basePriceId = prices.find((price) => price !== seatPrice) ?? prices[0] ?? ''
  const extraSeats = seatPrice ? prices.filter((price) => price === seatPrice).length : 0
  const periodEnd = periodEndOf(subscription)

  await tx`
    insert into subscription (payer_user_id, paddle_subscription_id, paddle_customer_id, status,
                              base_price_id, extra_seats, current_period_end)
    values (${payer}, ${subscriptionId}, ${customerId}, ${status}, ${basePriceId}, ${extraSeats}, ${periodEnd})
    on conflict (paddle_subscription_id) do update
      set payer_user_id = excluded.payer_user_id,
          paddle_customer_id = excluded.paddle_customer_id,
          status = excluded.status,
          base_price_id = excluded.base_price_id,
          extra_seats = excluded.extra_seats,
          current_period_end = excluded.current_period_end,
          updated_at = now()`

  // The payer always sits on their own subscription.
  await tx`
    insert into subscription_seat (subscription_id, user_id)
    select id, payer_user_id from subscription where paddle_subscription_id = ${subscriptionId}
    on conflict (user_id) do nothing`

  return { action: 'stored' }
}
