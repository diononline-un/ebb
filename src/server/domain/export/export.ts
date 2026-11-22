import type { Tx } from '../../db.ts'

// Everything a person owns, as one JSON answer (PRD F14 / E9-P4). It runs inside withUser, so RLS
// decides the scope: the export cannot contain anything the person does not see in the app.

export type ExportPayload = {
  exportedAt: string
  user: { id: string; email: string; name: string }
  settings: Record<string, unknown> | null
  spaces: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  dumpLines: Record<string, unknown>[]
  goals: Record<string, unknown>[]
  habits: Record<string, unknown>[]
  habitLogs: Record<string, unknown>[]
  projects: Record<string, unknown>[]
  recurrences: Record<string, unknown>[]
  dayEntries: Record<string, unknown>[]
  focusSessions: Record<string, unknown>[]
  weeklyResets: Record<string, unknown>[]
}

export async function exportEverything(
  tx: Tx,
  user: { id: string; email: string; name: string },
  exportedAt: string,
): Promise<ExportPayload> {
  // Calendar days are cast to text, timestamps stay ISO strings: the file must survive a round trip.
  const settings = await tx<Record<string, unknown>[]>`
    select locale, timezone, day_start_minute, last_day_started::text as last_day_started,
           morning_reminder::text as morning_reminder, weekly_reset_dow,
           weekly_reset_time::text as weekly_reset_time, errands_dow, quiet_start::text as quiet_start,
           quiet_end::text as quiet_end, must_warn_at, timer_default_min, notify,
           onboarding_step, onboarding_done_at
      from user_settings where user_id = app.uid()`

  const spaces = await tx<Record<string, unknown>[]>`
    select s.id, s.name, s.kind, m.role, m.joined_at
      from space s join space_member m on m.space_id = s.id and m.user_id = app.uid()
     order by s.created_at`

  const tasks = await tx<Record<string, unknown>[]>`
    select id, space_id, created_by, assignee_id, title, notes, next_step, status,
           do_date::text as do_date, deadline::text as deadline, must, slot, position, anchor,
           push_count, project_id, parent_id, recurrence_id, completed_at, created_at, updated_at
      from task order by created_at`

  const dumpLines = await tx<Record<string, unknown>[]>`
    select id, text, task_id, archived_at, created_at from dump_line order by created_at`

  const goals = await tx<Record<string, unknown>[]>`
    select id, title, why, status, position, created_at from goal order by position, created_at`

  const habits = await tx<Record<string, unknown>[]>`
    select id, goal_id, name, cadence, weekly_target, weekdays, reminder_time::text as reminder_time,
           position, archived_at, created_at
      from habit order by position, created_at`

  const habitLogs = await tx<Record<string, unknown>[]>`
    select habit_id, date::text as date, created_at from habit_log order by date`

  const projects = await tx<Record<string, unknown>[]>`
    select id, space_id, goal_id, name, status, start_date::text as start_date,
           deadline::text as deadline, created_at
      from project order by created_at`

  const recurrences = await tx<Record<string, unknown>[]>`
    select id, space_id, title, notes, project_id, rule, starts_on::text as starts_on,
           last_generated_on::text as last_generated_on, active, created_at
      from recurrence order by created_at`

  const dayEntries = await tx<Record<string, unknown>[]>`
    select date::text as date, energy, rolled_count, ritual_done_at
      from day_entry order by date`

  const focusSessions = await tx<Record<string, unknown>[]>`
    select id, task_id, slot, planned_minutes, started_at, ended_at
      from focus_session order by started_at`

  const weeklyResets = await tx<Record<string, unknown>[]>`
    select week_start::text as week_start, went_well, went_badly, change, step, completed_at
      from weekly_reset order by week_start`

  return {
    exportedAt,
    user,
    settings: settings[0] ?? null,
    spaces,
    tasks,
    dumpLines,
    goals,
    habits,
    habitLogs,
    projects,
    recurrences,
    dayEntries,
    focusSessions,
    weeklyResets,
  }
}
