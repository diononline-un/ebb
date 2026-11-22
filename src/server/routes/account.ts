import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { deleteAccount } from '../domain/account/delete.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

/** Typing the own mail address is the confirmation; no spec asks for anything else (PRD F17). */
const DeleteBody = z.object({ confirm: z.string().min(1) })

/**
 * E9-P5: `DELETE /api/account` removes the signed-in account. The deletion itself runs in the system
 * role (domain/account/delete.ts) because the auth row belongs to a role the request cannot hold; this
 * route only validates the confirmation and maps the two answers.
 */
export const accountRoutes = new Hono<AppEnv>().delete('/', requireUser, async (c) => {
  const user = userOf(c)
  const body = await readJson(c)
  if ('response' in body) return body.response

  const parsed = DeleteBody.safeParse(body.body)
  if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

  if (parsed.data.confirm.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return c.json({ code: 'confirmation_mismatch' }, 422)
  }

  await deleteAccount(user.id)
  // The session rows cascade with the account, so the cookie is worthless from here on.
  return c.body(null, 204)
})
