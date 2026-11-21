import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem, withUser } from '../src/server/db.ts'
import { DumpLine } from '../src/shared/schemas/dump.ts'
import { Task } from '../src/shared/schemas/task.ts'
import { createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function personalSpace(user: TestUser): Promise<string> {
  const [row] = await withSystem(
    (tx) => tx<{ id: string }[]>`select id from space where owner_id = ${user.id} and kind = 'personal'`,
  )
  return row!.id
}

/** A shared space owned by `owner` with `members`, created as system (ebb_app may not, see 0003). */
async function sharedSpace(owner: TestUser, members: TestUser[]): Promise<string> {
  return withSystem(async (tx) => {
    const [space] = await tx<{ id: string }[]>`
      insert into space (name, kind, owner_id) values ('Home', 'shared', ${owner.id}) returning id`
    await tx`insert into space_member (space_id, user_id, role) values (${space!.id}, ${owner.id}, 'owner')`
    for (const member of members) {
      await tx`insert into space_member (space_id, user_id, role) values (${space!.id}, ${member.id}, 'member')`
    }
    return space!.id
  })
}

async function insertTask(user: TestUser, spaceId: string, fields: Record<string, unknown> = {}) {
  const row = { space_id: spaceId, title: 'Call the dentist', ...fields }
  const [task] = await withUser(user.id, (tx) => tx`insert into task ${tx(row)} returning *`)
  return task!
}

describe('task invariants', () => {
  it('assigns personal tasks to the space owner, whatever the client sends', async () => {
    const a = await createUser()
    const b = await createUser()
    const task = await insertTask(a, await personalSpace(a), { assignee_id: b.id })
    expect(task['assigneeId']).toBe(a.id)
    expect(task['createdBy']).toBe(a.id)
  })

  it('allows only one anchor per person and day', async () => {
    const a = await createUser()
    const space = await personalSpace(a)
    await insertTask(a, space, { do_date: '2026-11-22', anchor: true })
    await expect(insertTask(a, space, { do_date: '2026-11-22', anchor: true })).rejects.toThrow(/task_one_anchor_per_day/)
    await expect(insertTask(a, space, { do_date: '2026-11-23', anchor: true })).resolves.toBeDefined()
  })

  it('keeps errands undated and anchors dated', async () => {
    const a = await createUser()
    const space = await personalSpace(a)
    await expect(insertTask(a, space, { slot: 'errands', do_date: '2026-11-22' })).rejects.toThrow(/task_errands_undated/)
    await expect(insertTask(a, space, { anchor: true, do_date: null })).rejects.toThrow(/task_anchor_has_day/)
  })

  it('refuses a forged created_by on insert and ignores it on update', async () => {
    const a = await createUser()
    const b = await createUser()
    const space = await sharedSpace(a, [b])
    await expect(insertTask(b, space, { created_by: a.id })).rejects.toThrow(/row-level security/)
    const task = await insertTask(b, space)
    const [updated] = await withUser(
      b.id,
      (tx) => tx`update task set created_by = ${a.id}, title = 'Renamed' where id = ${task['id'] as string} returning *`,
    )
    expect(updated).toMatchObject({ createdBy: b.id, title: 'Renamed' })
  })

  it('assigns shared tasks only to members of the space', async () => {
    const a = await createUser()
    const b = await createUser()
    const stranger = await createUser()
    const space = await sharedSpace(a, [b])
    await expect(insertTask(a, space, { assignee_id: b.id })).resolves.toMatchObject({ assigneeId: b.id })
    await expect(insertTask(a, space, { assignee_id: stranger.id })).rejects.toThrow(/assignee_not_member/)
  })

  it('lets the creator or the space owner delete, nobody else', async () => {
    const a = await createUser()
    const b = await createUser()
    const c = await createUser()
    const space = await sharedSpace(a, [b, c])
    const byB = await insertTask(b, space)
    const del = (user: TestUser, id: unknown) =>
      withUser(user.id, (tx) => tx`delete from task where id = ${id as string} returning id`)
    expect(await del(c, byB['id'])).toHaveLength(0)
    expect(await del(a, byB['id'])).toHaveLength(1)
    const byC = await insertTask(c, space)
    expect(await del(c, byC['id'])).toHaveLength(1)
  })
})

describe('isolation', () => {
  it('hides tasks, dump lines and day entries of other users', async () => {
    const a = await createUser()
    const b = await createUser()
    await insertTask(a, await personalSpace(a))
    await withUser(a.id, async (tx) => {
      await tx`insert into dump_line (client_id, text) values (gen_random_uuid(), 'buy printer paper')`
      await tx`insert into day_entry (date) values ('2026-11-22')`
    })
    const seen = await withUser(b.id, async (tx) => ({
      tasks: await tx`select id from task`,
      dump: await tx`select id from dump_line`,
      days: await tx`select date from day_entry`,
    }))
    expect(seen).toEqual({ tasks: [], dump: [], days: [] })
  })

  it('refuses tasks in a space the user does not belong to', async () => {
    const a = await createUser()
    const b = await createUser()
    await expect(insertTask(b, await personalSpace(a))).rejects.toThrow(/row-level security/)
  })

  it('stores a client id once per user', async () => {
    const a = await createUser()
    const insert = () =>
      withUser(a.id, (tx) => tx`
        insert into dump_line (client_id, text) values ('6a3e5c1e-0f0b-4c55-9d43-2f4a1c9b7e10', 'x')
        on conflict (user_id, client_id) do nothing returning id`)
    expect(await insert()).toHaveLength(1)
    expect(await insert()).toHaveLength(0)
  })
})

describe('API schemas match database rows', () => {
  it('returns calendar days as YYYY-MM-DD strings and parses as Task', async () => {
    const a = await createUser()
    const task = await insertTask(a, await personalSpace(a), { do_date: '2026-11-22', deadline: '2026-11-25' })
    expect(task['doDate']).toBe('2026-11-22')
    expect(task['deadline']).toBe('2026-11-25')
    expect(() => Task.parse(JSON.parse(JSON.stringify(task)))).not.toThrow()
  })

  it('parses a dump line', async () => {
    const a = await createUser()
    const [line] = await withUser(
      a.id,
      (tx) => tx`insert into dump_line (client_id, text) values (gen_random_uuid(), 'call mom') returning *`,
    )
    expect(() => DumpLine.parse(JSON.parse(JSON.stringify(line)))).not.toThrow()
  })
})

