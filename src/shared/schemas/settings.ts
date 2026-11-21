import { z } from 'zod'

// Settings the owner may change (E1-P5). Onboarding state, last_day_started and user_access are
// server-side only and never part of a patch.

export const LOCALES = ['en', 'es', 'fr', 'de', 'ja', 'zh-CN'] as const

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
const timeOfDay = z.string().regex(TIME_OF_DAY, 'time_must_be_hh_mm')

const TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'))

export const Notify = z.object({
  morning: z.boolean(),
  habits: z.boolean(),
  weeklyReset: z.boolean(),
  errands: z.boolean(),
  timer: z.boolean(),
  trial: z.boolean(),
})

export const SettingsPatch = z.object({
  locale: z.enum(LOCALES).optional(),
  timezone: z
    .string()
    .refine((value) => TIME_ZONES.has(value), 'unknown_timezone')
    .optional(),
  dayStartMinute: z.number().int().min(0).max(720).optional(),
  morningReminder: timeOfDay.nullable().optional(),
  weeklyResetDow: z.number().int().min(0).max(6).optional(),
  weeklyResetTime: timeOfDay.optional(),
  errandsDow: z.number().int().min(0).max(6).nullable().optional(),
  quietStart: timeOfDay.optional(),
  quietEnd: timeOfDay.optional(),
  mustWarnAt: z.number().int().min(3).max(5).optional(),
  timerDefaultMin: z.number().int().min(5).max(180).optional(),
  // A patch may carry only the switches it flips; flags it omits keep their stored value.
  notify: Notify.partial().optional(),
})

export type Notify = z.infer<typeof Notify>
export type SettingsPatch = z.infer<typeof SettingsPatch>
