import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { PaddleError, paddleClient } from '../billing/paddle.ts'
import { withUser } from '../db.ts'
import { env } from '../env.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { notFound } from './http.ts'

// E8-P5: what the billing page needs to start a checkout, plus the way into the customer portal.
// Until Paddle is live the answer says `configured: false` and the button stays off (Dion's
// decision of 2026-11-27); switching it on is a matter of environment variables, not code.

export type BillingConfig = {
  configured: boolean
  environment: 'sandbox' | 'production' | null
  clientToken: string | null
  priceId: string | null
  founder: boolean
  seatPriceId: string | null
  maxExtraSeats: number
}

/** The base plan the checkout offers, per `PRICE_BASE_ACTIVE`. */
function activePriceId(): string | null {
  return (env.PRICE_BASE_ACTIVE === 'founder' ? env.PADDLE_PRICE_FOUNDER : env.PADDLE_PRICE_STANDARD) ?? null
}

/**
 * The token and the price are both needed for a checkout. Paddle prefixes sandbox tokens with
 * `test_` and live ones with `live_`, exactly as `paddle.ts` reads the API key's `pdl_sdbx_`.
 */
function billingConfig(): BillingConfig {
  const clientToken = env.PADDLE_CLIENT_TOKEN ?? null
  const priceId = activePriceId()
  return {
    configured: Boolean(clientToken && priceId),
    environment: clientToken === null ? null : clientToken.startsWith('test_') ? 'sandbox' : 'production',
    clientToken,
    priceId,
    founder: env.PRICE_BASE_ACTIVE === 'founder',
    seatPriceId: env.PADDLE_PRICE_SEAT ?? null,
    maxExtraSeats: env.MAX_EXTRA_SEATS,
  }
}

/** Self-host has no billing at all (E8-P7): nothing to configure, nothing to open. */
function noBilling(): boolean {
  return env.APP_MODE === 'selfhost'
}

/** The caller's own Paddle customer, or null. RLS shows a payer their own subscription only. */
async function ownCustomerId(userId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const [row] = await tx<{ paddleCustomerId: string }[]>`
      select paddle_customer_id from subscription
       where payer_user_id = app.uid() order by updated_at desc limit 1`
    return row?.paddleCustomerId ?? null
  })
}

export const billingConfigRoutes = new Hono<AppEnv>()
  .get('/', requireUser, (c) => {
    if (noBilling()) return notFound(c)
    // The answer comes from the environment; there is nothing of the caller's to read here.
    return c.json(billingConfig())
  })
  .post('/portal', requireUser, async (c) => {
    if (noBilling()) return notFound(c)

    const client = paddleClient()
    if (!client?.createPortalSession) return c.json({ code: 'billing_not_configured' }, 503)

    const customerId = await ownCustomerId(userOf(c).id)
    // A covered person and a trial have no portal: Paddle only knows customers who pay themselves.
    if (!customerId) return c.json({ code: 'not_your_subscription' }, 404)

    try {
      return c.json({ url: await client.createPortalSession(customerId) })
    } catch (error) {
      if (error instanceof PaddleError) return c.json({ code: 'billing_failed' }, 502)
      throw error
    }
  })
