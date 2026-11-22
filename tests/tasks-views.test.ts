import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays } from '../src/shared/day.ts'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

type Created = { task: { id: string; [key: string]: unknown } }

async function today(user: TestUser): Promise<string> {
  const view = await (await as(user).get('/api/today')).json()
  return view.date as string
}

async function addTask(user: TestUser, body: Record<string, unknown>): Promise<Created> {
  const response = await as(user).post('/api/tasks', { title: 'task', ...body })
  expect(response.status).toBe(201)
  return (await response.json()) as Created
}

async function patch(user: TestUser, id: string, body: Record<string, unknown>) {
  const response = await as(user).patch(`/api/tasks/${id}`, body)
  expect(response.status).toBe(200)
  return response.json()
}

async function list(user: TestUser, view: string) {
  const response = await as(user).get(`/api/tasks?view=${view}`)
  expect(response.status).toBe(200)
  return response.json() as Promise<{
    view: string
    groups: { date: string | null; tasks: { id: string; title: string; [key: string]: unknown }[] }[]
  }>
}

/** One user with a day that covers every section of Today and every Plan view. */
async function seedDay(user: TestUser) {
  const day = await today(user)
  const anchor = await addTask(user, { title: 'the anchor' })
  await patch(user, anchor.task.id, { anchor: true })

  const mustOne = await addTask(user, { title: 'must one' })
  await patch(user, mustOne.task.id, { must: true })
  const mustTwo = await addTask(user, { title: 'must two' })
  await patch(user, mustTwo.task.id, { must: true })

  const blocked = await addTask(user, { title: 'block work' })
  await patch(user, blocked.task.id, { slot: 'block1' })

  const waiting = await addTask(user, { title: 'waiting for the bank' })
  await patch(user, waiting.task.id, { status: 'waiting' })

  const done = await addTask(user, { title: 'already done' })
  await patch(user, done.task.id, { status: 'done' })

  const skipped = await addTask(user, { title: 'not today' })
  await patch(user, skipped.task.id, { status: 'skipped' })

  const inboxToday = await addTask(user, { title: 'loose in the inbox' })
  const errand = await addTask(user, { title: 'buy stamps', slot: 'errands' })
  const tomorrow = await addTask(user, { title: 'tomorrow thing', doDate: addDays(day, 1) })
  const thisWeek = await addTask(user, { title: 'this week thing', doDate: addDays(day, 3) })
  const farAway = await addTask(user, { title: 'far away thing', doDate: addDays(day, 10) })

  return {
    day,
    ids: {
      anchor: anchor.task.id,
      mustOne: mustOne.task.id,
      mustTwo: mustTwo.task.id,
      blocked: blocked.task.id,
      waiting: waiting.task.id,
      done: done.task.id,
      skipped: skipped.task.id,
      inboxToday: inboxToday.task.id,
      errand: errand.task.id,
      tomorrow: tomorrow.task.id,
      thisWeek: thisWeek.task.id,
      farAway: farAway.task.id,
    },
  }
}

describe('GET /api/today', () => {
  it('splits the day into anchor, must and slots', async () => {
    const user = await createUser()
    const { day, ids } = await seedDay(user)

    const view = await (await as(user).get('/api/today')).json()

    expect(view.date).toBe(day)
    expect(view.energy).toBeNull()
    expect(view.rolledCount).toBe(0)
    expect(view.anchor.id).toBe(ids.anchor)

    // Anchor and must only live in their own fields, never in a slot.
    expect(view.must.map((task: { id: string }) => task.id).sort()).toEqual([ids.mustOne, ids.mustTwo].sort())
    // The waiting task keeps its place in the inbox; the anchor and the musts do not appear here.
    expect(view.slots.inbox.map((task: { id: string }) => task.id)).toEqual([ids.waiting, ids.inboxToday])
    expect(view.slots.block1.map((task: { id: string }) => task.id)).toEqual([ids.blocked])

    // Done stays for the day, skipped belongs to the plan, errands are only counted here.
    expect(view.doneToday.map((task: { id: string }) => task.id)).toEqual([ids.done])
    expect(view.errandsOpen).toBe(1)
    const shown = JSON.stringify(view)
    expect(shown).not.toContain(ids.skipped)
    expect(shown).not.toContain(ids.errand)
    expect(shown).not.toContain(ids.tomorrow)

    for (const key of ['inbox', 'block1', 'block2', 'block3', 'block4']) {
      expect(Array.isArray(view.slots[key])).toBe(true)
    }
  })

  it('reports the energy of the day', async () => {
    const user = await createUser()
    const { day } = await seedDay(user)

    await withSystem(
      (tx) => tx`update day_entry set energy = 'low' where user_id = ${user.id} and date = ${day}`,
    )

    const view = await (await as(user).get('/api/today')).json()
    expect(view.energy).toBe('low')
  })
})

describe('GET /api/tasks?view=…', () => {
  it('inbox holds the unsorted pile, one flat group', async () => {
    const user = await createUser()
    const { ids } = await seedDay(user)

    const result = await list(user, 'inbox')
    expect(result.view).toBe('inbox')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.date).toBeNull()

    const shown = result.groups[0]?.tasks.map((task) => task.id) ?? []
    expect(shown).toContain(ids.inboxToday)
    expect(shown).toContain(ids.farAway)
    expect(shown).not.toContain(ids.blocked)
    expect(shown).not.toContain(ids.errand)
  })

  it('tomorrow shows only tomorrow', async () => {
    const user = await createUser()
    const { ids } = await seedDay(user)

    const result = await list(user, 'tomorrow')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.date).toBeNull()
    expect(result.groups[0]?.tasks.map((task) => task.id)).toEqual([ids.tomorrow])
  })

  it('week groups by day from tomorrow to day seven', async () => {
    const user = await createUser()
    const { day, ids } = await seedDay(user)

    const result = await list(user, 'week')
    expect(result.groups.map((group) => group.date)).toEqual([addDays(day, 1), addDays(day, 3)])
    expect(result.groups[0]?.tasks.map((task) => task.id)).toEqual([ids.tomorrow])
    expect(result.groups[1]?.tasks.map((task) => task.id)).toEqual([ids.thisWeek])

    const shown = JSON.stringify(result)
    expect(shown).not.toContain(ids.inboxToday)
    expect(shown).not.toContain(ids.farAway)
  })

  it('errands lists open errands', async () => {
    const user = await createUser()
    const { ids } = await seedDay(user)

    const result = await list(user, 'errands')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.date).toBeNull()
    expect(result.groups[0]?.tasks.map((task) => task.id)).toEqual([ids.errand])
  })

  it('waiting lists tasks that wait for someone else', async () => {
    const user = await createUser()
    const { ids } = await seedDay(user)

    const result = await list(user, 'waiting')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.tasks.map((task) => task.id)).toEqual([ids.waiting])
  })

  it('done groups by the day it was finished and stops at thirty days', async () => {
    const user = await createUser()
    const { day, ids } = await seedDay(user)

    const old = await addTask(user, { title: 'finished long ago' })
    await patch(user, old.task.id, { status: 'done' })
    await withSystem(
      (tx) => tx`update task set completed_at = now() - interval '40 days' where id = ${old.task.id}`,
    )

    const result = await list(user, 'done')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.date).toBe(day)
    expect(result.groups[0]?.tasks.map((task) => task.id)).toEqual([ids.done])
  })

  it('skipped groups by the day it was planned for', async () => {
    const user = await createUser()
    const { day, ids } = await seedDay(user)

    const result = await list(user, 'skipped')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.date).toBe(day)
    expect(result.groups[0]?.tasks.map((task) => task.id)).toEqual([ids.skipped])
  })

  it('rejects an unknown view', async () => {
    const user = await createUser()
    const response = await as(user).get('/api/tasks?view=someday')
    expect(response.status).toBe(400)
    expect(Object.keys((await response.json()).fields)).toEqual(['view'])
  })
})
