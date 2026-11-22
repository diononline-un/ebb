import { z } from 'zod'
import type { RecurrenceRule as PureRule } from '../recurrence.ts'

// API shapes for recurring tasks (E5). The rule is stored as jsonb and read by src/shared/recurrence.ts,
// so both sides must stay identical; the guard at the bottom fails the build if they drift apart.

export const Weekday = z.number().int().min(0).max(6)

export const RecurrenceRule = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('daily') }),
  z.object({ freq: z.literal('weekdays') }),
  z.object({ freq: z.literal('weekly'), weekdays: z.array(Weekday).min(1).max(7) }),
  z.object({ freq: z.literal('every_n_days'), interval: z.number().int().min(2).max(365) }),
  z.object({ freq: z.literal('monthly'), monthDay: z.number().int().min(1).max(31) }),
])
export type RecurrenceRule = z.infer<typeof RecurrenceRule>

export const Recurrence = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  assigneeId: z.string().nullable(),
  title: z.string(),
  notes: z.string(),
  projectId: z.uuid().nullable(),
  rule: RecurrenceRule,
  startsOn: z.iso.date(),
  lastGeneratedOn: z.iso.date().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type Recurrence = z.infer<typeof Recurrence>

const title = z.string().trim().min(1).max(200)

export const RecurrenceCreate = z.object({
  title,
  notes: z.string().max(5000).optional(),
  rule: RecurrenceRule,
  startsOn: z.iso.date(),
  projectId: z.uuid().optional(),
  spaceId: z.uuid().optional(),
})
export type RecurrenceCreate = z.infer<typeof RecurrenceCreate>

export const RecurrencePatch = z.object({
  title: title.optional(),
  notes: z.string().max(5000).optional(),
  rule: RecurrenceRule.optional(),
  startsOn: z.iso.date().optional(),
  projectId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
})
export type RecurrencePatch = z.infer<typeof RecurrencePatch>

// Compile-time guard: the zod rule and the pure type in src/shared/recurrence.ts stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const ruleInSync: Same<RecurrenceRule, PureRule> = true
void ruleInSync
