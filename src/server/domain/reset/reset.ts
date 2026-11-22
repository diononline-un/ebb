import type { ResetCurrent, ResetHistoryWeek, ResetPatch, StuckDecision } from '../../../shared/schemas/reset.ts'
import type { Tx } from '../../db.ts'
import { deleteTask, patchTask } from '../tasks/tasks.ts'
import { outlook, stuckTasks, weekOf, weekStats } from './stats.ts'

/** The reset said no; the route turns it into its HTTP answer. */
export class ResetError extends Error {
  readonly status: 404 | 422
  readonly code: string

  constructor(status: 404 | 422, code: string) {
    super(code)
    this.name = 'ResetError'
    this.status = status
    this.code = code
  }
}

type ResetRow = {
  weekStart: string
  wentWell: string
  wentBadly: string
  change: string
  step: number
  completedAt: Date | null
}

const COLUMNS = `week_start::text as week_start, went_well, went_badly, change, step, completed_at`

async function loadRow(tx: Tx, weekStartDate: string): Promise<ResetRow> {
  const [row] = await tx.unsafe<ResetRow[]>(`select ${COLUMNS} from weekly_reset where week_start = $1`, [
    weekStartDate,
  ])
  return row ?? { weekStart: weekStartDate, wentWell: '', wentBadly: '', change: '', step: 0, completedAt: null }
}

/** The reset of this week: answers, step, the numbers, the stuck tasks and the seven days ahead. */
export async function loadCurrent(tx: Tx, today: string): Promise<ResetCurrent> {
  const { weekStart, weekEnd } = await weekOf(tx, today)
  const row = await loadRow(tx, weekStart)
  const [stats, stuck, ahead] = await Promise.all([
    weekStats(tx, weekStart, weekEnd),
    stuckTasks(tx, today),
    outlook(tx, today),
  ])
  return {
    weekStart,
    weekEnd,
    step: row.step,
    wentWell: row.wentWell,
    wentBadly: row.wentBadly,
    change: row.change,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    stats,
    stuck,
    outlook: ahead,
  }
}

/** Answers and step are saved as they come in, so an interrupted reset continues where it stopped. */
export async function saveCurrent(tx: Tx, today: string, patch: ResetPatch): Promise<ResetCurrent> {
  const { weekStart } = await weekOf(tx, today)
  await tx`
    insert into weekly_reset (week_start, went_well, went_badly, change, step)
    values (${weekStart}, ${patch.wentWell ?? ''}, ${patch.wentBadly ?? ''}, ${patch.change ?? ''}, ${patch.step ?? 0})
    on conflict (user_id, week_start) do update
      set went_well = coalesce(${patch.wentWell ?? null}, weekly_reset.went_well),
          went_badly = coalesce(${patch.wentBadly ?? null}, weekly_reset.went_badly),
          change = coalesce(${patch.change ?? null}, weekly_reset.change),
          step = coalesce(${patch.step ?? null}, weekly_reset.step)`
  return loadCurrent(tx, today)
}

/**
 * One decision per stuck task (PRD F12): a new day or a split clears the push count, "skip" sets it
 * aside as "not today", "delete" removes it.
 */
export async function decideStuck(
  tx: Tx,
  today: string,
  taskId: string,
  input: StuckDecision,
): Promise<void> {
  const stuck = await stuckTasks(tx, today)
  if (!stuck.some((task) => task.id === taskId)) throw new ResetError(404, 'not_found')

  switch (input.decision) {
    case 'date':
      if (!input.date) throw new ResetError(422, 'date_required')
      await patchTask(tx, taskId, { doDate: input.date, slot: 'inbox', anchor: false, must: false }, {
        today,
        mustWarnAt: 4,
      })
      await tx`update task set push_count = 0 where id = ${taskId}`
      return
    case 'split':
      await tx`update task set push_count = 0 where id = ${taskId}`
      return
    case 'skip':
      await tx`update task set status = 'skipped', push_count = 0 where id = ${taskId}`
      return
    case 'delete':
      await deleteTask(tx, taskId)
      return
  }
}

/** Only a week without open stuck tasks may be finished; each one needed a decision. */
export async function complete(tx: Tx, today: string): Promise<{ completedAt: string }> {
  const stuck = await stuckTasks(tx, today)
  if (stuck.length > 0) throw new ResetError(422, 'stuck_open')

  const { weekStart } = await weekOf(tx, today)
  const [row] = await tx<{ completedAt: Date }[]>`
    insert into weekly_reset (week_start, step, completed_at) values (${weekStart}, 4, now())
    on conflict (user_id, week_start) do update
      set step = 4, completed_at = coalesce(weekly_reset.completed_at, now())
    returning completed_at`
  if (!row?.completedAt) throw new Error('weekly_reset upsert returned nothing')
  return { completedAt: row.completedAt.toISOString() }
}

/** Earlier weeks, the finished and the half-done ones, newest first. */
export async function history(tx: Tx): Promise<ResetHistoryWeek[]> {
  const rows = await tx.unsafe<ResetRow[]>(
    `select ${COLUMNS} from weekly_reset order by week_start desc limit 52`,
  )
  return rows.map((row) => ({
    weekStart: row.weekStart,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    wentWell: row.wentWell,
    wentBadly: row.wentBadly,
    change: row.change,
  }))
}
