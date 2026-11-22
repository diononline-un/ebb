import { Hono } from 'hono'
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
import { fieldErrors, idOrNull, invalidBody, readJson } from './http.ts'

export const dumpRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => listActiveDump(tx))))
  .get('/archived', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => listArchivedDump(tx))),
  )
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response

    const parsed = DumpCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

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
