import { z } from 'zod'

// API shapes for goals (E4). Goals are personal: no space_id, no assignee (PRD F8).

export const GoalStatus = z.enum(['active', 'paused', 'done'])
export type GoalStatus = z.infer<typeof GoalStatus>

/** From this count on, a new active goal is refused (PRD F8: 1–5 per person). */
export const ACTIVE_GOAL_LIMIT = 5

export const Goal = z.object({
  id: z.uuid(),
  title: z.string(),
  why: z.string(),
  status: GoalStatus,
  position: z.number().int(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type Goal = z.infer<typeof Goal>

const title = z.string().trim().min(1).max(80)
const why = z.string().max(280)

export const GoalCreate = z.object({
  title,
  why: why.optional(),
  status: GoalStatus.optional(),
})
export type GoalCreate = z.infer<typeof GoalCreate>

export const GoalPatch = z.object({
  title: title.optional(),
  why: why.optional(),
  status: GoalStatus.optional(),
  position: z.number().int().min(0).optional(),
})
export type GoalPatch = z.infer<typeof GoalPatch>
