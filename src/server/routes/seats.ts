import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext, AppEnv } from '../app-env.ts'
import { PaddleError } from '../billing/paddle.ts'
import { coverMember, ownSubscriptionId, releaseMember, SeatError, seatOverview } from '../billing/seats.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

// E8-P6: seats of the caller's own subscription. The wish is only local after Paddle accepted it,
// so a cover or release answers 204 and the client refetches until the webhook confirms it.

const SeatChange = z.object({ memberId: z.string().min(1).max(255) })

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof SeatError) return c.json({ code: error.code }, error.status)
  // Paddle said no and nothing local changed, so the client may try again.
  if (error instanceof PaddleError) return c.json({ code: 'billing_failed' }, 502)
  throw error
}

async function change(
  c: AppContext,
  run: (userId: string, subscriptionId: string, memberId: string) => Promise<void>,
): Promise<Response> {
  const json = await readJson(c)
  if ('response' in json) return json.response
  const parsed = SeatChange.safeParse(json.body)
  if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

  const user = userOf(c)
  const subscriptionId = await ownSubscriptionId(user.id)
  if (!subscriptionId) return c.json({ code: 'not_your_subscription' }, 404)

  try {
    await run(user.id, subscriptionId, parsed.data.memberId)
    return c.body(null, 204)
  } catch (error) {
    return failure(c, error)
  }
}

export const seatRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await seatOverview(userOf(c).id)))
  .post('/cover', requireUser, (c) => change(c, coverMember))
  .post('/release', requireUser, (c) => change(c, releaseMember))
