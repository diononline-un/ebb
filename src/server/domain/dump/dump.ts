import { DumpLine, type DumpCreate } from '../../../shared/schemas/dump.ts'
import { Task } from '../../../shared/schemas/task.ts'
import type { Tx } from '../../db.ts'

const DUMP_COLUMNS = 'id, client_id, text, task_id, archived_at, created_at'

// Calendar days are cast to text: postgres.js would hand back a Date at local midnight, and the
// API speaks 'YYYY-MM-DD'. Timestamps stay timestamps and are serialised to ISO strings.
const TASK_COLUMNS = `id, space_id, created_by, assignee_id, title, notes, next_step, status,
  do_date::text as do_date, deadline::text as deadline, must, slot, position, anchor, push_count,
  completed_at, created_at, updated_at`

type DumpRow = {
  id: string
  clientId: string
  text: string
  taskId: string | null
  archivedAt: Date | null
  createdAt: Date
}

type TaskRow = {
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

function toDumpLine(row: DumpRow): DumpLine {
  return DumpLine.parse({
    ...row,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  })
}

function toTask(row: TaskRow): Task {
  return Task.parse({
    ...row,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

/** Active lines, oldest first — the dump is read top to bottom. Runs inside withUser. */
export async function listActiveDump(tx: Tx): Promise<DumpLine[]> {
  const rows = await tx.unsafe<DumpRow[]>(
    `select ${DUMP_COLUMNS} from dump_line where archived_at is null order by created_at asc, id asc`,
  )
  return rows.map(toDumpLine)
}

/** Archived lines for the history view, newest first, capped at 200. */
export async function listArchivedDump(tx: Tx): Promise<DumpLine[]> {
  const rows = await tx.unsafe<DumpRow[]>(
    `select ${DUMP_COLUMNS} from dump_line where archived_at is not null order by archived_at desc, id desc limit 200`,
  )
  return rows.map(toDumpLine)
}

/**
 * Stores one thought. The client id makes the call idempotent: a replayed offline request answers
 * 200 with the line that is already there instead of a second row.
 */
export async function createDumpLine(tx: Tx, input: DumpCreate): Promise<{ line: DumpLine; created: boolean }> {
  const [inserted] = await tx.unsafe<DumpRow[]>(
    `insert into dump_line (client_id, text) values ($1, $2)
     on conflict (user_id, client_id) do nothing
     returning ${DUMP_COLUMNS}`,
    [input.clientId, input.text],
  )
  if (inserted) return { line: toDumpLine(inserted), created: true }

  const [existing] = await tx.unsafe<DumpRow[]>(
    `select ${DUMP_COLUMNS} from dump_line where client_id = $1`,
    [input.clientId],
  )
  if (!existing) throw new Error('dump line vanished after a client id conflict')
  return { line: toDumpLine(existing), created: false }
}

/** Marks a line as archived. Archiving twice answers the same line; rows are never deleted. */
export async function archiveDumpLine(tx: Tx, id: string): Promise<DumpLine | null> {
  const [archived] = await tx.unsafe<DumpRow[]>(
    `update dump_line set archived_at = now() where id = $1 and archived_at is null returning ${DUMP_COLUMNS}`,
    [id],
  )
  if (archived) return toDumpLine(archived)

  const [existing] = await tx.unsafe<DumpRow[]>(`select ${DUMP_COLUMNS} from dump_line where id = $1`, [id])
  return existing ? toDumpLine(existing) : null
}

/**
 * Turns a dump line into a task in the personal space: title is the text cut to 200 characters,
 * due today, waiting in the inbox. A line that already has a task answers that task, never a second.
 */
export async function dumpLineToTask(tx: Tx, id: string, today: string): Promise<Task | null> {
  // FOR UPDATE: a double tap sends two requests; the second waits here and then sees task_id set.
  const [line] = await tx.unsafe<{ id: string; text: string; taskId: string | null }[]>(
    'select id, text, task_id from dump_line where id = $1 for update',
    [id],
  )
  if (!line) return null

  if (line.taskId) {
    const [existing] = await tx.unsafe<TaskRow[]>(`select ${TASK_COLUMNS} from task where id = $1`, [line.taskId])
    if (!existing) throw new Error('dump line points at a missing task')
    return toTask(existing)
  }

  const [space] = await tx<{ id: string }[]>`
    select id from space where owner_id = app.uid() and kind = 'personal'`
  if (!space) throw new Error('missing personal space')

  // Array.from counts code points, so a cut never splits a character; the column allows 200.
  const title = Array.from(line.text).slice(0, 200).join('')
  const [created] = await tx.unsafe<TaskRow[]>(
    `insert into task (space_id, title, do_date, slot) values ($1, $2, $3, 'inbox')
     returning ${TASK_COLUMNS}`,
    [space.id, title, today],
  )
  if (!created) throw new Error('task insert returned nothing')

  await tx.unsafe('update dump_line set task_id = $1 where id = $2', [created.id, id])
  return toTask(created)
}
