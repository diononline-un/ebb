import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem, withUser } from '../src/server/db.ts'
import { startDayIfNeeded } from '../src/server/domain/day/start-day.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

// Europe/Berlin in November is UTC+1: 04:00 local is 03:00Z.
const AT_0359_LOCAL = new Date('2026-11-22T02:59:00Z')
const AT_0400_LOCAL = new Date('2026-11-22T03:00:00Z')
const YESTERDAY = '2026-11-21'
const TODAY = '2026-11-22'

type Seed = {
  title: string
  status?: string
  do_date?: string | null
  deadline?: string | null
  must?: boolean
  anchor?: boolean
  slot?: string
  push_count?: number
}

async function setUp(user: TestUser, lastDayStarted: string | null = YESTERDAY) {
  // Set as system: these columns are server-side state, not user settings.
  await withSystem(
    (tx) => tx`update user_settings set timezone = 'Europe/Berlin', last_day_started = ${lastDayStarted}
               where user_id = ${user.id}`,
  )
}

async function seed(user: TestUser, rows: Seed[]) {
  return withSystem(async (tx) => {
    const [space] = await tx<{ id: string }[]>`select id from space where owner_id = ${user.id} and kind = 'personal'`
    const full = rows.map((row) => ({
      space_id: space!.id,
      created_by: user.id,
      title: row.title,
      status: row.status ?? 'todo',
      do_date: row.do_date === undefined ? YESTERDAY : row.do_date,
      deadline: row.deadline ?? null,
      must: row.must ?? false,
      anchor: row.anchor ?? false,
      slot: row.slot ?? 'block1',
      push_count: row.push_count ?? 0,
    }))
    return tx`insert into task ${tx(full)} returning id`
  })
}

async function tasksOf(user: TestUser) {
  const rows = await withSystem(
    (tx) => tx`select title, status, do_date, deadline, must, anchor, slot, push_count
               from task where assignee_id = ${user.id} order by title`,
  )
  return Object.fromEntries(rows.map((row) => [row['title'], row]))
}

const start = (user: TestUser, now: Date) => withUser(user.id, (tx) => startDayIfNeeded(tx, now))

describe('startDayIfNeeded', () => {
  it('rolls todo and doing from past days into today, and nothing else', async () => {
    const user = await createUser()
    await setUp(user)
    await seed(user, [
      { title: 'a-todo', must: true, anchor: true, deadline: '2026-11-30', push_count: 2 },
      { title: 'b-doing', status: 'doing', do_date: '2026-11-15' },
      { title: 'c-waiting', status: 'waiting' },
      { title: 'd-done', status: 'done' },
      { title: 'e-skipped', status: 'skipped' },
      { title: 'f-errand', do_date: null, slot: 'errands' },
      { title: 'g-today', do_date: TODAY },
      { title: 'h-later', do_date: '2026-11-25' },
    ])

    const result = await start(user, AT_0400_LOCAL)

    expect(result).toEqual({ today: TODAY, rolledCount: 2 })
    const tasks = await tasksOf(user)
    expect(tasks['a-todo']).toMatchObject({
      doDate: TODAY,
      slot: 'inbox',
      must: false,
      anchor: false,
      pushCount: 3,
      deadline: '2026-11-30',
    })
    expect(tasks['b-doing']).toMatchObject({ doDate: TODAY, slot: 'inbox', status: 'doing', pushCount: 1 })
    for (const untouched of ['c-waiting', 'd-done', 'e-skipped']) {
      expect(tasks[untouched]).toMatchObject({ doDate: YESTERDAY, slot: 'block1', pushCount: 0 })
    }
    expect(tasks['f-errand']).toMatchObject({ doDate: null, slot: 'errands', pushCount: 0 })
    expect(tasks['g-today']).toMatchObject({ doDate: TODAY, slot: 'block1', pushCount: 0 })
    expect(tasks['h-later']).toMatchObject({ doDate: '2026-11-25', pushCount: 0 })
  })

  it('records the count for the "came along" note', async () => {
    const user = await createUser()
    await setUp(user)
    await seed(user, [{ title: 'one' }, { title: 'two' }, { title: 'three', status: 'done' }])
    await start(user, AT_0400_LOCAL)
    const [entry] = await withSystem(
      (tx) => tx`select date, rolled_count from day_entry where user_id = ${user.id}`,
    )
    expect(entry).toEqual({ date: TODAY, rolledCount: 2 })
  })

  it('belongs to yesterday until 04:00 local time', async () => {
    const user = await createUser()
    await setUp(user)
    await seed(user, [{ title: 'open' }])

    expect(await start(user, AT_0359_LOCAL)).toEqual({ today: YESTERDAY, rolledCount: null })
    expect((await tasksOf(user))['open']).toMatchObject({ doDate: YESTERDAY, pushCount: 0 })

    expect(await start(user, AT_0400_LOCAL)).toEqual({ today: TODAY, rolledCount: 1 })
  })

  it('rolls over exactly once under parallel requests', async () => {
    const user = await createUser()
    await setUp(user)
    await seed(user, [{ title: 'open' }])

    const results = await Promise.all(Array.from({ length: 5 }, () => start(user, AT_0400_LOCAL)))

    expect(results.filter((r) => r.rolledCount !== null)).toHaveLength(1)
    expect((await tasksOf(user))['open']).toMatchObject({ pushCount: 1 })
  })

  it('starts the very first day without a previous one', async () => {
    const user = await createUser()
    await setUp(user, null)
    expect(await start(user, AT_0400_LOCAL)).toEqual({ today: TODAY, rolledCount: 0 })
  })

  it('leaves other users alone', async () => {
    const a = await createUser()
    const b = await createUser()
    await setUp(a)
    await setUp(b)
    await seed(b, [{ title: 'theirs' }])
    await start(a, AT_0400_LOCAL)
    expect((await tasksOf(b))['theirs']).toMatchObject({ doDate: YESTERDAY, pushCount: 0 })
  })
})

describe('day-start middleware', () => {
  it('starts the day on the first signed-in API request', async () => {
    const user = await createUser()
    const res = await as(user).get('/api/me')
    expect(res.status).toBe(200)
    const [row] = await withSystem(
      (tx) => tx`select last_day_started from user_settings where user_id = ${user.id}`,
    )
    expect(row?.['lastDayStarted']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
