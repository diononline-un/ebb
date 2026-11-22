import { addDays, isBefore } from '../../../shared/day.ts'
import type {
  Project,
  ProjectCreate,
  ProjectPatch,
  ProjectProgress,
  ProjectWarning,
} from '../../../shared/schemas/projects.ts'
import type { Task } from '../../../shared/schemas/task.ts'
import type { Tx } from '../../db.ts'
import { personalSpaceId, TASK_COLUMNS, toTask, type TaskRow } from '../tasks/tasks.ts'

/** A project rule said no; the route turns it into its HTTP answer. */
export class ProjectError extends Error {
  readonly status: 404 | 422
  readonly code: string

  constructor(status: 404 | 422, code: string) {
    super(code)
    this.name = 'ProjectError'
    this.status = status
    this.code = code
  }
}

type ProjectRow = {
  id: string
  spaceId: string
  goalId: string | null
  name: string
  status: 'active' | 'paused' | 'done'
  startDate: string | null
  deadline: string | null
  createdAt: Date
}

const COLUMNS = `id, space_id, goal_id, name, status, start_date::text as start_date,
  deadline::text as deadline, created_at`

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    spaceId: row.spaceId,
    goalId: row.goalId,
    name: row.name,
    status: row.status,
    startDate: row.startDate,
    deadline: row.deadline,
    createdAt: row.createdAt.toISOString(),
  }
}

type Counts = {
  total: number
  done: number
  open: number
  planned: number
}

type ProgressRow = ProjectRow & Counts

const COUNT_COLUMNS = `
  count(t.id) filter (where t.status <> 'skipped')::int as total,
  count(t.id) filter (where t.status = 'done')::int as done,
  count(t.id) filter (where t.status in ('todo', 'doing', 'waiting'))::int as open,
  count(t.id) filter (where t.status in ('todo', 'doing') and t.do_date is not null)::int as planned`

/** Progress is done / (all − skipped); a project without tasks has null, never 0 %. */
function progressOf(counts: Counts): number | null {
  return counts.total === 0 ? null : counts.done / counts.total
}

/**
 * The two warnings of PRD F10: a deadline within three days that is not met, and an active project
 * without anything planned.
 */
function warningsOf(project: Project, counts: Counts, today: string): ProjectWarning[] {
  const warnings: ProjectWarning[] = []
  const progress = progressOf(counts)
  if (project.deadline && !isBefore(addDays(today, 3), project.deadline) && (progress ?? 0) < 1) {
    warnings.push('deadline_soon')
  }
  if (project.status === 'active' && counts.open > 0 && counts.planned === 0) warnings.push('no_next_step')
  return warnings
}

const PROGRESS_SQL = `select p.id, p.space_id, p.goal_id, p.name, p.status,
    p.start_date::text as start_date, p.deadline::text as deadline, p.created_at,
    ${COUNT_COLUMNS}
  from project p
  left join task t on t.project_id = p.id`

export async function listProjects(tx: Tx, today: string): Promise<ProjectProgress[]> {
  const rows = await tx.unsafe<ProgressRow[]>(
    `${PROGRESS_SQL} group by p.id order by (p.status = 'done'), p.created_at`,
  )
  return rows.map((row) => {
    const project = toProject(row)
    return {
      project,
      progress: progressOf(row),
      openCount: row.open,
      warnings: warningsOf(project, row, today),
    }
  })
}

export type ProjectDetail = ProjectProgress & { tasks: Task[] }

export async function loadProject(tx: Tx, id: string, today: string): Promise<ProjectDetail> {
  const [row] = await tx.unsafe<ProgressRow[]>(`${PROGRESS_SQL} where p.id = $1 group by p.id`, [id])
  if (!row) throw new ProjectError(404, 'not_found')
  const tasks = await tx.unsafe<TaskRow[]>(
    `select ${TASK_COLUMNS} from task where project_id = $1 order by status, do_date nulls last, position`,
    [id],
  )
  const project = toProject(row)
  return {
    project,
    progress: progressOf(row),
    openCount: row.open,
    warnings: warningsOf(project, row, today),
    tasks: tasks.map(toTask),
  }
}

async function assertKnownGoal(tx: Tx, goalId: string | null | undefined): Promise<void> {
  if (!goalId) return
  const [goal] = await tx<{ id: string }[]>`select id from goal where id = ${goalId}`
  if (!goal) throw new ProjectError(422, 'unknown_goal')
}

export async function createProject(tx: Tx, input: ProjectCreate, today: string): Promise<ProjectProgress> {
  await assertKnownGoal(tx, input.goalId)
  const spaceId = input.spaceId ?? (await personalSpaceId(tx))
  const [row] = await tx.unsafe<ProjectRow[]>(
    `insert into project (space_id, goal_id, name, start_date, deadline)
     values ($1, $2, $3, $4, $5) returning ${COLUMNS}`,
    [spaceId, input.goalId ?? null, input.name, input.startDate ?? today, input.deadline ?? null],
  )
  if (!row) throw new Error('project insert returned nothing')
  const project = toProject(row)
  return { project, progress: null, openCount: 0, warnings: warningsOf(project, { total: 0, done: 0, open: 0, planned: 0 }, today) }
}

const PATCHABLE = [
  ['name', 'name'],
  ['status', 'status'],
  ['startDate', 'start_date'],
  ['deadline', 'deadline'],
  ['goalId', 'goal_id'],
] as const

export async function patchProject(tx: Tx, id: string, patch: ProjectPatch, today: string): Promise<ProjectDetail> {
  await assertKnownGoal(tx, patch.goalId)

  const assignments: string[] = []
  const values: (string | null)[] = []
  for (const [key, column] of PATCHABLE) {
    const value = patch[key]
    if (value === undefined) continue
    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }
  if (assignments.length > 0) {
    const [updated] = await tx.unsafe<{ id: string }[]>(
      `update project set ${assignments.join(', ')} where id = $${values.length + 1} returning id`,
      [...values, id],
    )
    if (!updated) throw new ProjectError(404, 'not_found')
  }
  return loadProject(tx, id, today)
}

export async function deleteProject(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`delete from project where id = ${id} returning id`
  if (!row) throw new ProjectError(404, 'not_found')
}
