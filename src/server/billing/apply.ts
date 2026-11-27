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

/** The people Paddle says the subscription covers, besides the payer; null when it reports none. */
export function seatUserIdsOf(subscription: PaddleSubscription): string[] | null {
  const custom = subscription.customData
  if (!custom || typeof custom !== 'object') return null
  const list = (custom as Record<string, unknown>)['seatUserIds']
  if (!Array.isArray(list)) return null
  return list.map(text).filter((id): id is string => id !== null)
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

/**
 * E8-P6: Paddle sends one item per price with the number of seats in `quantity`; the extra seats are
 * their sum. Counting items instead undercounts as soon as a subscription has more than one seat.
 */
export function extraSeatsOf(subscription: PaddleSubscription, seatPriceId: string | null): number {
  if (!seatPriceId) return 0
  const items = subscription.items
  if (!Array.isArray(items)) return 0

  let total = 0
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (text(record['priceId']) !== seatPriceId) continue
    const quantity = record['quantity']
    total += typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 0 ? quantity : 1
  }
  return total
}

export type ApplyContext = {
  /** The seat price id from the environment; every other price is the base plan. */
  seatPriceId: string | null
}

export type ApplyResult = { action: 'skipped' | 'stored'; reason?: string }

/**
 * Replaces the seats of one subscription with Paddle's list: the payer always stays, then at most
 * `extraSeats` people from the list that exist, everything else goes. Someone already sitting on
 * another subscription is skipped, never moved (docs/specs/E08-billing.md).
 */
async function syncSeats(
  tx: Tx,
  subscriptionId: string,
  payer: string,
  wanted: string[],
  extraSeats: number,
): Promise<void> {
  const candidates = [...new Set(wanted)].filter((id) => id !== payer)
  const known = candidates.length
    ? new Set(
        (
          await tx.unsafe<{ id: string }[]>('select id from "user" where id = any($1::text[])', [candidates])
        ).map((row) => row.id),
      )
    : new Set<string>()

  const keep: string[] = []
  for (const id of candidates) {
    if (keep.length >= extraSeats) break
    if (known.has(id)) keep.push(id)
  }

  await tx.unsafe(
    `delete from subscription_seat
      where subscription_id = $1 and user_id <> $2 and not (user_id = any($3::text[]))`,
    [subscriptionId, payer, keep],
  )
  await tx`
    insert into subscription_seat (subscription_id, user_id)
    values (${subscriptionId}, ${payer})
    on conflict (user_id) do nothing`
  if (keep.length > 0) {
    await tx.unsafe(
      `insert into subscription_seat (subscription_id, user_id)
       select $1, id from "user" where id = any($2::text[])
       on conflict (user_id) do nothing`,
      [subscriptionId, keep],
    )
  }
}

/**
 * One event, one transaction. A subscription event stores the subscription and, when it carries
 * `custom_data.seatUserIds`, the seats of its shared spaces; a transaction only flips the payer in.
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
  const extraSeats = extraSeatsOf(subscription, seatPrice)
  const periodEnd = periodEndOf(subscription)
  const seatUserIds = seatUserIdsOf(subscription)

  const [stored] = await tx<{ id: string }[]>`
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
          updated_at = now()
    returning id`
  if (!stored) return { action: 'skipped', reason: 'no_subscription' }

  if (seatUserIds) {
    await syncSeats(tx, stored.id, payer, seatUserIds, extraSeats)
    // Paddle confirmed the list, so the wish that led to it is done.
    await tx`delete from seat_request where subscription_id = ${stored.id}`
  } else {
    // Older payloads carry no list: the payer always sits on their own subscription.
    await tx`
      insert into subscription_seat (subscription_id, user_id)
      values (${stored.id}, ${payer})
      on conflict (user_id) do nothing`
  }

  return { action: 'stored' }
}
