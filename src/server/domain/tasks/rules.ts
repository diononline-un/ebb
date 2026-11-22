import { z } from 'zod'
import { isBefore } from '../../../shared/day.ts'
import { TaskWarning as TaskWarningSchema, type TaskPatch } from '../../../shared/schemas/task.ts'
import type { Tx } from '../../db.ts'

type TaskWarning = z.infer<typeof TaskWarningSchema>

/** A task rule said no. Routes translate it into the HTTP answer, so the rule stays here. */
export class TaskError extends Error {
  readonly status: 404 | 409 | 422
  readonly code: string
  readonly details: Record<string, string> | undefined

  constructor(status: 404 | 409 | 422, code: string, details?: Record<string, string>) {
    super(code)
    this.name = 'TaskError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** The fields the rules look at, so they work for an existing row and for a task about to be created. */
export type TaskSnapshot = {
  id: string
  assigneeId: string | null
  status: string
  doDate: string | null
  deadline: string | null
  must: boolean
  slot: string
  anchor: boolean
}

export type RuleContext = {
  /** The user's calendar day from todayOf(c). */
  today: string
  /** user_settings.must_warn_at: from this count on the answer carries the must_many warning. */
  mustWarnAt: number
}

export type RuleOutcome = {
  /** What to write. `replaceAnchor` is a control flag and never reaches the database. */
  write: TaskPatch
  warnings: TaskWarning[]
  /** The task holding today's anchor that gives it up because of replaceAnchor. */
  clearAnchorId: string | null
  completedChange: 'set' | 'clear' | null
}

async function anchorHolder(tx: Tx, assigneeId: string | null, today: string, excludeId: string | null) {
  const [row] = await tx<{ id: string }[]>`
    select id from task
     where anchor
       and do_date = ${today}
       and assignee_id = coalesce(${assigneeId}::text, app.uid())
       and id is distinct from ${excludeId}::uuid
     limit 1`
  return row?.id ?? null
}

async function mustCountToday(tx: Tx, assigneeId: string | null, today: string, excludeId: string | null) {
  const [row] = await tx<{ count: number }[]>`
    select count(*)::int as count
      from task
     where must
       and do_date = ${today}
       and assignee_id = coalesce(${assigneeId}::text, app.uid())
       and id is distinct from ${excludeId}::uuid`
  return row?.count ?? 0
}

/**
 * The rules of docs/specs/E02-kern.md, shared by create, patch and triage:
 * anchor only on today and only one of it, at most five musts per day, gap-free positions later.
 * `current` is null when a task is being created.
 */
export async function applyRules(
  tx: Tx,
  current: TaskSnapshot | null,
  patch: TaskPatch,
  ctx: RuleContext,
): Promise<RuleOutcome> {
  const write: TaskPatch = { ...patch }
  const warnings: TaskWarning[] = []
  let clearAnchorId: string | null = null

  const slot = patch.slot ?? current?.slot ?? 'inbox'
  let doDate = patch.doDate !== undefined ? (patch.doDate ?? null) : (current?.doDate ?? null)

  // Errands are batched, not scheduled: the column forbids a date for them (task_errands_undated).
  if (slot === 'errands' && doDate !== null) {
    doDate = null
    write.doDate = null
  }

  const anchor = patch.anchor ?? current?.anchor ?? false
  if (anchor) {
    if (doDate !== ctx.today) throw new TaskError(422, 'anchor_not_today')

    const holder = await anchorHolder(tx, current?.assigneeId ?? null, ctx.today, current?.id ?? null)
    if (holder) {
      if (!patch.replaceAnchor) throw new TaskError(409, 'anchor_exists', { currentAnchorId: holder })
      clearAnchorId = holder
    }
  }

  const must = patch.must ?? current?.must ?? false
  if (must && doDate === ctx.today) {
    const wasMustToday = Boolean(current?.must) && current?.doDate === ctx.today
    // The count without this task, plus one for the state it ends up in.
    const resulting = (await mustCountToday(tx, current?.assigneeId ?? null, ctx.today, current?.id ?? null)) + 1
    if (!wasMustToday && resulting > 5) throw new TaskError(422, 'must_limit')
    if (resulting >= ctx.mustWarnAt) warnings.push('must_many')
  }

  const deadline = patch.deadline !== undefined ? (patch.deadline ?? null) : (current?.deadline ?? null)
  if (deadline && doDate && isBefore(deadline, doDate)) warnings.push('deadline_before_do_date')

  let completedChange: RuleOutcome['completedChange'] = null
  if (current && patch.status !== undefined && patch.status !== current.status) {
    if (patch.status === 'done') completedChange = 'set'
    else if (current.status === 'done') completedChange = 'clear'
  }

  return { write, warnings, clearAnchorId, completedChange }
}
