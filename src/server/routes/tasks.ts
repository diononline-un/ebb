import { Hono } from 'hono'
import type { ZodError } from 'zod'
import { ListView, TaskCreate, TaskPatch, TriageAnswer } from '../../shared/schemas/task.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser, type Tx } from '../db.ts'
import { TaskError, type RuleContext } from '../domain/tasks/rules.ts'
import { createTask, deleteTask, loadTaskRow, patchTask, toTask, triageTask } from '../domain/tasks/tasks.ts'
import { loadTaskList, loadTodayView } from '../domain/tasks/views.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A path id that is not a uuid names nothing; answering 404 keeps it out of the database. */
function idOrNull(value: string): string | null {
  return UUID.test(value) ? value : null
}

function fieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const name = issue.path.map(String).join('.') || '_'
    fields[name] = [...(fields[name] ?? []), issue.message]
  }
  return fields
}

function invalidBody(c: AppContext, fields: Record<string, string[]>): Response {
  return c.json({ code: 'invalid_body', fields }, 400)
}

async function bodyOf(c: AppContext): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await c.req.json() }
  } catch {
    return { response: invalidBody(c, { _: ['invalid_json'] }) }
  }
}

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

    const row = await withUser(userOf(c).id, (tx) => loadTaskRow(tx, id))
    if (!row) return c.json({ code: 'not_found' }, 404)
    return c.json(toTask(row))
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
