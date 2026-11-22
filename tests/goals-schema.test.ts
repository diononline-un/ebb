import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, withSystem, withUser } from '../src/server/db.ts'
import { createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function insertGoal(user: TestUser, fields: Record<string, unknown> = {}) {
  const row = { title: 'Be calmer at work', ...fields }
  const [goal] = await withUser(user.id, (tx) => tx`insert into goal ${tx(row)} returning *`)
  return goal!
}

async function insertHabit(user: TestUser, fields: Record<string, unknown> = {}) {
  const row = { name: 'Ten minutes of tidying', ...fields }
  const [habit] = await withUser(user.id, (tx) => tx`insert into habit ${tx(row)} returning *`)
  return habit!
}

describe('goal', () => {
  it('belongs to the person who created it and stays invisible to others', async () => {
    const a = await createUser()
    const b = await createUser()
    const goal = await insertGoal(a)
    expect(goal['userId']).toBe(a.id)

    const seenByB = await withUser(b.id, (tx) => tx`select id from goal`)
    expect(seenByB).toHaveLength(0)
    const ownByB = await withUser(b.id, (tx) => tx`select id from goal where id = ${goal['id'] as string}`)
    expect(ownByB).toHaveLength(0)
  })

  it('refuses a forged owner', async () => {
    const a = await createUser()
    const b = await createUser()
    await expect(insertGoal(b, { user_id: a.id })).rejects.toThrow(/row-level security/)
  })

  it('lets the owner pause and delete it', async () => {
    const a = await createUser()
    const goal = await insertGoal(a)
    const [paused] = await withUser(
      a.id,
      (tx) => tx`update goal set status = 'paused' where id = ${goal['id'] as string} returning status`,
    )
    expect(paused).toMatchObject({ status: 'paused' })
    const deleted = await withUser(a.id, (tx) => tx`delete from goal where id = ${goal['id'] as string} returning id`)
    expect(deleted).toHaveLength(1)
  })

  it('keeps a title and a why inside their length', async () => {
    const a = await createUser()
    await expect(insertGoal(a, { title: '' })).rejects.toThrow(/goal_title_check/)
    await expect(insertGoal(a, { title: 'x'.repeat(81) })).rejects.toThrow(/goal_title_check/)
    await expect(insertGoal(a, { why: 'x'.repeat(281) })).rejects.toThrow(/goal_why_check/)
  })
})

describe('habit', () => {
  it('keeps its history when the goal goes away', async () => {
    const a = await createUser()
    const goal = await insertGoal(a)
    const habit = await insertHabit(a, { goal_id: goal['id'] })
    await withUser(a.id, (tx) => tx`delete from goal where id = ${goal['id'] as string}`)
    const [after] = await withUser(a.id, (tx) => tx`select goal_id from habit where id = ${habit['id'] as string}`)
    expect(after).toMatchObject({ goalId: null })
  })

  it('needs a target when it counts a week, and weekdays inside the week', async () => {
    const a = await createUser()
    await expect(insertHabit(a, { cadence: 'weekly_count' })).rejects.toThrow(/habit_weekly_target/)
    await expect(insertHabit(a, { cadence: 'weekly_count', weekly_target: 8 })).rejects.toThrow(/habit_weekly_target_check/)
    await expect(insertHabit(a, { weekdays: [7] })).rejects.toThrow(/habit_weekdays/)
    await expect(insertHabit(a, { weekdays: [1, 1, 1, 1, 1, 1, 1, 2] })).rejects.toThrow(/habit_weekdays/)
    await expect(insertHabit(a, { weekdays: [1, 3, 5] })).resolves.toBeDefined()
  })

  it('is archived rather than deleted by the request role', async () => {
    const a = await createUser()
    const habit = await insertHabit(a)
    const archived = await withUser(
      a.id,
      (tx) => tx`update habit set archived_at = now() where id = ${habit['id'] as string} returning archived_at`,
    )
    expect(archived[0]?.['archivedAt']).toBeInstanceOf(Date)
    await expect(withUser(a.id, (tx) => tx`delete from habit where id = ${habit['id'] as string}`)).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('habit_log', () => {
  it('takes its owner from the habit, never from the client', async () => {
    const a = await createUser()
    const b = await createUser()
    const habit = await insertHabit(a)

    const [log] = await withUser(a.id, (tx) => tx`insert into habit_log (habit_id, user_id, date) values (${habit['id'] as string}, ${b.id}, '2026-11-22') returning user_id`)
    expect(log).toMatchObject({ userId: a.id })

    // B may not write a row for A's habit at all: the trigger sets A's id and the policy refuses it.
    await expect(
      withUser(b.id, (tx) => tx`insert into habit_log (habit_id, date) values (${habit['id'] as string}, '2026-11-23')`),
    ).rejects.toThrow(/row-level security/)
  })

  it('keeps one row per day and stays invisible to others', async () => {
    const a = await createUser()
    const b = await createUser()
    const habit = await insertHabit(a)
    const insert = (user: TestUser, date: string) =>
      withUser(user.id, (tx) => tx`insert into habit_log (habit_id, date) values (${habit['id'] as string}, ${date})`)

    await insert(a, '2026-11-22')
    await expect(insert(a, '2026-11-22')).rejects.toThrow(/habit_log_pkey/)
    expect(await withUser(b.id, (tx) => tx`select * from habit_log`)).toHaveLength(0)
  })

  it('disappears with its habit', async () => {
    const a = await createUser()
    const habit = await insertHabit(a)
    await withUser(a.id, (tx) => tx`insert into habit_log (habit_id, date) values (${habit['id'] as string}, '2026-11-22')`)
    await withSystem((tx) => tx`delete from habit where id = ${habit['id'] as string}`)
    const rows = await withSystem((tx) => tx`select * from habit_log`)
    expect(rows).toHaveLength(0)
  })
})
