import { Hono } from 'hono'
import type { ZodError } from 'zod'
import { DumpCreate } from '../../shared/schemas/dump.ts'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import {
  archiveDumpLine,
  createDumpLine,
  dumpLineToTask,
  listActiveDump,
  listArchivedDump,
} from '../domain/dump/dump.ts'
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

export const dumpRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => listActiveDump(tx))))
  .get('/archived', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => listArchivedDump(tx))),
  )
  .post('/', requireUser, async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'invalid_body', fields: { _: ['invalid_json'] } }, 400)
    }

    const parsed = DumpCreate.safeParse(body)
    if (!parsed.success) {
      return c.json({ code: 'invalid_body', fields: fieldErrors(parsed.error) }, 400)
    }

    const result = await withUser(userOf(c).id, (tx) => createDumpLine(tx, parsed.data))
    return c.json(result.line, result.created ? 201 : 200)
  })
  .post('/:id/to-task', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return c.json({ code: 'not_found' }, 404)

    const task = await withUser(userOf(c).id, (tx) => dumpLineToTask(tx, id, todayOf(c)))
    if (!task) return c.json({ code: 'not_found' }, 404)
    return c.json(task)
  })
  .post('/:id/archive', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return c.json({ code: 'not_found' }, 404)

    const line = await withUser(userOf(c).id, (tx) => archiveDumpLine(tx, id))
    if (!line) return c.json({ code: 'not_found' }, 404)
    return c.json(line)
  })
