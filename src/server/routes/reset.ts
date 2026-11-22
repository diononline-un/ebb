import { Hono } from 'hono'
import { ResetPatch, StuckDecision } from '../../shared/schemas/reset.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { complete, decideStuck, history, loadCurrent, ResetError, saveCurrent } from '../domain/reset/reset.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof ResetError) return c.json({ code: error.code }, error.status)
  throw error
}

export const resetRoutes = new Hono<AppEnv>()
  .get('/current', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => loadCurrent(tx, todayOf(c)))),
  )
  .patch('/current', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = ResetPatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    return c.json(await withUser(userOf(c).id, (tx) => saveCurrent(tx, todayOf(c), parsed.data)))
  })
  .post('/stuck/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = StuckDecision.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => decideStuck(tx, todayOf(c), id, parsed.data)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .post('/complete', requireUser, async (c) => {
    try {
      return c.json(await withUser(userOf(c).id, (tx) => complete(tx, todayOf(c))))
    } catch (error) {
      return failure(c, error)
    }
  })
  .get('/history', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => history(tx))))
