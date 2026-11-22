import { z } from 'zod'
import type { HabitWeek } from './habits.ts'
import type { Task } from './task.ts'

// API shapes for the weekly reset (E6). The answers are three short texts per week (PRD F12).

export const ResetAnswers = z.object({
  wentWell: z.string().max(2000),
  wentBadly: z.string().max(2000),
  change: z.string().max(2000),
})
export type ResetAnswers = z.infer<typeof ResetAnswers>

export const ResetPatch = ResetAnswers.partial().extend({
  step: z.number().int().min(0).max(4).optional(),
})
export type ResetPatch = z.infer<typeof ResetPatch>

/** "Later" is no decision: every stuck task gets one of these four (PRD F12). */
export const StuckDecision = z
  .object({
    decision: z.enum(['date', 'split', 'skip', 'delete']),
    date: z.iso.date().optional(),
  })
  .refine((input) => input.decision !== 'date' || input.date !== undefined, {
    path: ['date'],
    message: 'date_required',
  })
export type StuckDecision = z.infer<typeof StuckDecision>

export type ResetOutlookDay = { date: string; deadline: Task[]; planned: Task[] }

/** The numbers of one week (PRD F12 step 2): counts, never grades. */
export type WeekStats = {
  weekStart: string
  weekEnd: string
  /** Days of the week whose anchor was finished. */
  anchorDays: number
  tasksDone: number
  habits: { habitId: string; name: string; goalId: string | null; week: HabitWeek }[]
  projects: { projectId: string; name: string; done: number }[]
  focusMinutes: number
  /** How often work came along from the day before. */
  rolledCount: number
}

export type ResetCurrent = {
  weekStart: string
  weekEnd: string
  step: number
  wentWell: string
  wentBadly: string
  change: string
  completedAt: string | null
  stats: WeekStats
  stuck: Task[]
  outlook: ResetOutlookDay[]
}

export type ResetHistoryWeek = {
  weekStart: string
  completedAt: string | null
  wentWell: string
  wentBadly: string
  change: string
}
