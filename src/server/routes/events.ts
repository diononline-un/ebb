import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { EventInput, trackEvent } from '../domain/events/events.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

/**
 * E10-P6: `POST /api/events` takes one product event of the signed-in person and answers 204. The
 * write runs in the request role, so app.uid() names the owner and RLS keeps the row there.
 */
export const eventRoutes = new Hono<AppEnv>().post('/', requireUser, async (c) => {
  const json = await readJson(c)
  if ('response' in json) return json.response

  const parsed = EventInput.safeParse(json.body)
  if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

  await withUser(userOf(c).id, (tx) => trackEvent(tx, parsed.data))
  return c.body(null, 204)
})
