import { occursOn } from '../../../shared/recurrence.ts'
import type {
  Recurrence,
  RecurrenceCreate,
  RecurrencePatch,
  RecurrenceRule,
} from '../../../shared/schemas/recurrence.ts'
import type { Tx } from '../../db.ts'
import { personalSpaceId } from '../tasks/tasks.ts'

/** A recurrence said no; the route turns it into its HTTP answer. */
export class RecurrenceError extends Error {
  readonly status: 404 | 422
  readonly code: string

  constructor(status: 404 | 422, code: string) {
    super(code)
    this.name = 'RecurrenceError'
    this.status = status
    this.code = code
  }
}

type RecurrenceRow = {
  id: string
  spaceId: string
  assigneeId: string | null
  title: string
  notes: string
  projectId: string | null
  rule: RecurrenceRule
  startsOn: string
  lastGeneratedOn: string | null
  active: boolean
  createdAt: Date
}

const COLUMNS = `id, space_id, assignee_id, title, notes, project_id, rule, starts_on::text as starts_on,
  last_generated_on::text as last_generated_on, active, created_at`

function toRecurrence(row: RecurrenceRow): Recurrence {
  return {
    id: row.id,
    spaceId: row.spaceId,
    assigneeId: row.assigneeId,
    title: row.title,
    notes: row.notes,
    projectId: row.projectId,
    rule: row.rule,
    startsOn: row.startsOn,
    lastGeneratedOn: row.lastGeneratedOn,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listRecurrences(tx: Tx): Promise<Recurrence[]> {
  const rows = await tx.unsafe<RecurrenceRow[]>(
    `select ${COLUMNS} from recurrence order by active desc, created_at`,
  )
  return rows.map(toRecurrence)
}

/** A rule only ever points at a project of its own space. */
async function assertProject(tx: Tx, projectId: string | null | undefined, spaceId: string): Promise<void> {
  if (!projectId) return
  const [project] = await tx<{ spaceId: string }[]>`select space_id from project where id = ${projectId}`
  if (!project || project.spaceId !== spaceId) throw new RecurrenceError(422, 'unknown_project')
}

export async function createRecurrence(tx: Tx, input: RecurrenceCreate): Promise<Recurrence> {
  const spaceId = input.spaceId ?? (await personalSpaceId(tx))
  await assertProject(tx, input.projectId, spaceId)

  const [row] = await tx.unsafe<RecurrenceRow[]>(
    `insert into recurrence (space_id, title, notes, project_id, rule, starts_on)
     values ($1, $2, $3, $4, $5::text::jsonb, $6) returning ${COLUMNS}`,
    [spaceId, input.title, input.notes ?? '', input.projectId ?? null, JSON.stringify(input.rule), input.startsOn],
  )
  if (!row) throw new Error('recurrence insert returned nothing')
  return toRecurrence(row)
}

/**
 * A changed rule works from the next instance on: the tasks it already made keep their day, and the
 * instance of today is created by the next day start only if the new rule asks for it.
 */
export async function patchRecurrence(tx: Tx, id: string, patch: RecurrencePatch): Promise<Recurrence> {
  const [current] = await tx.unsafe<RecurrenceRow[]>(`select ${COLUMNS} from recurrence where id = $1`, [id])
  if (!current) throw new RecurrenceError(404, 'not_found')
  if (patch.projectId !== undefined) await assertProject(tx, patch.projectId, current.spaceId)

  const [row] = await tx.unsafe<RecurrenceRow[]>(
    `update recurrence
        set title = $1, notes = $2, project_id = $3, rule = $4::text::jsonb, starts_on = $5, active = $6
      where id = $7 returning ${COLUMNS}`,
    [
      patch.title ?? current.title,
      patch.notes ?? current.notes,
      patch.projectId !== undefined ? patch.projectId : current.projectId,
      JSON.stringify(patch.rule ?? current.rule),
      patch.startsOn ?? current.startsOn,
      patch.active ?? current.active,
      id,
    ],
  )
  if (!row) throw new RecurrenceError(404, 'not_found')
  return toRecurrence(row)
}

export async function deleteRecurrence(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`delete from recurrence where id = ${id} returning id`
  if (!row) throw new RecurrenceError(404, 'not_found')
}

/**
 * The instance of today for every active rule that asks for it (E5-P3). Runs inside the day start,
 * after the rollover; `UNIQUE (recurrence_id, do_date)` and the conflict clause keep it idempotent,
 * and missed days are never caught up.
 */
export async function generateInstances(tx: Tx, today: string): Promise<number> {
  const rows = await tx.unsafe<{ id: string; rule: RecurrenceRule; startsOn: string }[]>(
    `select r.id, r.rule, r.starts_on::text as starts_on
       from recurrence r
       join space s on s.id = r.space_id
      where r.active
        and r.starts_on <= $1
        and r.last_generated_on is distinct from $1
        and (r.assignee_id = app.uid() or (r.assignee_id is null and s.kind = 'personal' and s.owner_id = app.uid()))`,
    [today],
  )

  let created = 0
  for (const row of rows) {
    if (occursOn(row.rule, row.startsOn, today)) {
      const inserted = await tx`
        insert into task (space_id, title, notes, project_id, recurrence_id, do_date, slot)
        select r.space_id, r.title, r.notes, r.project_id, r.id, ${today}, 'inbox'
          from recurrence r where r.id = ${row.id}
        on conflict (recurrence_id, do_date) where recurrence_id is not null do nothing
        returning id`
      created += inserted.length
    }
    await tx`update recurrence set last_generated_on = ${today} where id = ${row.id}`
  }
  return created
}
