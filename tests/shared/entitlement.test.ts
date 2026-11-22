import { describe, expect, it } from 'vitest'
import { hasAccess, type AccessFacts } from '../../src/shared/entitlement.ts'

const NOW = new Date('2026-11-22T10:00:00.000Z')
const SOON = new Date('2026-12-22T10:00:00.000Z')
const PAST = new Date('2026-10-22T10:00:00.000Z')

function facts(patch: Partial<AccessFacts> = {}): AccessFacts {
  return { mode: 'production', now: NOW, trialEndsAt: null, ownSubscription: null, seatSubscription: null, ...patch }
}

describe('hasAccess', () => {
  it.each([
    ['selfhost always counts', facts({ mode: 'selfhost' }), { access: true, reason: 'selfhost' }],
    ['a running trial', facts({ trialEndsAt: SOON }), { access: true, reason: 'trial' }],
    ['an ended trial', facts({ trialEndsAt: PAST }), { access: false, reason: 'none' }],
    ['the trial ends exactly now', facts({ trialEndsAt: NOW }), { access: false, reason: 'none' }],
    [
      'an active subscription',
      facts({ ownSubscription: { status: 'active', currentPeriodEnd: SOON } }),
      { access: true, reason: 'own' },
    ],
    [
      'a trialing subscription',
      facts({ ownSubscription: { status: 'trialing', currentPeriodEnd: SOON } }),
      { access: true, reason: 'own' },
    ],
    [
      'past_due inside the dunning window',
      facts({ ownSubscription: { status: 'past_due', currentPeriodEnd: SOON } }),
      { access: true, reason: 'own' },
    ],
    [
      'past_due after the period end',
      facts({ ownSubscription: { status: 'past_due', currentPeriodEnd: PAST } }),
      { access: false, reason: 'none' },
    ],
    [
      'canceled but paid until the period end',
      facts({ ownSubscription: { status: 'canceled', currentPeriodEnd: SOON } }),
      { access: true, reason: 'own' },
    ],
    [
      'canceled and the period is over',
      facts({ ownSubscription: { status: 'canceled', currentPeriodEnd: PAST } }),
      { access: false, reason: 'none' },
    ],
    ['paused', facts({ ownSubscription: { status: 'paused', currentPeriodEnd: SOON } }), { access: false, reason: 'none' }],
    [
      'a seat in someone else\'s subscription',
      facts({ seatSubscription: { status: 'active', currentPeriodEnd: SOON } }),
      { access: true, reason: 'seat' },
    ],
    [
      'own subscription before a seat',
      facts({
        ownSubscription: { status: 'active', currentPeriodEnd: SOON },
        seatSubscription: { status: 'active', currentPeriodEnd: SOON },
      }),
      { access: true, reason: 'own' },
    ],
    [
      'a running trial before any subscription',
      facts({ trialEndsAt: SOON, ownSubscription: { status: 'active', currentPeriodEnd: SOON } }),
      { access: true, reason: 'trial' },
    ],
    [
      'an expired trial with a seat',
      facts({ trialEndsAt: PAST, seatSubscription: { status: 'active', currentPeriodEnd: SOON } }),
      { access: true, reason: 'seat' },
    ],
    ['nothing at all', facts(), { access: false, reason: 'none' }],
  ])('%s', (_name, given, expected) => {
    expect(hasAccess(given)).toEqual(expected)
  })
})
