import { Hono } from 'hono'
import { ListView, TaskCreate, TaskPatch, TriageAnswer } from '../../shared/schemas/task.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser, type Tx } from '../db.ts'
import { TaskError, type RuleContext } from '../domain/tasks/rules.ts'
import { createTask, deleteTask, loadTaskDetail, patchTask, triageTask } from '../domain/tasks/tasks.ts'
import { loadTaskList, loadTodayView } from '../domain/tasks/views.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, readJson as bodyOf } from './http.ts'

/** A broken rule becomes its HTTP answer here; nothing else is caught. */
function failure(c: AppContext, error: unknown): Response {
  if (error instanceof TaskError) {
    return c.json({ code: error.code, ...(error.details ?? {}) }, error.status)
  }
  throw error
}

async function ruleContext(tx: Tx, c: AppContext): Promise<RuleContext> {
  const [row] = await tx<{ mustWarnAt: number }[]>`
    select must_warn_at from user_settings where user_id = app.uid()`
  return { today: todayOf(c), mustWarnAt: row?.mustWarnAt ?? 4 }
}

export const taskRoutes = new Hono<AppEnv>()
  .post('/tasks', requireUser, async (c) => {
    const parsed = await bodyOf(c)
    if ('response' in parsed) return parsed.response
    const input = TaskCreate.safeParse(parsed.body)
    if (!input.success) return invalidBody(c, fieldErrors(input.error))

    try {
      const created = await withUser(userOf(c).id, async (tx) =>
        createTask(tx, input.data, await ruleContext(tx, c)),
      )
      return c.json(created, 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .get('/tasks', requireUser, async (c) => {
    const view = ListView.safeParse(c.req.query('view'))
    if (!view.success) return invalidBody(c, { view: ['unknown_view'] })

    return c.json(await withUser(userOf(c).id, (tx) => loadTaskList(tx, view.data, todayOf(c))))
  })
  .get('/tasks/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return c.json({ code: 'not_found' }, 404)

    const detail = await withUser(userOf(c).id, (tx) => loadTaskDetail(tx, id))
    if (!detail) return c.json({ code: 'not_found' }, 404)
    return c.json(detail)
  })
  .patch('/tasks/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return c.json({ code: 'not_found' }, 404)

    const parsed = await bodyOf(c)
    if ('response' in parsed) return parsed.response
    const input = TaskPatch.safeParse(parsed.body)
    if (!input.success) return invalidBody(c, fieldErrors(input.error))

    try {
      const patched = await withUser(userOf(c).id, async (tx) =>
        patchTask(tx, id, input.data, await ruleContext(tx, c)),
      )
      return c.json(patched)
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/tasks/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return c.json({ code: 'not_found' }, 404)

    try {
      await withUser(userOf(c).id, (tx) => deleteTask(tx, id))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
  .post('/tasks/:id/triage', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return c.json({ code: 'not_found' }, 404)

    const parsed = await bodyOf(c)
    if ('response' in parsed) return parsed.response
    const answer = TriageAnswer.safeParse(parsed.body)
    if (!answer.success) return invalidBody(c, fieldErrors(answer.error))

    try {
      const triaged = await withUser(userOf(c).id, async (tx) =>
        triageTask(tx, id, answer.data, await ruleContext(tx, c)),
      )
      return c.json(triaged)
    } catch (error) {
      return failure(c, error)
    }
  })
  .get('/today', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => loadTodayView(tx, todayOf(c)))),
  )
