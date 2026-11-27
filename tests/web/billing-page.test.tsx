// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingPage } from '../../src/web/features/billing/BillingPage.tsx'
import { SeatsSection } from '../../src/web/features/billing/SeatsSection.tsx'
import { i18nReady } from '../../src/web/lib/i18n.ts'

// E8-P5: the subscription page reads GET /api/me, GET /api/billing-config and GET /api/billing/seats;
// the fetch stub stands in for the server. Paddle.js is replaced as well, so no test reaches the CDN.

vi.mock('../../src/web/features/billing/paddle-js.ts', () => ({ openCheckout: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}))

type Access = {
  access: boolean
  reason: 'selfhost' | 'trial' | 'own' | 'seat' | 'none'
  trialEndsAt: string | null
  selfhost: boolean
  subscriptionStatus: string | null
}

type Answers = { me: unknown; config: unknown; seats: unknown }

/** Whatever the three endpoints answer in the test at hand. */
const answers: Answers = { me: null, config: null, seats: null }

/** The default: Paddle is not set up yet, which is the state of every deployment before it goes live. */
const unconfigured = {
  configured: false,
  environment: null,
  clientToken: null,
  priceId: null,
  founder: true,
  seatPriceId: null,
  maxExtraSeats: 5,
}

function me(reason: Access['reason'], patch: Partial<Access> = {}): unknown {
  return {
    user: { id: 'user-1', email: 'person@example.test', name: 'Person' },
    settings: {
      timezone: 'Europe/Berlin',
      morningReminder: null,
      weeklyResetDow: 0,
      weeklyResetTime: '18:00',
      onboardingStep: 9,
      onboardingDoneAt: '2026-11-01T00:00:00.000Z',
    },
    access: {
      access: reason !== 'none',
      reason,
      trialEndsAt: null,
      selfhost: reason === 'selfhost',
      subscriptionStatus: null,
      ...patch,
    },
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function renderPage(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeAll(async () => {
  await i18nReady
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/me') return json(answers.me)
    if (path === '/api/billing-config') return json(answers.config)
    if (path === '/api/billing/seats') return json(answers.seats)
    throw new Error(`unexpected fetch: ${path}`)
  })
})

beforeEach(() => {
  answers.me = me('trial', { trialEndsAt: '2026-12-04T10:00:00.000Z' })
  answers.config = unconfigured
  answers.seats = { subscriptionId: null, covered: [], pending: [], candidates: [], max: 5 }
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('BillingPage', () => {
  it('keeps the checkout closed while payments are not set up, and says so', async () => {
    const page = renderPage(<BillingPage />)

    expect(await page.findByText('Payments are not set up yet.')).toBeTruthy()
    const subscribe = page.getByRole('button', { name: 'Subscribe' }) as HTMLButtonElement
    expect(subscribe.disabled).toBe(true)
  })

  it('names the date the trial runs until', async () => {
    const endsAt = '2026-12-04T10:00:00.000Z'
    answers.me = me('trial', { trialEndsAt: endsAt })
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(endsAt))

    const page = renderPage(<BillingPage />)

    expect(await page.findByText(`Your trial runs until ${date}. Nothing to pay before then.`)).toBeTruthy()
  })

  it('points at the export when there is no access at all', async () => {
    answers.me = me('none')
    const page = renderPage(<BillingPage />)

    expect(await page.findByText(/export it any time/)).toBeTruthy()
  })
})

describe('SeatsSection', () => {
  it('shows an open seat wish as pending', async () => {
    answers.seats = {
      subscriptionId: 'sub-1',
      covered: [{ userId: 'user-1', name: 'Person' }],
      pending: [{ userId: 'user-2', action: 'cover' }],
      candidates: [],
      max: 5,
    }

    const page = renderPage(<SeatsSection />)

    expect(await page.findByText('Pending')).toBeTruthy()
  })
})
