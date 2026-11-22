import { Hono } from 'hono'
import { z } from 'zod'
import { InviteCreate, InviteJoin, SpaceCreate, SpacePatch } from '../../shared/schemas/spaces.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import {
  acceptInvite,
  createInvite,
  createSharedSpace,
  deleteSpace,
  leaveSpace,
  listMembers,
  listSpaces,
  removeMember,
  renameSpace,
  revokeInvite,
  SpaceError,
} from '../domain/spaces/spaces.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof SpaceError) return c.json({ code: error.code }, error.status)
  throw error
}

const DeleteBody = z.object({ name: z.string().max(80) })

export const spaceRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => listSpaces(tx))))
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = SpaceCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    return c.json(await withUser(userOf(c).id, (tx) => createSharedSpace(tx, parsed.data.name)), 201)
  })
  .post('/join', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = InviteJoin.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => acceptInvite(tx, parsed.data.token)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .patch('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = SpacePatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => renameSpace(tx, id, parsed.data.name)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = DeleteBody.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      await withUser(userOf(c).id, (tx) => deleteSpace(tx, id, parsed.data.name))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
  .get('/:id/members', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      return c.json(await withUser(userOf(c).id, (tx) => listMembers(tx, id)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/:id/members/:userId', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    const userId = c.req.param('userId')
    if (!id || !userId) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => removeMember(tx, id, userId))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
  .post('/:id/leave', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => leaveSpace(tx, id))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
  .post('/:id/invites', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = InviteCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => createInvite(tx, id, parsed.data.email ?? null)), 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/invites/:inviteId', requireUser, async (c) => {
    const inviteId = idOrNull(c.req.param('inviteId'))
    if (!inviteId) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => revokeInvite(tx, inviteId))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
