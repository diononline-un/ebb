import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { exportEverything } from '../domain/export/export.ts'
import { requireUser, userOf } from '../middleware/session.ts'

/** E9-P4: the whole account as one JSON file, no path parameter, no state. */
export const exportRoutes = new Hono<AppEnv>().get('/', requireUser, async (c) => {
  const user = userOf(c)
  const day = new Date().toISOString().slice(0, 10)
  const payload = await withUser(user.id, (tx) => exportEverything(tx, user, new Date().toISOString()))

  return c.json(payload, 200, {
    'content-disposition': `attachment; filename="ebb-export-${day}.json"`,
  })
})
