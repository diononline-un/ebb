// Whether a person may write right now (E8-P1). Pure: the caller hands in the facts, so the same
// answer serves the middleware, the tests and the read-only banner.

export type AppMode = 'development' | 'production' | 'selfhost'

/** The statuses Paddle reports for a subscription; `past_due` keeps access during dunning. */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'

export type SubscriptionFacts = {
  status: SubscriptionStatus
  /** End of the paid period; after it a canceled or past_due subscription no longer counts. */
  currentPeriodEnd: Date | null
}

export type AccessFacts = {
  mode: AppMode
  now: Date
  /** End of the trial from user_access; null when the person never had a trial (selfhost, card trial). */
  trialEndsAt: Date | null
  /** The person's own subscription, or null. */
  ownSubscription?: SubscriptionFacts | null
  /** The subscription that covers this person as a seat in a shared space, or null. */
  seatSubscription?: SubscriptionFacts | null
}

export type AccessReason = 'selfhost' | 'trial' | 'own' | 'seat' | 'none'

export type Access = { access: boolean; reason: AccessReason }

/** A subscription that still carries the person: running, or owed but not yet ended. */
function carries(subscription: SubscriptionFacts | null | undefined, now: Date): boolean {
  if (!subscription) return false
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return true
    case 'past_due':
    case 'canceled':
      // Zugriff bis Periodenende: the period end is the last moment that is paid for.
      return subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd.getTime() > now.getTime()
    case 'paused':
      return false
  }
}

/**
 * `selfhost` always has access; otherwise a running trial, an own subscription or a seat does.
 * Development counts like production: the tests use the real rule, never a shortcut.
 */
export function hasAccess(facts: AccessFacts): Access {
  if (facts.mode === 'selfhost') return { access: true, reason: 'selfhost' }
  if (facts.trialEndsAt !== null && facts.trialEndsAt.getTime() > facts.now.getTime()) {
    return { access: true, reason: 'trial' }
  }
  if (carries(facts.ownSubscription, facts.now)) return { access: true, reason: 'own' }
  if (carries(facts.seatSubscription, facts.now)) return { access: true, reason: 'seat' }
  return { access: false, reason: 'none' }
}
