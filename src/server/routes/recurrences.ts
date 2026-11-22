import { Hono } from 'hono'
import { RecurrenceCreate, RecurrencePatch } from '../../shared/schemas/recurrence.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import {
  createRecurrence,
  deleteRecurrence,
  listRecurrences,
  patchRecurrence,
  RecurrenceError,
} from '../domain/recurrences/recurrences.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof RecurrenceError) return c.json({ code: error.code }, error.status)
  throw error
}

export const recurrenceRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => listRecurrences(tx))))
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = RecurrenceCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => createRecurrence(tx, parsed.data)), 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .patch('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = RecurrencePatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => patchRecurrence(tx, id, parsed.data)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => deleteRecurrence(tx, id))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
