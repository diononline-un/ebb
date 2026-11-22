import { Hono } from 'hono'
import { EnergyBody } from '../../shared/schemas/day.ts'
import type { AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import { finishRitual, setEnergy } from '../domain/day/day.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, invalidBody, readJson } from './http.ts'

export const dayRoutes = new Hono<AppEnv>()
  .put('/energy', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = EnergyBody.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    return c.json(await withUser(userOf(c).id, (tx) => setEnergy(tx, todayOf(c), parsed.data.energy)))
  })
  .post('/ritual-done', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => finishRitual(tx, todayOf(c)))),
  )
