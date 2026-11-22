import type { Tx } from '../../db.ts'
import {
  ACTIVE_GOAL_LIMIT,
  type Goal,
  type GoalCreate,
  type GoalPatch,
  type GoalStatus,
} from '../../../shared/schemas/goals.ts'

/** A goal rule said no; the route turns it into its HTTP answer. */
export class GoalError extends Error {
  readonly status: 404 | 422
  readonly code: string

  constructor(status: 404 | 422, code: string) {
    super(code)
    this.name = 'GoalError'
    this.status = status
    this.code = code
  }
}

type GoalRow = {
  id: string
  title: string
  why: string
  status: GoalStatus
  position: number
  createdAt: Date
}

const COLUMNS = 'id, title, why, status, position, created_at'

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    why: row.why,
    status: row.status,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  }
}

/** The owner's goals in their own order. RLS limits the table to app.uid(). */
export async function listGoals(tx: Tx): Promise<Goal[]> {
  const rows = await tx.unsafe<GoalRow[]>(`select ${COLUMNS} from goal order by position, created_at`)
  return rows.map(toGoal)
}

/** PRD F8: 1–5 active goals per person. Paused and done ones do not count. */
async function assertRoomForAnotherActive(tx: Tx): Promise<void> {
  const [row] = await tx<{ count: number }[]>`select count(*)::int as count from goal where status = 'active'`
  if ((row?.count ?? 0) >= ACTIVE_GOAL_LIMIT) throw new GoalError(422, 'too_many_goals')
}

export async function createGoal(tx: Tx, input: GoalCreate): Promise<Goal> {
  const status = input.status ?? 'active'
  if (status === 'active') await assertRoomForAnotherActive(tx)

  const [row] = await tx.unsafe<GoalRow[]>(
    `insert into goal (title, why, status, position)
     values ($1, $2, $3, (select coalesce(max(position) + 1, 0) from goal))
     returning ${COLUMNS}`,
    [input.title, input.why ?? '', status],
  )
  if (!row) throw new Error('goal insert returned nothing')
  return toGoal(row)
}

const PATCHABLE = [
  ['title', 'title'],
  ['why', 'why'],
  ['status', 'status'],
  ['position', 'position'],
] as const

export async function patchGoal(tx: Tx, id: string, patch: GoalPatch): Promise<Goal> {
  const [current] = await tx.unsafe<GoalRow[]>(`select ${COLUMNS} from goal where id = $1`, [id])
  if (!current) throw new GoalError(404, 'not_found')
  // Reactivating a paused or finished goal spends one of the five places.
  if (patch.status === 'active' && current.status !== 'active') await assertRoomForAnotherActive(tx)

  const assignments: string[] = []
  const values: (string | number)[] = []
  for (const [key, column] of PATCHABLE) {
    const value = patch[key]
    if (value === undefined) continue
    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }
  if (assignments.length === 0) return toGoal(current)

  const [row] = await tx.unsafe<GoalRow[]>(
    `update goal set ${assignments.join(', ')} where id = $${values.length + 1} returning ${COLUMNS}`,
    [...values, id],
  )
  if (!row) throw new GoalError(404, 'not_found')
  return toGoal(row)
}

/** Deletes a goal. Its habits stay, without a goal (ON DELETE SET NULL). */
export async function deleteGoal(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`delete from goal where id = ${id} returning id`
  if (!row) throw new GoalError(404, 'not_found')
}
