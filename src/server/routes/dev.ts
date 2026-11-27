import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { devMails } from '../mail.ts'
import { setDevClockOffset } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { clearDevPushes, devPushes } from '../push/send.ts'

const ClockBody = z.object({
  /** Minutes the user's clock is moved forward (or back, with a negative value). Zero resets it. */
  offsetMinutes: z
    .number()
    .int()
    .min(-7 * 24 * 60)
    .max(7 * 24 * 60),
})

/**
 * Development-only helpers. createApp() registers them only when APP_MODE=development, and the clock
 * offset itself is ignored outside development (middleware/day-start.ts).
 */
export const devRoutes = new Hono<AppEnv>()
  .get('/mails', (c) => c.json(devMails()))
  .get('/pushes', (c) => c.json(devPushes()))
  .delete('/pushes', (c) => {
    clearDevPushes()
    return c.body(null, 204)
  })
  .post('/clock', requireUser, async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'invalid_body', fields: { _: ['invalid_json'] } }, 400)
    }

    const parsed = ClockBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ code: 'invalid_body', fields: { offsetMinutes: ['invalid'] } }, 400)
    }

    setDevClockOffset(userOf(c).id, parsed.data.offsetMinutes)
    return c.json({ offsetMinutes: parsed.data.offsetMinutes })
  })
