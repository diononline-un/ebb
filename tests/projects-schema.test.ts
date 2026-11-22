import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem, withUser } from '../src/server/db.ts'
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

async function insertProject(user: TestUser, spaceId: string, fields: Record<string, unknown> = {}) {
  const row = { space_id: spaceId, name: 'Move the office', ...fields }
  const [project] = await withUser(user.id, (tx) => tx`insert into project ${tx(row)} returning *`)
  return project!
}

async function insertGoal(user: TestUser, title = 'Be calmer at work') {
  const [goal] = await withUser(user.id, (tx) => tx`insert into goal (title) values (${title}) returning *`)
  return goal!
}

async function insertRecurrence(user: TestUser, spaceId: string, fields: Record<string, unknown> = {}) {
  const row = { space_id: spaceId, title: 'Water the plants', rule: { freq: 'daily' }, starts_on: '2026-11-22', ...fields }
  const [rule] = await withUser(user.id, (tx) => tx`insert into recurrence ${tx(row)} returning *`)
  return rule!
}

async function insertTask(user: TestUser, spaceId: string, fields: Record<string, unknown> = {}) {
  const row = { space_id: spaceId, title: 'Subtask', ...fields }
  const [task] = await withUser(user.id, (tx) => tx`insert into task ${tx(row)} returning *`)
  return task!
}

describe('project', () => {
  it('lives in a space and is visible to its members only', async () => {
    const a = await createUser()
    const b = await createUser()
    const stranger = await createUser()
    const shared = await sharedSpace(a, [b])
    const project = await insertProject(a, shared)
    expect(project['spaceId']).toBe(shared)

    const seenByB = await withUser(b.id, (tx) => tx`select id from project`)
    expect(seenByB).toHaveLength(1)
    expect(await withUser(stranger.id, (tx) => tx`select id from project`)).toHaveLength(0)
  })

  it('hangs on a goal only in the owner\'s own space', async () => {
    const a = await createUser()
    const b = await createUser()
    const goal = await insertGoal(a)

    await expect(insertProject(a, await personalSpace(a), { goal_id: goal['id'] })).resolves.toBeDefined()
    // A shared space carries no goal, and someone else's goal never.
    const shared = await sharedSpace(a, [b])
    await expect(insertProject(a, shared, { goal_id: goal['id'] })).rejects.toThrow(/goal_not_personal/)
    await expect(insertProject(b, await personalSpace(b), { goal_id: goal['id'] })).rejects.toThrow(/goal_not_personal/)
  })

  it('keeps its dates in order', async () => {
    const a = await createUser()
    const space = await personalSpace(a)
    await expect(
      insertProject(a, space, { start_date: '2026-11-22', deadline: '2026-11-01' }),
    ).rejects.toThrow(/project_dates/)
  })
})

describe('recurrence', () => {
  it('is member work like its instances', async () => {
    const a = await createUser()
    const b = await createUser()
    const stranger = await createUser()
    const shared = await sharedSpace(a, [b])
    await insertRecurrence(a, shared)

    expect(await withUser(b.id, (tx) => tx`select id from recurrence`)).toHaveLength(1)
    expect(await withUser(stranger.id, (tx) => tx`select id from recurrence`)).toHaveLength(0)
    await expect(
      insertRecurrence(stranger, shared),
    ).rejects.toThrow(/row-level security/)
  })

  it('needs a rule object with a frequency', async () => {
    const a = await createUser()
    const space = await personalSpace(a)
    await expect(insertRecurrence(a, space, { rule: { interval: 3 } })).rejects.toThrow(/recurrence_rule_check/)
    await expect(insertRecurrence(a, space, { rule: [] })).rejects.toThrow(/recurrence_rule_check/)
  })
})

describe('task with project, parent and instance', () => {
  it('allows one instance per rule and day', async () => {
    const a = await createUser()
    const space = await personalSpace(a)
    const rule = await insertRecurrence(a, space)

    await insertTask(a, space, { recurrence_id: rule['id'], do_date: '2026-11-22' })
    await expect(
      insertTask(a, space, { recurrence_id: rule['id'], do_date: '2026-11-22' }),
    ).rejects.toThrow(/task_one_instance_per_day/)
    await expect(
      insertTask(a, space, { recurrence_id: rule['id'], do_date: '2026-11-23' }),
    ).resolves.toBeDefined()
  })

  it('keeps subtasks one level deep and in the same space', async () => {
    const a = await createUser()
    const b = await createUser()
    const own = await personalSpace(a)
    const other = await personalSpace(b)

    const parent = await insertTask(a, own, { title: 'Parent' })
    const child = await insertTask(a, own, { title: 'Child', parent_id: parent['id'] })
    expect(child['parentId']).toBe(parent['id'])

    await expect(insertTask(a, own, { parent_id: child['id'] })).rejects.toThrow(/subtask_too_deep/)
    // A parent that does not exist names no space either, so the guard refuses it like a foreign one.
    await expect(insertTask(a, own, { parent_id: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow(
      /subtask_other_space/,
    )
    await expect(insertTask(a, other, { parent_id: parent['id'] })).rejects.toThrow(/row-level security|subtask_other_space/)
  })

  it('loses its subtasks and its project with the thing it hung on', async () => {
    const a = await createUser()
    const space = await personalSpace(a)
    const project = await insertProject(a, space)
    const parent = await insertTask(a, space, { title: 'Parent', project_id: project['id'] })
    await insertTask(a, space, { title: 'Child', parent_id: parent['id'] })

    await withUser(a.id, (tx) => tx`delete from task where id = ${parent['id'] as string}`)
    const left = await withUser(a.id, (tx) => tx`select title from task`)
    expect(left).toEqual([])

    const task = await insertTask(a, space, { project_id: project['id'] })
    await withUser(a.id, (tx) => tx`delete from project where id = ${project['id'] as string}`)
    const [after] = await withUser(a.id, (tx) => tx`select project_id from task where id = ${task['id'] as string}`)
    expect(after).toMatchObject({ projectId: null })
  })

  it('refuses a parent of another space even when the requester owns both', async () => {
    const a = await createUser()
    const own = await personalSpace(a)
    const b = await createUser()
    const shared = await sharedSpace(b, [a])
    const parent = await insertTask(a, own, { title: 'Parent' })

    await expect(insertTask(a, shared, { parent_id: parent['id'] })).rejects.toThrow(/subtask_other_space/)
  })
})
