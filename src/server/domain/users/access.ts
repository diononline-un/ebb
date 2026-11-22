import { hasAccess, type Access, type AccessFacts, type SubscriptionFacts, type SubscriptionStatus } from '../../../shared/entitlement.ts'
import type { Tx } from '../../db.ts'
import { env } from '../../env.ts'

/** What `/api/me` tells the client: may I write right now, and why (or why not). */
export type AccessInfo = Access & {
  trialEndsAt: string | null
  subscriptionStatus: SubscriptionStatus | null
  /** True in selfhost, where there is no billing at all. */
  selfhost: boolean
}

type SubscriptionRow = { status: SubscriptionStatus; currentPeriodEnd: Date | null }

export async function loadAccess(tx: Tx, now: Date): Promise<AccessInfo> {
  const [access] = await tx<{ trialEndsAt: Date | null }[]>`
    select trial_ends_at from user_access where user_id = app.uid()`
  const [own] = await tx<SubscriptionRow[]>`
    select status, current_period_end from subscription
     where payer_user_id = app.uid() order by updated_at desc limit 1`
  const [seat] = await tx<SubscriptionRow[]>`
    select s.status, s.current_period_end
      from subscription_seat seat join subscription s on s.id = seat.subscription_id
     where seat.user_id = app.uid() limit 1`

  const facts: AccessFacts = {
    mode: env.APP_MODE,
    now,
    trialEndsAt: access?.trialEndsAt ?? null,
    ownSubscription: own ?? null,
    seatSubscription: seat ?? null,
  }
  const result = hasAccess(facts)
  return {
    ...result,
    trialEndsAt: access?.trialEndsAt ? access.trialEndsAt.toISOString() : null,
    subscriptionStatus: (own ?? seat)?.status ?? null,
    selfhost: env.APP_MODE === 'selfhost',
  }
}
