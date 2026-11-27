import { Hono } from 'hono'
import { SettingsPatch } from '../../shared/schemas/settings.ts'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { getSettings, patchSettings } from '../domain/settings/settings.ts'
import { forgetDay } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

export const settingsRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => c.json(await withUser(userOf(c).id, (tx) => getSettings(tx))))
  .patch('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response

    const parsed = SettingsPatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    const settings = await withUser(userOf(c).id, (tx) => patchSettings(tx, parsed.data))
    // A new time zone or day start moves where the day begins, so the cached day is stale.
    forgetDay(userOf(c).id)
    return c.json(settings)
  })
