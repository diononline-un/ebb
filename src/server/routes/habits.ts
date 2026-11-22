import { Hono } from 'hono'
import { HabitCreate, HabitPatch } from '../../shared/schemas/habits.ts'
import { CalendarDate } from '../../shared/schemas/task.ts'
import type { AppContext, AppEnv } from '../app-env.ts'
import { withUser } from '../db.ts'
import {
  clearHabitDay,
  createHabit,
  HabitError,
  habitsToday,
  listHabits,
  logHabitDay,
  patchHabit,
} from '../domain/habits/habits.ts'
import { todayOf } from '../middleware/day-start.ts'
import { requireUser, userOf } from '../middleware/session.ts'
import { fieldErrors, idOrNull, invalidBody, notFound, readJson } from './http.ts'

function failure(c: AppContext, error: unknown): Response {
  if (error instanceof HabitError) return c.json({ code: error.code }, error.status)
  throw error
}

/** The log path carries a calendar day; anything else names nothing. */
function dateOf(value: string | undefined): string | null {
  const parsed = CalendarDate.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const habitRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => listHabits(tx, todayOf(c)))),
  )
  .get('/today', requireUser, async (c) =>
    c.json(await withUser(userOf(c).id, (tx) => habitsToday(tx, todayOf(c)))),
  )
  .post('/', requireUser, async (c) => {
    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = HabitCreate.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => createHabit(tx, parsed.data)), 201)
    } catch (error) {
      return failure(c, error)
    }
  })
  .patch('/:id', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    if (!id) return notFound(c)

    const json = await readJson(c)
    if ('response' in json) return json.response
    const parsed = HabitPatch.safeParse(json.body)
    if (!parsed.success) return invalidBody(c, fieldErrors(parsed.error))

    try {
      return c.json(await withUser(userOf(c).id, (tx) => patchHabit(tx, id, parsed.data)))
    } catch (error) {
      return failure(c, error)
    }
  })
  .put('/:id/log/:date', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    const date = dateOf(c.req.param('date'))
    if (!id || !date) return notFound(c)

    try {
      return c.json(await withUser(userOf(c).id, (tx) => logHabitDay(tx, id, date, todayOf(c))))
    } catch (error) {
      return failure(c, error)
    }
  })
  .delete('/:id/log/:date', requireUser, async (c) => {
    const id = idOrNull(c.req.param('id'))
    const date = dateOf(c.req.param('date'))
    if (!id || !date) return notFound(c)

    try {
      await withUser(userOf(c).id, (tx) => clearHabitDay(tx, id, date, todayOf(c)))
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })
