import { addDays, dayOfWeek } from './day.ts'
import type { HabitWeek } from './schemas/habits.ts'

// The habit week (PRD F9): "5 of 7 this week", never a streak. Pure: the caller hands in the logs.

export type HabitRule = {
  cadence: 'daily' | 'weekly_count'
  weeklyTarget: number | null
  weekdays: number[] | null
}

/** Whether the habit asks for that day. A weekly count owns no day; it can be done any day. */
export function isDue(rule: HabitRule, date: string): boolean {
  if (rule.cadence === 'weekly_count') return true
  if (!rule.weekdays || rule.weekdays.length === 0) return true
  return rule.weekdays.includes(dayOfWeek(date))
}

/** y of "x of y this week": the seven days, the chosen weekdays, or the weekly target. */
export function weekTarget(rule: HabitRule): number {
  if (rule.cadence === 'weekly_count') return rule.weeklyTarget ?? 7
  if (!rule.weekdays || rule.weekdays.length === 0) return 7
  return new Set(rule.weekdays).size
}

/**
 * x of "x of y this week": days of that week with a log, on days the habit was due. A weekly count
 * stops counting at its target, so the line never reads "6 of 3".
 */
export function habitWeek(rule: HabitRule, logs: string[], weekStartDate: string): HabitWeek {
  const target = weekTarget(rule)
  const days = new Set(logs)
  let done = 0
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekStartDate, offset)
    if (days.has(date) && isDue(rule, date)) done += 1
  }
  return { done: Math.min(done, target), target }
}
