import { Hono } from 'hono'
import { ProjectCreate, ProjectPatch } from '../../shared/schemas/projects.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import {
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  patchProject,
  ProjectError,
} from '../domain/projects/projects.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof ProjectError) return c.json({ code: error.code }, error.status)
  throw error
}

export const projectRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => listProjects(tx, todayOf(c)))),
  )
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = ProjectCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => createProject(tx, parsed.data, todayOf(c))), 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .get('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      return c.json(await withUser(userOf(c).id, (tx) => loadProject(tx, id, todayOf(c))))
    } catch (error) {
      return failure(c, error)
    }
  })
  .patch('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = ProjectPatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => patchProject(tx, id, parsed.data, todayOf(c))))
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => deleteProject(tx, id))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
