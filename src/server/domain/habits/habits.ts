import { addDays, weekStart } from '../../../shared/day.ts'
import { habitWeek, isDue } from '../../../shared/habit-week.ts'
import type {
  Cadence,
  Habit,
  HabitCreate,
  HabitDay,
  HabitPatch,
  HabitsToday,
  HabitToday,
} from '../../../shared/schemas/habits.ts'
import type { Tx } from '../../db.ts'

/** A habit rule said no; the route turns it into its HTTP answer. */
export class HabitError extends Error {
  readonly status: 404 | 422
  readonly code: string

  constructor(status: 404 | 422, code: string) {
    super(code)
    this.name = 'HabitError'
    this.status = status
    this.code = code
  }
}

type HabitRow = {
  id: string
  goalId: string | null
  name: string
  cadence: Cadence
  weeklyTarget: number | null
  weekdays: number[] | null
  reminderTime: string | null
  position: number
  archivedAt: Date | null
  createdAt: Date
}

const COLUMNS = `id, goal_id, name, cadence, weekly_target, weekdays, reminder_time, position,
  archived_at, created_at`

function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    goalId: row.goalId,
    name: row.name,
    cadence: row.cadence,
    weeklyTarget: row.weeklyTarget,
    weekdays: row.weekdays,
    // Postgres hands back HH:MM:SS; the API speaks HH:MM in both directions.
    reminderTime: row.reminderTime ? row.reminderTime.slice(0, 5) : null,
    position: row.position,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Active habits first, then the archived ones; each group in its own order. */
export async function listHabits(tx: Tx): Promise<Habit[]> {
  const rows = await tx.unsafe<HabitRow[]>(
    `select ${COLUMNS} from habit order by (archived_at is not null), position, created_at`,
  )
  return rows.map(toHabit)
}

async function loadHabit(tx: Tx, id: string): Promise<HabitRow> {
  const [row] = await tx.unsafe<HabitRow[]>(`select ${COLUMNS} from habit where id = $1`, [id])
  if (!row) throw new HabitError(404, 'not_found')
  return row
}

/** A habit may only hang on a goal the user sees; the foreign key alone would accept any goal id. */
async function assertKnownGoal(tx: Tx, goalId: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`select id from goal where id = ${goalId}`
  if (!row) throw new HabitError(422, 'unknown_goal')
}

/** The one rule the database cannot state for a patch: a merged row must stay coherent. */
function assertCoherent(cadence: Cadence, weeklyTarget: number | null): void {
  if (cadence === 'weekly_count' && weeklyTarget === null) throw new HabitError(422, 'weekly_target_required')
}

export async function createHabit(tx: Tx, input: HabitCreate): Promise<Habit> {
  const cadence = input.cadence ?? 'daily'
  const weeklyTarget = input.weeklyTarget ?? null
  assertCoherent(cadence, weeklyTarget)
  if (input.goalId) await assertKnownGoal(tx, input.goalId)

  const [row] = await tx.unsafe<HabitRow[]>(
    `insert into habit (goal_id, name, cadence, weekly_target, weekdays, reminder_time, position)
     values ($1, $2, $3, $4, $5, $6, (select coalesce(max(position) + 1, 0) from habit))
     returning ${COLUMNS}`,
    [
      input.goalId ?? null,
      input.name,
      cadence,
      weeklyTarget,
      input.weekdays ? [...new Set(input.weekdays)].sort((a, b) => a - b) : null,
      input.reminderTime ?? null,
    ],
  )
  if (!row) throw new Error('habit insert returned nothing')
  return toHabit(row)
}

export async function patchHabit(tx: Tx, id: string, patch: HabitPatch): Promise<Habit> {
  const current = await loadHabit(tx, id)
  const cadence = patch.cadence ?? current.cadence
  // Switching to a plain daily habit drops a target the habit no longer needs.
  const weeklyTarget = patch.weeklyTarget !== undefined
    ? patch.weeklyTarget
    : cadence === 'daily' ? null : current.weeklyTarget
  assertCoherent(cadence, weeklyTarget)
  if (patch.goalId) await assertKnownGoal(tx, patch.goalId)

  const next = {
    name: patch.name ?? current.name,
    goalId: patch.goalId !== undefined ? patch.goalId : current.goalId,
    cadence,
    weeklyTarget,
    weekdays: patch.weekdays !== undefined
      ? patch.weekdays && [...new Set(patch.weekdays)].sort((a, b) => a - b)
      : current.weekdays,
    reminderTime: patch.reminderTime !== undefined ? patch.reminderTime : current.reminderTime,
    position: patch.position ?? current.position,
    archivedAt: patch.archived === undefined
      ? current.archivedAt
      : patch.archived ? (current.archivedAt ?? new Date()) : null,
  }

  const [row] = await tx.unsafe<HabitRow[]>(
    `update habit set goal_id = $1, name = $2, cadence = $3, weekly_target = $4, weekdays = $5,
            reminder_time = $6, position = $7, archived_at = $8
      where id = $9 returning ${COLUMNS}`,
    [
      next.goalId,
      next.name,
      next.cadence,
      next.weeklyTarget,
      next.weekdays,
      next.reminderTime,
      next.position,
      next.archivedAt,
      id,
    ],
  )
  if (!row) throw new HabitError(404, 'not_found')
  return toHabit(row)
}

/** Only today and yesterday can be ticked; older days are closed (PRD F9). */
function assertDayOpen(date: string, today: string): void {
  if (date !== today && date !== addDays(today, -1)) throw new HabitError(422, 'day_locked')
}

export async function logHabitDay(tx: Tx, id: string, date: string, today: string): Promise<HabitDay> {
  const habit = await loadHabit(tx, id)
  assertDayOpen(date, today)
  if (habit.archivedAt) throw new HabitError(422, 'habit_archived')

  await tx`insert into habit_log (habit_id, date) values (${id}, ${date}) on conflict do nothing`
  return { habitId: id, date, done: true }
}

export async function clearHabitDay(tx: Tx, id: string, date: string, today: string): Promise<void> {
  await loadHabit(tx, id)
  assertDayOpen(date, today)
  await tx`delete from habit_log where habit_id = ${id} and date = ${date}`
}

/**
 * The habits of today for the Today screen: everything due, plus what was already ticked today (so
 * a tap can be taken back). A weekly count stays on the list while it still needs work.
 */
export async function habitsToday(tx: Tx, today: string): Promise<HabitsToday> {
  const [settings] = await tx<{ weeklyResetDow: number }[]>`
    select weekly_reset_dow from user_settings where user_id = app.uid()`
  // The week ends on the weekly reset day, so it starts the day after it (same rule as E6).
  const weekStartDate = weekStart(today, ((settings?.weeklyResetDow ?? 0) + 1) % 7)
  const weekEnd = addDays(weekStartDate, 6)

  const rows = await tx.unsafe<HabitRow[]>(
    `select ${COLUMNS} from habit where archived_at is null order by position, created_at`,
  )
  const logs = await tx<{ habitId: string; date: string }[]>`
    select habit_id, date from habit_log where date between ${weekStartDate} and ${weekEnd}`

  const byHabit = new Map<string, string[]>()
  for (const log of logs) {
    const dates = byHabit.get(log.habitId) ?? []
    dates.push(log.date)
    byHabit.set(log.habitId, dates)
  }

  const habits: HabitToday[] = []
  for (const row of rows) {
    const habit = toHabit(row)
    const dates = byHabit.get(habit.id) ?? []
    const week = habitWeek(habit, dates, weekStartDate)
    const doneToday = dates.includes(today)
    const due = isDue(habit, today)
    const wanted = doneToday || (due && (habit.cadence !== 'weekly_count' || week.done < week.target))
    if (wanted) habits.push({ ...habit, doneToday, week })
  }

  return { date: today, habits }
}
