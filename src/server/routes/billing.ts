import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { receiveWebhook } from '../billing/webhook.ts'
import { env } from '../env.ts'

/** The one Paddle entry point. Deliberately outside /api: the prefix is exempt from session checks. */
export const billingRoutes = new Hono<AppEnv>()
  .post('/webhook', async (c) => {
    const secret = env.PADDLE_WEBHOOK_SECRET
    // Without a secret nothing can be verified, so the route says so instead of storing events.
    if (!secret) return c.json({ code: 'billing_not_configured' }, 503)
    return receiveWebhook(c, secret)
  })
