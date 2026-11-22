import { z } from 'zod'
import { addDays } from '../../../shared/day.ts'
import { Task } from '../../../shared/schemas/task.ts'
import {
  ListView as ListViewSchema,
  TaskListView as TaskListViewSchema,
  TodayView as TodayViewSchema,
  type TaskListView,
  type TodayView,
} from '../../../shared/schemas/task.ts'
import type { Tx } from '../../db.ts'
import { TASK_COLUMNS, toTask, type TaskRow } from './tasks.ts'

type ListView = z.infer<typeof ListViewSchema>

type GroupedRow = TaskRow & { groupDate?: string | null }

function singleGroup(rows: TaskRow[]): TaskListView['groups'] {
  return [{ date: null, tasks: rows.map(toTask) }]
}

/** One group per calendar day, in the order the rows arrive (the query already sorts them). */
function groupedByDate(rows: GroupedRow[]): TaskListView['groups'] {
  const groups = new Map<string | null, Task[]>()
  for (const row of rows) {
    const key = row.groupDate ?? null
    const tasks = groups.get(key) ?? []
    tasks.push(toTask(row))
    groups.set(key, tasks)
  }
  return [...groups.entries()].map(([date, tasks]) => ({ date, tasks }))
}

/**
 * The Today screen: everything assigned to the user for their day. The anchor and the must tasks
 * appear only in their own fields, never again in a slot (docs/specs/E02-kern.md).
 */
export async function loadTodayView(tx: Tx, today: string): Promise<TodayView> {
  const rows = await tx.unsafe<TaskRow[]>(
    `select ${TASK_COLUMNS} from task
      where assignee_id = app.uid() and do_date = $1
      order by slot, position, created_at, id`,
    [today],
  )
  const [entry] = await tx<{ energy: 'low' | 'good' | null; rolledCount: number; ritualDoneAt: Date | null }[]>`
    select energy, rolled_count, ritual_done_at from day_entry where user_id = app.uid() and date = ${today}`
  const [errands] = await tx<{ count: number }[]>`
    select count(*)::int as count from task
     where assignee_id = app.uid() and slot = 'errands' and status in ('todo', 'doing')`

  const tasks = rows.map(toTask)
  const doneToday = tasks
    .filter((task) => task.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  // Skipped means "not today": it belongs to the plan, not to the day.
  const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'skipped')
  const anchor = open.find((task) => task.anchor) ?? null
  const regular = open.filter((task) => !task.anchor && !task.must)

  return TodayViewSchema.parse({
    date: today,
    energy: entry?.energy ?? null,
    rolledCount: entry?.rolledCount ?? 0,
    anchor,
    must: open.filter((task) => task.must && !task.anchor),
    slots: {
      inbox: regular.filter((task) => task.slot === 'inbox'),
      block1: regular.filter((task) => task.slot === 'block1'),
      block2: regular.filter((task) => task.slot === 'block2'),
      block3: regular.filter((task) => task.slot === 'block3'),
      block4: regular.filter((task) => task.slot === 'block4'),
    },
    errandsOpen: errands?.count ?? 0,
    doneToday,
    ritualDoneAt: entry?.ritualDoneAt ? entry.ritualDoneAt.toISOString() : null,
  })
}

/** The Plan screen. Week, Done and Not today group by day; every other view is one flat group. */
export async function loadTaskList(tx: Tx, view: ListView, today: string): Promise<TaskListView> {
  const tomorrow = addDays(today, 1)

  switch (view) {
    case 'inbox': {
      // The unsorted pile of today. Tasks parked on a later day (triage "later") also sit in the inbox
      // slot, but they were sorted already; they show up under Tomorrow/Week and come back on their day.
      const rows = await tx.unsafe<TaskRow[]>(
        `select ${TASK_COLUMNS} from task
          where assignee_id = app.uid() and slot = 'inbox' and status in ('todo', 'doing')
            and (do_date is null or do_date <= $1)
          order by do_date nulls last, position, created_at, id`,
        [today],
      )
      return TaskListViewSchema.parse({ view, groups: singleGroup(rows) })
    }

    case 'tomorrow': {
      const rows = await tx.unsafe<TaskRow[]>(
        `select ${TASK_COLUMNS} from task
          where assignee_id = app.uid() and do_date = $1 and status in ('todo', 'doing')
          order by position, created_at, id`,
        [tomorrow],
      )
      return TaskListViewSchema.parse({ view, groups: singleGroup(rows) })
    }

    case 'week': {
      const rows = await tx.unsafe<GroupedRow[]>(
        `select ${TASK_COLUMNS}, do_date::text as group_date from task
          where assignee_id = app.uid() and do_date between $1 and $2 and status in ('todo', 'doing')
          order by do_date, position, created_at, id`,
        [tomorrow, addDays(today, 7)],
      )
      return TaskListViewSchema.parse({ view, groups: groupedByDate(rows) })
    }

    case 'errands': {
      const rows = await tx.unsafe<TaskRow[]>(
        `select ${TASK_COLUMNS} from task
          where assignee_id = app.uid() and slot = 'errands' and status in ('todo', 'doing')
          order by position, created_at, id`,
      )
      return TaskListViewSchema.parse({ view, groups: singleGroup(rows) })
    }

    case 'waiting': {
      const rows = await tx.unsafe<TaskRow[]>(
        `select ${TASK_COLUMNS} from task
          where assignee_id = app.uid() and status = 'waiting'
          order by do_date nulls last, position, created_at, id`,
      )
      return TaskListViewSchema.parse({ view, groups: singleGroup(rows) })
    }

    case 'done': {
      // Grouped by the day it was planned for: completed_at is a timestamp, and the user's day
      // starts at 04:00, so its UTC date would put early-morning work on the wrong day.
      const rows = await tx.unsafe<GroupedRow[]>(
        `select ${TASK_COLUMNS}, do_date::text as group_date from task
          where assignee_id = app.uid() and status = 'done' and completed_at >= $1::date
          order by do_date desc nulls last, completed_at desc, id`,
        [addDays(today, -30)],
      )
      return TaskListViewSchema.parse({ view, groups: groupedByDate(rows) })
    }

    case 'skipped': {
      const rows = await tx.unsafe<GroupedRow[]>(
        `select ${TASK_COLUMNS}, do_date::text as group_date from task
          where assignee_id = app.uid() and status = 'skipped' and updated_at::date >= $1::date
          order by do_date desc nulls last, updated_at desc, id`,
        [addDays(today, -30)],
      )
      return TaskListViewSchema.parse({ view, groups: groupedByDate(rows) })
    }
  }
}
