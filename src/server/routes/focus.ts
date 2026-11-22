import { Hono } from 'hono'
import { FocusStart } from '../../shared/schemas/focus.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { currentFocus, FocusError, startFocus, stopFocus } from '../domain/focus/focus.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof FocusError) return c.json({ code: error.code }, error.status)
  throw error
}

export const focusRoutes = new Hono<AppEnv>()
  .get('/current', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => currentFocus(tx))))
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = FocusStart.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => startFocus(tx, parsed.data)), 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .post('/:id/stop', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      return c.json(await withUser(userOf(c).id, (tx) => stopFocus(tx, id)))
    } catch (error) {
      return failure(c, error)
    }
  })
