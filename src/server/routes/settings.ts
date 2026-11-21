import { Hono } from 'hono'
import type { ZodError } from 'zod'
import { SettingsPatch } from '../../shared/schemas/settings.ts'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { getSettings, patchSettings } from '../domain/settings/settings.ts'
import { requireUser, userOf } from '../middleware/session.ts'

/** 400 body shape: the field names that failed, so the form can point at them. */
function fieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const name = issue.path.map(String).join('.') || '_'
    fields[name] = [...(fields[name] ?? []), issue.message]
  }
  return fields
}

export const settingsRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => getSettings(tx))))
  .patch('/', requireUser, async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'invalid_body', fields: { _: ['invalid_json'] } }, 400)
    }

    const parsed = SettingsPatch.safeParse(body)
    if (!parsed.success) {
      return c.json({ code: 'invalid_body', fields: fieldErrors(parsed.error) }, 400)
    }

    return c.json(await withUser(userOf(c).id, (tx) => patchSettings(tx, parsed.data)))
  })
