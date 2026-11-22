import { Hono } from 'hono'
import { GoalCreate, GoalPatch } from '../../shared/schemas/goals.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { createGoal, deleteGoal, GoalError, listGoals, patchGoal } from '../domain/goals/goals.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof GoalError) return c.json({ code: error.code }, error.status)
  throw error
}

export const goalRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => listGoals(tx))))
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = GoalCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => createGoal(tx, parsed.data)), 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .patch('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = GoalPatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => patchGoal(tx, id, parsed.data)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => deleteGoal(tx, id))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
