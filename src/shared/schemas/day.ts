import { z } from 'zod'
import { CalendarDate } from './task.ts'

// The user's day beyond its tasks: energy check and morning ritual (E3).

export const Energy = z.enum(['low', 'good'])
export type Energy = z.infer<typeof Energy>

export const EnergyBody = z.object({ energy: Energy })

export const DayEnergy = z.object({ date: CalendarDate, energy: Energy })
export type DayEnergy = z.infer<typeof DayEnergy>

export const RitualDone = z.object({ date: CalendarDate, ritualDoneAt: z.iso.datetime({ offset: true }) })
export type RitualDone = z.infer<typeof RitualDone>
