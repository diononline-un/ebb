import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem } from '../src/server/db.ts'
import { runRetention } from '../src/server/jobs/retention.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

/** Everything that points at a person in the tables the app owns. */
type Leftovers = {
  tasks: number
  dumpLines: number
  goals: number
  habits: number
  habitLogs: number
  projects: number
  recurrences: number
  focusSessions: number
  weeklyResets: number
  dayEntries: number
  spaces: number
  members: number
  settings: number
  access: number
  subscriptions: number
}

async function leftovers(userId: string): Promise<Leftovers> {
  const [row] = await withSystem((tx) => tx<Leftovers[]>`
    select (select count(*)::int from task where created_by = ${userId} or assignee_id = ${userId}) as tasks,
           (select count(*)::int from dump_line where user_id = ${userId}) as dump_lines,
           (select count(*)::int from goal where user_id = ${userId}) as goals,
           (select count(*)::int from habit where user_id = ${userId}) as habits,
           (select count(*)::int from habit_log where user_id = ${userId}) as habit_logs,
           (select count(*)::int from project where created_by = ${userId}) as projects,
           (select count(*)::int from recurrence where created_by = ${userId}) as recurrences,
           (select count(*)::int from focus_session where user_id = ${userId}) as focus_sessions,
           (select count(*)::int from weekly_reset where user_id = ${userId}) as weekly_resets,
           (select count(*)::int from day_entry where user_id = ${userId}) as day_entries,
           (select count(*)::int from space where owner_id = ${userId}) as spaces,
           (select count(*)::int from space_member where user_id = ${userId}) as members,
           (select count(*)::int from user_settings where user_id = ${userId}) as settings,
           (select count(*)::int from user_access where user_id = ${userId}) as access,
           (select count(*)::int from subscription where payer_user_id = ${userId}) as subscriptions`)
  if (!row) throw new Error('leftovers query returned nothing')
  return row
}

async function accountExists(userId: string): Promise<boolean> {
  const rows = await withSystem((tx) => tx<{ id: string }[]>`select id from "user" where id = ${userId}`)
  return rows.length > 0
}

/** Fills the account with a row in every table a person owns, so the cascade has something to carry. */
async function fillAccount(user: TestUser): Promise<void> {
  await as(user).post('/api/tasks', { title: 'my task' })
  await as(user).post('/api/dump', { clientId: crypto.randomUUID(), text: 'my thought' })
  await as(user).post('/api/goals', { title: 'my goal' })
  await as(user).post('/api/habits', { name: 'my habit' })
  await as(user).post('/api/projects', { name: 'my project' })
  await as(user).post('/api/recurrences', { title: 'my rule', rule: { freq: 'daily' }, startsOn: '2026-11-22' })
  await as(user).post('/api/focus', { plannedMinutes: 25 })
}

/** Moves an account back in time: no trial left and no login for `months` (plus `days`). */
async function ageAccount(user: TestUser, months: number, days = 0): Promise<void> {
  // The newest session row counts as a login, and the auth tables have no RLS: the test-setup
  // connection is the only role that can drop them.
  await ownerSql`delete from "session" where "userId" = ${user.id}`
  await withSystem(
    (tx) => tx`
      update user_access
         set last_seen_at = now() - ${`${months} months ${days} days`}::interval,
             trial_ends_at = now() - ${`${months} months ${days} days`}::interval
       where user_id = ${user.id}`,
  )
}

describe('DELETE /api/account', () => {
  it('answers 422 when the confirmation is not the own address', async () => {
    const user = await createUser()
    const res = await as(user).request('DELETE', '/api/account', { confirm: 'someone-else@example.test' })

    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe('confirmation_mismatch')
    expect((await as(user).get('/api/me')).status).toBe(200)
    expect(await accountExists(user.id)).toBe(true)
  })

  it('answers 400 without a confirmation', async () => {
    const user = await createUser()
    const res = await as(user).request('DELETE', '/api/account', {})

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('invalid_body')
  })

  it('removes the account, everything it owns and the session', async () => {
    const user = await createUser()
    await fillAccount(user)

    const res = await as(user).request('DELETE', '/api/account', { confirm: user.email })
    expect(res.status).toBe(204)

    expect(await accountExists(user.id)).toBe(false)
    // The session row cascaded with the account, so the old cookie names nobody.
    expect((await as(user).get('/api/me')).status).toBe(401)

    expect(await leftovers(user.id)).toEqual({
      tasks: 0,
      dumpLines: 0,
      goals: 0,
      habits: 0,
      habitLogs: 0,
      projects: 0,
      recurrences: 0,
      focusSessions: 0,
      weeklyResets: 0,
      dayEntries: 0,
      spaces: 0,
      members: 0,
      settings: 0,
      access: 0,
      subscriptions: 0,
    })
  })

  it('leaves a shared space standing and its tasks without an assignee', async () => {
    const owner = await createUser()
    const partner = await createUser()

    const space = (await (await as(owner).post('/api/spaces', { name: 'Household' })).json()) as { id: string }
    const invite = (await (await as(owner).post(`/api/spaces/${space.id}/invites`, {})).json()) as { token: string }
    expect((await as(partner).post('/api/spaces/join', { token: invite.token })).status).toBe(200)

    // The partner hands out the task, so it survives its creator; the owner plans it for today.
    const created = (await (
      await as(partner).post('/api/tasks', { title: 'take the bins out', spaceId: space.id, assigneeId: owner.id })
    ).json()) as { task: { id: string } }
    await as(owner).request('PATCH', `/api/tasks/${created.task.id}`, { slot: 'block1', must: true })

    expect((await as(owner).request('DELETE', '/api/account', { confirm: owner.email })).status).toBe(204)

    const [left] = await withSystem((tx) => tx<{ assigneeId: string | null; slot: string; must: boolean }[]>`
      select assignee_id, slot, must from task where id = ${created.task.id}`)
    expect(left).toEqual({ assigneeId: null, slot: 'inbox', must: false })

    const [shared] = await withSystem((tx) => tx<{ ownerId: string; kind: string }[]>`
      select owner_id, kind from space where id = ${space.id}`)
    expect(shared).toEqual({ ownerId: partner.id, kind: 'shared' })

    const members = await withSystem((tx) => tx<{ userId: string; role: string }[]>`
      select user_id, role from space_member where space_id = ${space.id}`)
    expect(members).toEqual([{ userId: partner.id, role: 'owner' }])
  })
})

describe('runRetention', () => {
  it('deletes an account without access or login for over a year, and keeps a fresh one', async () => {
    const stale = await createUser()
    const fresh = await createUser()
    await fillAccount(stale)
    await ageAccount(stale, 13)
    await ageAccount(fresh, 0)

    expect(await runRetention()).toEqual({ warned: 0, finalWarned: 0, deleted: 1 })
    expect(await accountExists(stale.id)).toBe(false)
    expect(await accountExists(fresh.id)).toBe(true)
    expect(await leftovers(stale.id)).toMatchObject({ tasks: 0, goals: 0, spaces: 0, access: 0 })
  })

  it('warns once, a month before the removal, and marks it', async () => {
    const user = await createUser()
    await ageAccount(user, 11, 20)

    expect(await runRetention()).toEqual({ warned: 1, finalWarned: 0, deleted: 0 })
    const [marked] = await withSystem((tx) => tx<{ warned: Date | null }[]>`
      select deletion_warned_at as warned from user_access where user_id = ${user.id}`)
    expect(marked?.warned).toBeInstanceOf(Date)
    expect(await accountExists(user.id)).toBe(true)

    // The mark keeps the daily run from sending the same mail again.
    expect(await runRetention()).toEqual({ warned: 0, finalWarned: 0, deleted: 0 })
  })

  it('keeps an account that still has a seat on a running subscription', async () => {
    const user = await createUser()
    const payer = await createUser()
    await ageAccount(user, 13)
    await withSystem(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into subscription (payer_user_id, paddle_subscription_id, paddle_customer_id, status,
                                  current_period_end)
        values (${payer.id}, 'sub_account_test', 'ctm_account_test', 'active', now() + interval '1 month')
        returning id`
      if (!row) throw new Error('subscription insert returned nothing')
      await tx`insert into subscription_seat (subscription_id, user_id) values (${row.id}, ${user.id})`
    })

    expect(await runRetention()).toEqual({ warned: 0, finalWarned: 0, deleted: 0 })
    expect(await accountExists(user.id)).toBe(true)
  })
})
