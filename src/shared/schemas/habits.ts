import { z } from 'zod'
import { CalendarDate } from './task.ts'

// API shapes for habits (E4). A habit belongs to one person, optionally to a goal, and is archived
// instead of deleted so its history survives.

export const Cadence = z.enum(['daily', 'weekly_count'])
export type Cadence = z.infer<typeof Cadence>

/** 0 = Sunday … 6 = Saturday, the numbering weekStart() in src/shared/day.ts uses. */
export const Weekday = z.number().int().min(0).max(6)

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
const ReminderTime = z.string().regex(TIME_OF_DAY, 'time_must_be_hh_mm')

export const Habit = z.object({
  id: z.uuid(),
  goalId: z.uuid().nullable(),
  name: z.string(),
  cadence: Cadence,
  weeklyTarget: z.number().int().nullable(),
  weekdays: z.array(Weekday).nullable(),
  reminderTime: z.string().nullable(),
  position: z.number().int(),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type Habit = z.infer<typeof Habit>

const name = z.string().trim().min(1).max(80)
const weekdays = z.array(Weekday).min(1).max(7)
const weeklyTarget = z.number().int().min(1).max(7)

export const HabitCreate = z.object({
  name,
  goalId: z.uuid().optional(),
  cadence: Cadence.optional(),
  weeklyTarget: weeklyTarget.optional(),
  weekdays: weekdays.optional(),
  reminderTime: ReminderTime.nullable().optional(),
})
export type HabitCreate = z.infer<typeof HabitCreate>

export const HabitPatch = z.object({
  name: name.optional(),
  goalId: z.uuid().nullable().optional(),
  cadence: Cadence.optional(),
  weeklyTarget: weeklyTarget.nullable().optional(),
  weekdays: weekdays.nullable().optional(),
  reminderTime: ReminderTime.nullable().optional(),
  position: z.number().int().min(0).optional(),
  /** true archives the habit, false brings it back. */
  archived: z.boolean().optional(),
})
export type HabitPatch = z.infer<typeof HabitPatch>

/** One ticked (or unticked) day. */
export const HabitDay = z.object({ habitId: z.uuid(), date: CalendarDate, done: z.boolean() })
export type HabitDay = z.infer<typeof HabitDay>

/** "5 of 7 this week": done = logs of this week, target = the week's y (shared/habit-week.ts). */
export const HabitWeek = z.object({ done: z.number().int(), target: z.number().int() })
export type HabitWeek = z.infer<typeof HabitWeek>

export const HabitWithWeek = Habit.extend({
  week: HabitWeek,
  doneToday: z.boolean(),
  /** Yesterday can still be caught up; older days are closed (PRD F9). */
  doneYesterday: z.boolean(),
})
export type HabitWithWeek = z.infer<typeof HabitWithWeek>

export const HabitToday = Habit.extend({ doneToday: z.boolean(), week: HabitWeek })
export type HabitToday = z.infer<typeof HabitToday>

export const HabitsToday = z.object({ date: CalendarDate, habits: z.array(HabitToday) })
export type HabitsToday = z.infer<typeof HabitsToday>
