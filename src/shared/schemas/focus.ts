import { z } from 'zod'
import { BlockSlot } from './task.ts'

// Focus sessions behind the timer (E3). The client counts down from startedAt + plannedMinutes.

export const FocusSession = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  slot: BlockSlot.nullable(),
  plannedMinutes: z.number().int(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
})
export type FocusSession = z.infer<typeof FocusSession>

export const FocusStart = z.object({
  /** 25, 50, 90 or a custom length; 10 in the low-energy mode. */
  plannedMinutes: z.number().int().min(5).max(180),
  taskId: z.uuid().nullable().optional(),
  slot: BlockSlot.nullable().optional(),
})
export type FocusStart = z.infer<typeof FocusStart>
