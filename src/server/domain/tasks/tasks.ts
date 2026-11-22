import { z } from 'zod'
import {
  Task,
  TaskWarning as TaskWarningSchema,
  type TaskCreate,
  type TaskPatch,
} from '../../../shared/schemas/task.ts'
import { triagePatch, type TriageAnswer } from '../../../shared/triage.ts'
import type { Tx } from '../../db.ts'
import { applyRules, TaskError, type RuleContext } from './rules.ts'

/** Calendar days are cast to text: postgres.js would hand back a Date at local midnight. */
export const TASK_COLUMNS = `id, space_id, created_by, assignee_id, title, notes, next_step, status,
  do_date::text as do_date, deadline::text as deadline, must, slot, position, anchor, push_count,
  completed_at, created_at, updated_at`

export type TaskRow = {
  id: string
  spaceId: string
  createdBy: string
  assigneeId: string | null
  title: string
  notes: string
  nextStep: string
  status: string
  doDate: string | null
  deadline: string | null
  must: boolean
  slot: string
  position: number
  anchor: boolean
  pushCount: number
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export function toTask(row: TaskRow): Task {
  return Task.parse({
    ...row,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

type TaskWarning = z.infer<typeof TaskWarningSchema>

export type TaskData = { task: Task; warnings: TaskWarning[] }

export async function personalSpaceId(tx: Tx): Promise<string> {
  const [space] = await tx<{ id: string }[]>`
    select id from space where owner_id = app.uid() and kind = 'personal'`
  if (!space) throw new Error('missing personal space')
  return space.id
}

/** One task of a space the user belongs to; RLS hides everything else, so null means "not there". */
export async function loadTaskRow(tx: Tx, id: string): Promise<TaskRow | null> {
  const [row] = await tx.unsafe<TaskRow[]>(`select ${TASK_COLUMNS} from task where id = $1`, [id])
  return row ?? null
}

/** The task that was just placed at an explicit position, and whether it goes before a tied neighbour. */
type Placed = { id: string; first: boolean }

/**
 * Gives every task of one (assignee, day, slot) a gap-free position 0..n-1, keeping the order.
 * A task just placed at position p shares p with a neighbour; `placed` decides the tie by the
 * direction of the move (dropped into a new group or moved up: before it, moved down: after it),
 * so the task ends exactly at the index it was dropped on. Only changed rows are written.
 */
async function renumberSlot(
  tx: Tx,
  assigneeId: string | null,
  doDate: string | null,
  slot: string,
  placed: Placed | null = null,
): Promise<void> {
  const placedId = placed?.id ?? null
  const placedRank = placed?.first ? 0 : 2
  await tx`
    with numbered as (
      select id, row_number() over (
               order by position,
                        case when id = ${placedId}::uuid then ${placedRank}::int else 1 end,
                        created_at, id
             ) - 1 as new_position
        from task
       where assignee_id = coalesce(${assigneeId}::text, app.uid())
         and do_date is not distinct from ${doDate}::date
         and slot = ${slot}
    )
    update task set position = numbered.new_position
      from numbered
     where task.id = numbered.id and task.position <> numbered.new_position`
}

export async function createTask(tx: Tx, input: TaskCreate, ctx: RuleContext): Promise<TaskData> {
  const spaceId = input.spaceId ?? (await personalSpaceId(tx))
  const requested: TaskPatch = {
    title: input.title,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
    ...(input.slot === undefined ? {} : { slot: input.slot }),
    doDate: input.doDate === undefined ? ctx.today : input.doDate,
  }
  const outcome = await applyRules(tx, null, requested, ctx)

  const slot = outcome.write.slot ?? 'inbox'
  const doDate = outcome.write.doDate ?? null
  const [row] = await tx.unsafe<TaskRow[]>(
    `insert into task (space_id, title, notes, do_date, deadline, slot, position)
     values ($1, $2, $3, $4, $5, $6,
             (select coalesce(max(position) + 1, 0) from task
               where assignee_id = app.uid() and do_date is not distinct from $4::date and slot = $6))
     returning ${TASK_COLUMNS}`,
    [spaceId, outcome.write.title ?? input.title, outcome.write.notes ?? '', doDate, outcome.write.deadline ?? null, slot],
  )
  if (!row) throw new Error('task insert returned nothing')
  return { task: toTask(row), warnings: outcome.warnings }
}

export async function patchTask(tx: Tx, id: string, patch: TaskPatch, ctx: RuleContext): Promise<TaskData> {
  const current = await loadTaskRow(tx, id)
  if (!current) throw new TaskError(404, 'not_found')
  const outcome = await applyRules(tx, current, patch, ctx)

  if (outcome.clearAnchorId) {
    // Same transaction: the old anchor steps aside before the new one takes the unique index.
    await tx`update task set anchor = false where id = ${outcome.clearAnchorId}`
  }

  const write = outcome.write
  const assignments: string[] = []
  const values: (string | number | boolean | null)[] = []
  const set = (column: string, value: string | number | boolean | null) => {
    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }

  if (write.title !== undefined) set('title', write.title)
  if (write.notes !== undefined) set('notes', write.notes)
  if (write.nextStep !== undefined) set('next_step', write.nextStep)
  if (write.status !== undefined) set('status', write.status)
  if (write.doDate !== undefined) set('do_date', write.doDate)
  if (write.deadline !== undefined) set('deadline', write.deadline)
  if (write.must !== undefined) set('must', write.must)
  if (write.slot !== undefined) set('slot', write.slot)
  if (write.position !== undefined) set('position', write.position)
  if (write.anchor !== undefined) set('anchor', write.anchor)
  if (outcome.completedChange === 'set') assignments.push('completed_at = now()')
  if (outcome.completedChange === 'clear') assignments.push('completed_at = null')

  const targetSlot = write.slot ?? current.slot
  const targetDate = write.doDate !== undefined ? (write.doDate ?? null) : current.doDate
  const slotMoved = targetSlot !== current.slot
  const dateMoved = targetDate !== current.doDate

  // A task that changes slot or day joins the end of its new group; an explicit position wins.
  if ((slotMoved || dateMoved) && write.position === undefined) {
    values.push(current.assigneeId, targetDate, targetSlot)
    const assigneeRef = `$${values.length - 2}`
    const dateRef = `$${values.length - 1}`
    const slotRef = `$${values.length}`
    assignments.push(`position = coalesce((
      select max(position) + 1 from task
       where assignee_id = coalesce(${assigneeRef}::text, app.uid())
         and do_date is not distinct from ${dateRef}::date
         and slot = ${slotRef}), 0)`)
  }

  if (assignments.length === 0) return { task: toTask(current), warnings: outcome.warnings }

  values.push(id)
  const [updated] = await tx.unsafe<TaskRow[]>(
    `update task set ${assignments.join(', ')} where id = $${values.length} returning ${TASK_COLUMNS}`,
    values,
  )
  if (!updated) throw new TaskError(404, 'not_found')

  if (slotMoved || dateMoved || write.position !== undefined) {
    const placed =
      write.position === undefined
        ? null
        : { id: updated.id, first: slotMoved || dateMoved || write.position < current.position }
    await renumberSlot(tx, updated.assigneeId, updated.doDate, updated.slot, placed)
    if (slotMoved || dateMoved) await renumberSlot(tx, current.assigneeId, current.doDate, current.slot)
  }

  return { task: toTask(updated), warnings: outcome.warnings }
}

/** Applies one answer of the consequence question through the very same rules as PATCH. */
export async function triageTask(tx: Tx, id: string, answer: TriageAnswer, ctx: RuleContext): Promise<TaskData> {
  let patch: TaskPatch
  try {
    patch = triagePatch(answer, ctx.today)
  } catch (error) {
    if (error instanceof RangeError) throw new TaskError(422, 'later_must_be_future')
    throw error
  }
  return patchTask(tx, id, patch, ctx)
}

/** Deleting is the creator's or the space owner's business; the RLS policy decides, we only see 0 rows. */
export async function deleteTask(tx: Tx, id: string): Promise<void> {
  const removed = await tx<{ id: string }[]>`delete from task where id = ${id} returning id`
  if (removed.length === 0) throw new TaskError(404, 'not_found')
}
