import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

const newUuid = () => crypto.randomUUID()

async function today(user: TestUser): Promise<string> {
  const view = await (await as(user).get('/api/today')).json()
  return view.date as string
}

async function addTask(user: TestUser, body: Record<string, unknown> = {}) {
  const response = await as(user).post('/api/tasks', { title: 'a task', ...body })
  expect(response.status).toBe(201)
  const result = await response.json()
  return result as { task: { id: string; [key: string]: unknown }; warnings: string[] }
}

async function mustToday(user: TestUser, count: number) {
  const day = await today(user)
  for (let index = 0; index < count; index += 1) {
    const created = await as(user).post('/api/tasks', { title: `must ${index}`, doDate: day })
    const task = await created.json()
    const patched = await as(user).patch(`/api/tasks/${task.task.id}`, { must: true })
    expect(patched.status).toBe(200)
  }
}

describe('POST /api/tasks', () => {
  it('creates an inbox task for today with no warnings', async () => {
    const user = await createUser()
    const day = await today(user)

    const response = await as(user).post('/api/tasks', { title: '  book the dentist  ' })
    expect(response.status).toBe(201)

    const result = await response.json()
    expect(result.task).toMatchObject({
      title: 'book the dentist',
      notes: '',
      nextStep: '',
      status: 'todo',
      doDate: day,
      deadline: null,
      must: false,
      slot: 'inbox',
      anchor: false,
      pushCount: 0,
      completedAt: null,
    })
    expect(result.warnings).toEqual([])

    const [stored] = await withSystem(
      (tx) => tx<{ assigneeId: string | null }[]>`select assignee_id from task where id = ${result.task.id}`,
    )
    expect(stored?.assigneeId).toBe(user.id)
  })

  it('accepts notes, deadline, slot and a later day', async () => {
    const user = await createUser()
    const day = await today(user)

    const created = await addTask(user, {
      title: 'refill prescription',
      notes: 'which pharmacy?',
      doDate: '2099-01-02',
      deadline: '2099-01-05',
      slot: 'block2',
    })
    expect(created.task).toMatchObject({ doDate: '2099-01-02', deadline: '2099-01-05', slot: 'block2' })
    expect(created.warnings).toEqual([])
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps errands undated', async () => {
    const user = await createUser()
    const day = await today(user)

    const created = await addTask(user, { title: 'buy stamps', slot: 'errands', doDate: day })
    expect(created.task.doDate).toBeNull()
    expect(created.task.slot).toBe('errands')
  })

  it('warns when the deadline is before the do date', async () => {
    const user = await createUser()

    const created = await addTask(user, { title: 'taxes', doDate: '2099-02-01', deadline: '2099-01-01' })
    expect(created.warnings).toEqual(['deadline_before_do_date'])
  })

  it('rejects an empty or too long title with 400', async () => {
    const user = await createUser()

    const empty = await as(user).post('/api/tasks', { title: '   ' })
    expect(empty.status).toBe(400)
    expect(Object.keys((await empty.json()).fields)).toEqual(['title'])

    const long = await as(user).post('/api/tasks', { title: 'x'.repeat(201) })
    expect(long.status).toBe(400)
    expect(Object.keys((await long.json()).fields)).toEqual(['title'])
  })
})

describe('GET /api/tasks/:id', () => {
  it('returns the task and 404 for anything else', async () => {
    const user = await createUser()
    const created = await addTask(user, { title: 'visible' })

    const found = await as(user).get(`/api/tasks/${created.task.id}`)
    expect(found.status).toBe(200)
    expect((await found.json()).title).toBe('visible')

    expect((await as(user).get(`/api/tasks/${newUuid()}`)).status).toBe(404)
    expect((await as(user).get('/api/tasks/not-a-uuid')).status).toBe(404)
  })
})

describe('PATCH /api/tasks/:id', () => {
  it('updates text fields', async () => {
    const user = await createUser()
    const created = await addTask(user, { title: 'old title' })

    const response = await as(user).patch(`/api/tasks/${created.task.id}`, {
      title: 'new title',
      notes: 'a note',
      nextStep: 'open the drawer',
    })
    expect(response.status).toBe(200)

    const result = await response.json()
    expect(result.task).toMatchObject({ title: 'new title', notes: 'a note', nextStep: 'open the drawer' })
    expect(result.warnings).toEqual([])
  })

  it('sets completed_at on done and clears it on the way back', async () => {
    const user = await createUser()
    const created = await addTask(user, { title: 'finish me' })

    const done = await (await as(user).patch(`/api/tasks/${created.task.id}`, { status: 'done' })).json()
    expect(done.task.status).toBe('done')
    expect(typeof done.task.completedAt).toBe('string')

    const back = await (await as(user).patch(`/api/tasks/${created.task.id}`, { status: 'doing' })).json()
    expect(back.task.completedAt).toBeNull()
  })

  it('anchors only today', async () => {
    const user = await createUser()
    const created = await addTask(user, { title: 'the one thing' })

    const ok = await as(user).patch(`/api/tasks/${created.task.id}`, { anchor: true })
    expect(ok.status).toBe(200)
    expect((await ok.json()).task.anchor).toBe(true)

    const later = await addTask(user, { title: 'tomorrow thing', doDate: '2099-03-04' })
    const rejected = await as(user).patch(`/api/tasks/${later.task.id}`, { anchor: true })
    expect(rejected.status).toBe(422)
    expect((await rejected.json()).code).toBe('anchor_not_today')
  })

  it('answers 409 with the current anchor and replaces it when asked', async () => {
    const user = await createUser()
    const first = await addTask(user, { title: 'first anchor' })
    const second = await addTask(user, { title: 'second anchor' })

    expect((await as(user).patch(`/api/tasks/${first.task.id}`, { anchor: true })).status).toBe(200)

    const conflict = await as(user).patch(`/api/tasks/${second.task.id}`, { anchor: true })
    expect(conflict.status).toBe(409)
    const body = await conflict.json()
    expect(body.code).toBe('anchor_exists')
    expect(body.currentAnchorId).toBe(first.task.id)

    const replaced = await as(user).patch(`/api/tasks/${second.task.id}`, { anchor: true, replaceAnchor: true })
    expect(replaced.status).toBe(200)
    expect((await replaced.json()).task.anchor).toBe(true)

    const old = await (await as(user).get(`/api/tasks/${first.task.id}`)).json()
    expect(old.anchor).toBe(false)

    const view = await (await as(user).get('/api/today')).json()
    expect(view.anchor.id).toBe(second.task.id)
  })

  it('warns at the must threshold and refuses a sixth must', async () => {
    const user = await createUser()
    const day = await today(user)

    await mustToday(user, 4)
    const view = await (await as(user).get('/api/today')).json()
    expect(view.must).toHaveLength(4)

    // A new must on the same day, read through the response warnings.
    const fifth = await addTask(user, { title: 'fifth' })
    const fifthResult = await as(user).patch(`/api/tasks/${fifth.task.id}`, { must: true, doDate: day })
    expect(fifthResult.status).toBe(200)
    expect((await fifthResult.json()).warnings).toContain('must_many')

    const sixth = await addTask(user, { title: 'sixth' })
    const refused = await as(user).patch(`/api/tasks/${sixth.task.id}`, { must: true, doDate: day })
    expect(refused.status).toBe(422)
    expect((await refused.json()).code).toBe('must_limit')
  })

  it('renumbers target and source slot when a task moves', async () => {
    const user = await createUser()
    const ids: string[] = []
    for (const index of [1, 2, 3]) {
      const created = await addTask(user, { title: `task ${index}` })
      await as(user).patch(`/api/tasks/${created.task.id}`, { slot: 'block1' })
      ids.push(created.task.id)
    }

    let view = await (await as(user).get('/api/today')).json()
    expect(view.slots.block1.map((task: { position: number }) => task.position)).toEqual([0, 1, 2])
    expect(view.slots.block1.map((task: { id: string }) => task.id)).toEqual(ids)

    // Move the middle one into block 2.
    await as(user).patch(`/api/tasks/${ids[1]}`, { slot: 'block2' })

    view = await (await as(user).get('/api/today')).json()
    expect(view.slots.block1.map((task: { id: string }) => task.id)).toEqual([ids[0], ids[2]])
    expect(view.slots.block1.map((task: { position: number }) => task.position)).toEqual([0, 1])
    expect(view.slots.block2.map((task: { id: string }) => task.id)).toEqual([ids[1]])
    expect(view.slots.block2.map((task: { position: number }) => task.position)).toEqual([0])
  })

  it('answers 404 for unknown and malformed ids', async () => {
    const user = await createUser()
    expect((await as(user).patch(`/api/tasks/${newUuid()}`, { title: 'x' })).status).toBe(404)
    expect((await as(user).patch('/api/tasks/nope', { title: 'x' })).status).toBe(404)
  })
})

describe('POST /api/tasks/:id/triage', () => {
  it('applies must today', async () => {
    const user = await createUser()
    const day = await today(user)
    const created = await addTask(user, { title: 'triage me' })

    const response = await as(user).post(`/api/tasks/${created.task.id}/triage`, { kind: 'must_today', slot: 'block3' })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.task).toMatchObject({ doDate: day, slot: 'block3', must: true })
  })

  it('applies today with a block', async () => {
    const user = await createUser()
    const day = await today(user)
    const created = await addTask(user, { title: 'later today' })

    const result = await (
      await as(user).post(`/api/tasks/${created.task.id}/triage`, { kind: 'today', slot: 'block1' })
    ).json()
    expect(result.task).toMatchObject({ doDate: day, slot: 'block1', must: false, anchor: false })
  })

  it('applies later and errand', async () => {
    const user = await createUser()
    const later = await addTask(user, { title: 'not today' })
    const errand = await addTask(user, { title: 'an errand' })

    const laterResult = await (
      await as(user).post(`/api/tasks/${later.task.id}/triage`, { kind: 'later', date: '2099-04-05' })
    ).json()
    expect(laterResult.task).toMatchObject({ doDate: '2099-04-05', slot: 'inbox', must: false, anchor: false })

    const errandResult = await (
      await as(user).post(`/api/tasks/${errand.task.id}/triage`, { kind: 'errand' })
    ).json()
    expect(errandResult.task).toMatchObject({ doDate: null, slot: 'errands', must: false, anchor: false })
  })

  it('refuses later with today', async () => {
    const user = await createUser()
    const day = await today(user)
    const created = await addTask(user, { title: 'still today' })

    const response = await as(user).post(`/api/tasks/${created.task.id}/triage`, { kind: 'later', date: day })
    expect(response.status).toBe(422)
    expect((await response.json()).code).toBe('later_must_be_future')
  })

  it('rejects an unknown answer', async () => {
    const user = await createUser()
    const created = await addTask(user, { title: 'what' })

    const response = await as(user).post(`/api/tasks/${created.task.id}/triage`, { kind: 'someday' })
    expect(response.status).toBe(400)
    expect(Object.keys((await response.json()).fields)).toEqual(['kind'])
  })
})

describe('DELETE /api/tasks/:id', () => {
  it('deletes once and answers 204, then 404', async () => {
    const user = await createUser()
    const created = await addTask(user, { title: 'delete me' })

    const response = await as(user).delete(`/api/tasks/${created.task.id}`)
    expect(response.status).toBe(204)
    expect((await as(user).get(`/api/tasks/${created.task.id}`)).status).toBe(404)
    expect((await as(user).delete(`/api/tasks/${created.task.id}`)).status).toBe(404)
  })
})
