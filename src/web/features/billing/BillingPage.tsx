import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { useMe, type Me } from '../onboarding/api.ts'
import { openCheckout } from './paddle-js.ts'
import { SeatsSection } from './SeatsSection.tsx'

// E8-P5: the subscription page. Calm on purpose: what is going on, one button towards the checkout,
// no amounts and no countdown. Without the Paddle variables it says that payments are not set up yet
// and keeps the button off (Dion's decision of 2026-11-27).

/** GET /api/billing-config: everything the checkout needs, straight from the environment. */
export type BillingConfig = {
  configured: boolean
  environment: 'sandbox' | 'production' | null
  clientToken: string | null
  priceId: string | null
  founder: boolean
  seatPriceId: string | null
  maxExtraSeats: number
}

const CONFIG_KEY = ['billing-config'] as const

/** The onboarding's Me type predates E8-P4: GET /api/me also sends the Paddle status (AccessInfo). */
type BillingAccess = Me['access'] & { subscriptionStatus: string | null }

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function BillingPage() {
  const { t } = useTranslation('billing')
  const me = useMe()
  const config = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => apiFetch<BillingConfig>('/api/billing-config'),
  })

  const access = me.data?.access as BillingAccess | undefined
  const configured = config.data?.configured === true

  const checkout = useMutation({
    mutationFn: async () => {
      const data = config.data
      const user = me.data?.user
      // The button stays off without a token and a price, so this only guards the types.
      if (!data?.clientToken || !data.priceId || data.environment === null || !user) {
        throw new Error('checkout without a client token or a price')
      }
      await openCheckout({
        environment: data.environment,
        token: data.clientToken,
        priceId: data.priceId,
        email: user.email,
        userId: user.id,
      })
    },
  })

  const portal = useMutation({
    mutationFn: () => apiFetch<{ url: string }>('/api/billing-config/portal', { method: 'POST' }),
    // Paddle's portal is a different origin; leaving the app is the point of the button.
    onSuccess: ({ url }) => window.location.assign(url),
  })

  /** One quiet line about the current state, per `access.reason`. */
  function statusLine(): string | null {
    if (!access) return null
    switch (access.reason) {
      case 'trial':
        return access.trialEndsAt === null
          ? null
          : t('status.trial', { date: dateFormat.format(new Date(access.trialEndsAt)) })
      case 'own':
        // A canceled plan keeps its access until the paid period ends, the status says how it stands.
        return access.subscriptionStatus === 'canceled' ? t('status.canceled') : t('status.own')
      case 'seat':
        return t('status.seat')
      case 'none':
        return t('readOnly.line')
      case 'selfhost':
        // Self-host has no billing; the route already sends people back to More.
        return null
    }
  }

  const line = statusLine()

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-title">{t('title')}</h1>
        <Link to="/more" className="text-small text-ink-2 underline hover:text-ink">
          {t('backToMore')}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {line === null ? null : <p className="max-w-[65ch] text-body">{line}</p>}
        {config.data?.founder === true ? <p className="max-w-[65ch] text-small text-ink-2">{t('founder')}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!configured || checkout.isPending || !access}
            onClick={() => checkout.mutate()}
          >
            {t('readOnly.action')}
          </Button>
          {access?.reason === 'own' ? (
            <Button type="button" variant="secondary" disabled={portal.isPending} onClick={() => portal.mutate()}>
              {t('manage')}
            </Button>
          ) : null}
        </div>

        {config.data !== undefined && !configured ? (
          <p className="max-w-[65ch] text-small text-ink-2">{t('paymentsNotSetUp')}</p>
        ) : null}
        {checkout.isError ? (
          <p role="alert" className="max-w-[65ch] text-small text-danger">
            {t('checkoutError')}
          </p>
        ) : null}
        {portal.isError ? (
          <p role="alert" className="max-w-[65ch] text-small text-danger">
            {t('portalError')}
          </p>
        ) : null}
      </div>

      {access?.reason === 'own' ? <SeatsSection /> : null}
    </section>
  )
}
