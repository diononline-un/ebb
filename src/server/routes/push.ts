import { Hono } from 'hono'
import { z } from 'zod'
import { isPushEndpoint } from '../../shared/push-endpoint.ts'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { env } from '../env.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

// E9-P1: subscribing and unsubscribing one browser. The public key is null when the deployment has
// no VAPID keys, and the web keeps push off then (src/web/lib/push.ts). The UI comes with E9-P3.

// Only a known push service is stored: the reminder job later sends a POST to this URL and must not
// be aimable at internal addresses (src/shared/push-endpoint.ts).
const Subscription = z.object({
  endpoint: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine(isPushEndpoint),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
})

const Unsubscribe = z.object({ endpoint: z.string().min(1).max(2048) })

export const pushRoutes = new Hono<AppEnv>()
  .get('/key', requireUser, (c) => c.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null }))
  .post('/subscriptions', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response

    const parsed = Subscription.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    const { endpoint, keys } = parsed.data
    await withUser(userOf(c).id, (tx) =>
      tx`select app.save_push_subscription(${endpoint}, ${keys.p256dh}, ${keys.auth})`,
    )
    return c.body(null, 204)
  })
  .delete('/subscriptions', requireUser, async (c) => {
    // Always 204: whether an endpoint belongs to someone else must not be readable from the answer.
    const json = await readJson(c)
    if ('response' in json) return c.body(null, 204)

    const parsed = Unsubscribe.safeParse(json.body)
    if (parsed.success) {
      await withUser(userOf(c).id, (tx) => tx`delete from push_subscription where endpoint = ${parsed.data.endpoint}`)
    }
    return c.body(null, 204)
  })
