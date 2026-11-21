import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

const newClientId = () => crypto.randomUUID()

async function addLine(user: TestUser, text: string) {
  const response = await as(user).post('/api/dump', { clientId: newClientId(), text })
  return (await response.json()) as { id: string; text: string; taskId: string | null }
}

async function countTasks(userId: string): Promise<number> {
  const [row] = await withSystem(
    (tx) => tx<{ count: number }[]>`select count(*)::int as count from task where created_by = ${userId}`,
  )
  return row?.count ?? 0
}

describe('POST /api/dump', () => {
  it('stores a trimmed line and answers 201', async () => {
    const user = await createUser()

    const response = await as(user).post('/api/dump', { clientId: newClientId(), text: '  call the landlord  ' })
    expect(response.status).toBe(201)

    const line = await response.json()
    expect(line.text).toBe('call the landlord')
    expect(line.taskId).toBeNull()
    expect(line.archivedAt).toBeNull()
    expect(typeof line.createdAt).toBe('string')
  })

  it('answers 200 with the same line when the client id repeats', async () => {
    const user = await createUser()
    const clientId = newClientId()

    const first = await as(user).post('/api/dump', { clientId, text: 'one thought' })
    expect(first.status).toBe(201)
    const firstLine = await first.json()

    const second = await as(user).post('/api/dump', { clientId, text: 'one thought' })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(firstLine)

    const active = await (await as(user).get('/api/dump')).json()
    expect(active).toHaveLength(1)
  })

  it('rejects blank text and a missing client id with 400', async () => {
    const user = await createUser()

    const blank = await as(user).post('/api/dump', { clientId: newClientId(), text: '   ' })
    expect(blank.status).toBe(400)
    const blankBody = await blank.json()
    expect(blankBody.code).toBe('invalid_body')
    expect(Object.keys(blankBody.fields)).toEqual(['text'])

    const noClient = await as(user).post('/api/dump', { text: 'no id' })
    expect(noClient.status).toBe(400)
    expect(Object.keys((await noClient.json()).fields)).toEqual(['clientId'])

    const tooLong = await as(user).post('/api/dump', { clientId: newClientId(), text: 'x'.repeat(501) })
    expect(tooLong.status).toBe(400)
  })

  it('keeps two users apart', async () => {
    const anna = await createUser('anna@example.test')
    const ben = await createUser('ben@example.test')
    await addLine(anna, 'anna thought')

    expect(await (await as(ben).get('/api/dump')).json()).toEqual([])
    expect(await (await as(anna).get('/api/dump')).json()).toHaveLength(1)
  })
})

describe('GET /api/dump', () => {
  it('lists active lines oldest first and leaves archived ones out', async () => {
    const user = await createUser()
    const first = await addLine(user, 'first')
    await addLine(user, 'second')
    await addLine(user, 'third')

    const archived = await as(user).post(`/api/dump/${first.id}/archive`)
    expect(archived.status).toBe(200)

    const active = (await (await as(user).get('/api/dump')).json()) as { text: string }[]
    expect(active.map((line) => line.text)).toEqual(['second', 'third'])
  })
})

describe('GET /api/dump/archived', () => {
  it('lists archived lines newest first and caps the answer at 200', async () => {
    const user = await createUser()

    // 205 archived lines, one minute apart, written straight into the table: the cap is the point here.
    await withSystem(
      (tx) => tx`
        insert into dump_line (user_id, client_id, text, archived_at)
        select ${user.id}, gen_random_uuid(), 'line ' || value, now() - (value || ' minutes')::interval
        from generate_series(1, 205) as value`,
    )

    const archived = (await (await as(user).get('/api/dump/archived')).json()) as { text: string }[]
    expect(archived).toHaveLength(200)
    expect(archived[0]?.text).toBe('line 1')
    expect(archived[199]?.text).toBe('line 200')
  })
})

describe('POST /api/dump/:id/to-task', () => {
  it('creates one inbox task due today and links the line to it', async () => {
    const user = await createUser()
    const line = await addLine(user, 'write the invoice')

    const response = await as(user).post(`/api/dump/${line.id}/to-task`)
    expect(response.status).toBe(200)

    const task = await response.json()
    // The day starts at 04:00 and the dev clock is real time, so only the shape is fixed here.
    expect(task).toMatchObject({ title: 'write the invoice', slot: 'inbox', status: 'todo', must: false, anchor: false })
    expect(task.doDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const [stored] = await withSystem(
      (tx) => tx<{ spaceId: string; assigneeId: string | null; doDate: Date }[]>`
        select space_id, assignee_id, do_date from task where id = ${task.id}`,
    )
    expect(stored?.assigneeId).toBe(user.id)

    const [space] = await withSystem(
      (tx) => tx<{ id: string }[]>`
        select id from space where owner_id = ${user.id} and kind = 'personal'`,
    )
    expect(stored?.spaceId).toBe(space?.id)

    const [linked] = await withSystem(
      (tx) => tx<{ taskId: string | null }[]>`select task_id from dump_line where id = ${line.id}`,
    )
    expect(linked?.taskId).toBe(task.id)
  })

  it('answers the same task on a second call and never creates a second one', async () => {
    const user = await createUser()
    const line = await addLine(user, 'one task please')

    const first = await (await as(user).post(`/api/dump/${line.id}/to-task`)).json()
    const second = await as(user).post(`/api/dump/${line.id}/to-task`)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(first)

    expect(await countTasks(user.id)).toBe(1)
  })

  it('cuts long text to 200 characters', async () => {
    const user = await createUser()
    const text = `${'a'.repeat(199)}z tail`
    const line = await addLine(user, text)

    const task = await (await as(user).post(`/api/dump/${line.id}/to-task`)).json()
    expect(Array.from(task.title as string)).toHaveLength(200)
    expect(task.title).toBe('a'.repeat(199) + 'z')
  })

  it('answers 404 for an unknown or malformed id', async () => {
    const user = await createUser()

    expect((await as(user).post(`/api/dump/${newClientId()}/to-task`)).status).toBe(404)
    expect((await as(user).post('/api/dump/not-a-uuid/to-task')).status).toBe(404)
  })
})

describe('POST /api/dump/:id/archive', () => {
  it('archives idempotently and moves the line between the two lists', async () => {
    const user = await createUser()
    const line = await addLine(user, 'archive me')

    const first = await as(user).post(`/api/dump/${line.id}/archive`)
    expect(first.status).toBe(200)
    const archivedLine = await first.json()
    expect(archivedLine.archivedAt).toBeTruthy()

    const again = await as(user).post(`/api/dump/${line.id}/archive`)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(archivedLine)

    expect(await (await as(user).get('/api/dump')).json()).toEqual([])
    const archived = (await (await as(user).get('/api/dump/archived')).json()) as { id: string }[]
    expect(archived.map((entry) => entry.id)).toEqual([line.id])
  })

  it('answers 404 for an unknown id', async () => {
    const user = await createUser()
    expect((await as(user).post(`/api/dump/${newClientId()}/archive`)).status).toBe(404)
  })
})
