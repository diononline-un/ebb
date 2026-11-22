import type { FocusSession, FocusStart } from '../../../shared/schemas/focus.ts'
import type { Tx } from '../../db.ts'

/** A focus rule said no; the route turns it into its HTTP answer. */
export class FocusError extends Error {
  readonly status: 404 | 422
  readonly code: string

  constructor(status: 404 | 422, code: string) {
    super(code)
    this.name = 'FocusError'
    this.status = status
    this.code = code
  }
}

type FocusRow = {
  id: string
  taskId: string | null
  slot: FocusSession['slot']
  plannedMinutes: number
  startedAt: Date
  endedAt: Date | null
}

const COLUMNS = 'id, task_id, slot, planned_minutes, started_at, ended_at'

function toSession(row: FocusRow): FocusSession {
  return {
    id: row.id,
    taskId: row.taskId,
    slot: row.slot,
    plannedMinutes: row.plannedMinutes,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  }
}

/** The running session, so a reload can pick the timer up where it was. */
export async function currentFocus(tx: Tx): Promise<FocusSession | null> {
  const [row] = await tx.unsafe<FocusRow[]>(`select ${COLUMNS} from focus_session where ended_at is null`)
  return row ? toSession(row) : null
}

/** Starts a session; a running one ends first, because there is only ever one timer. */
export async function startFocus(tx: Tx, input: FocusStart): Promise<FocusSession> {
  const taskId = input.taskId ?? null
  if (taskId) {
    // The foreign key alone would accept any existing task; RLS here limits it to tasks the user sees.
    const [task] = await tx`select id from task where id = ${taskId}`
    if (!task) throw new FocusError(422, 'unknown_task')
  }
  await tx`update focus_session set ended_at = now() where ended_at is null`
  const [row] = await tx.unsafe<FocusRow[]>(
    `insert into focus_session (task_id, slot, planned_minutes) values ($1, $2, $3) returning ${COLUMNS}`,
    [taskId, input.slot ?? null, input.plannedMinutes],
  )
  if (!row) throw new Error('focus_session insert returned nothing')
  return toSession(row)
}

/** Ends a session. Stopping an ended one answers it unchanged; a foreign or unknown id is 404. */
export async function stopFocus(tx: Tx, id: string): Promise<FocusSession> {
  const [row] = await tx.unsafe<FocusRow[]>(
    `update focus_session set ended_at = coalesce(ended_at, now()) where id = $1 returning ${COLUMNS}`,
    [id],
  )
  if (!row) throw new FocusError(404, 'not_found')
  return toSession(row)
}
