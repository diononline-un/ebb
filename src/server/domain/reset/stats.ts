import { addDays, weekStart } from '../../../shared/day.ts'
import { habitWeek } from '../../../shared/habit-week.ts'
import type { WeekStats } from '../../../shared/schemas/reset.ts'
import type { Task } from '../../../shared/schemas/task.ts'
import type { Tx } from '../../db.ts'
import { TASK_COLUMNS, toTask, type TaskRow } from '../tasks/tasks.ts'

// The numbers of a week (PRD F12 step 2): no grades, only counts. Everything runs inside withUser,
// so RLS keeps it to the person's own days, habits, projects and sessions.

/** The week a reset looks at: seven days that end on the weekly reset day. */
export async function weekOf(tx: Tx, today: string): Promise<{ weekStart: string; weekEnd: string }> {
  const [settings] = await tx<{ weeklyResetDow: number }[]>`
    select weekly_reset_dow from user_settings where user_id = app.uid()`
  const start = weekStart(today, ((settings?.weeklyResetDow ?? 0) + 1) % 7)
  return { weekStart: start, weekEnd: addDays(start, 6) }
}

export async function weekStats(tx: Tx, weekStartDate: string, weekEndDate: string): Promise<WeekStats> {
  const [days] = await tx<{ anchorDays: number; rolledCount: number }[]>`
    select count(distinct t.do_date) filter (where t.anchor and t.status = 'done')::int as anchor_days,
           coalesce((select sum(rolled_count)::int from day_entry
                      where user_id = app.uid() and date between ${weekStartDate} and ${weekEndDate}), 0) as rolled_count
      from task t
     where t.assignee_id = app.uid() and t.do_date between ${weekStartDate} and ${weekEndDate}`

  const [done] = await tx<{ tasksDone: number; focusMinutes: number }[]>`
    select (select count(*)::int from task
             where assignee_id = app.uid() and status = 'done'
               and do_date between ${weekStartDate} and ${weekEndDate}) as tasks_done,
           coalesce((select sum(planned_minutes)::int from focus_session
              where started_at >= ${weekStartDate}::date
                and started_at < (${weekEndDate}::date + 1)), 0) as focus_minutes`

  const habitRows = await tx<{
    id: string
    name: string
    goalId: string | null
    cadence: 'daily' | 'weekly_count'
    weeklyTarget: number | null
    weekdays: number[] | null
  }[]>`
    select id, name, goal_id, cadence, weekly_target, weekdays
      from habit where archived_at is null order by position, created_at`
  const logs = await tx<{ habitId: string; date: string }[]>`
    select habit_id, date from habit_log where date between ${weekStartDate} and ${weekEndDate}`
  const byHabit = new Map<string, string[]>()
  for (const log of logs) {
    const dates = byHabit.get(log.habitId) ?? []
    dates.push(log.date)
    byHabit.set(log.habitId, dates)
  }

  const projectRows = await tx<{ projectId: string; name: string; done: number }[]>`
    select p.id, p.name, count(t.id) filter (where t.status = 'done')::int as done
      from project p
      join task t on t.project_id = p.id and t.do_date between ${weekStartDate} and ${weekEndDate}
     group by p.id
     order by p.created_at`

  return {
    weekStart: weekStartDate,
    weekEnd: weekEndDate,
    anchorDays: days?.anchorDays ?? 0,
    tasksDone: done?.tasksDone ?? 0,
    habits: habitRows.map((row) => ({
      habitId: row.id,
      name: row.name,
      goalId: row.goalId,
      week: habitWeek(row, byHabit.get(row.id) ?? [], weekStartDate),
    })),
    projects: projectRows.map((row) => ({ projectId: row.projectId, name: row.name, done: row.done })),
    focusMinutes: done?.focusMinutes ?? 0,
    rolledCount: days?.rolledCount ?? 0,
  }
}

/**
 * The tasks that keep sliding (PRD F12 step 3): pushed three times or older than fourteen days, and
 * still open. Every one of them needs a decision before the reset can be completed.
 */
export async function stuckTasks(tx: Tx, today: string): Promise<Task[]> {
  const rows = await tx.unsafe<TaskRow[]>(
    `select ${TASK_COLUMNS} from task
      where assignee_id = app.uid()
        and status in ('todo', 'doing')
        and (push_count >= 3 or created_at < ($1::date - 14))
      order by push_count desc, created_at`,
    [today],
  )
  return rows.map(toTask)
}

/** The next seven days with their deadlines and planned tasks (PRD F12 step 4). */
export async function outlook(tx: Tx, today: string): Promise<{ date: string; deadline: Task[]; planned: Task[] }[]> {
  const from = addDays(today, 1)
  const to = addDays(today, 7)
  const rows = await tx.unsafe<TaskRow[]>(
    `select ${TASK_COLUMNS} from task
      where assignee_id = app.uid()
        and status in ('todo', 'doing', 'waiting')
        and (do_date between $1 and $2 or deadline between $1 and $2)
      order by do_date nulls last, position`,
    [from, to],
  )
  const tasks = rows.map(toTask)
  const days: { date: string; deadline: Task[]; planned: Task[] }[] = []
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(today, offset)
    days.push({
      date,
      deadline: tasks.filter((task) => task.deadline === date),
      planned: tasks.filter((task) => task.doDate === date && task.deadline !== date),
    })
  }
  return days
}
