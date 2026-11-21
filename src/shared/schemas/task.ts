import { z } from 'zod'
import type { TriageAnswer as TriageAnswerType } from '../triage.ts'

// API shapes for tasks and the planning views (E2). Field names follow the glossary in
// docs/architektur.md; dates are calendar days 'YYYY-MM-DD', timestamps ISO strings.

export const TaskStatus = z.enum(['todo', 'doing', 'waiting', 'done', 'skipped'])
export const Slot = z.enum(['inbox', 'block1', 'block2', 'block3', 'block4', 'errands'])
export const BlockSlot = z.enum(['block1', 'block2', 'block3', 'block4'])
export const CalendarDate = z.iso.date()

export const Task = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  createdBy: z.string(),
  assigneeId: z.string().nullable(),
  title: z.string(),
  notes: z.string(),
  nextStep: z.string(),
  status: TaskStatus,
  doDate: CalendarDate.nullable(),
  deadline: CalendarDate.nullable(),
  must: z.boolean(),
  slot: Slot,
  position: z.number().int(),
  anchor: z.boolean(),
  pushCount: z.number().int(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
})
export type Task = z.infer<typeof Task>

const title = z.string().trim().min(1).max(200)

export const TaskCreate = z.object({
  title,
  notes: z.string().max(5000).optional(),
  /** Defaults to today on the server. */
  doDate: CalendarDate.nullable().optional(),
  deadline: CalendarDate.nullable().optional(),
  slot: Slot.optional(),
  /** Defaults to the personal space. */
  spaceId: z.uuid().optional(),
})
export type TaskCreate = z.infer<typeof TaskCreate>

export const TaskPatch = z.object({
  title: title.optional(),
  notes: z.string().max(5000).optional(),
  nextStep: z.string().max(280).optional(),
  status: TaskStatus.optional(),
  doDate: CalendarDate.nullable().optional(),
  deadline: CalendarDate.nullable().optional(),
  must: z.boolean().optional(),
  slot: Slot.optional(),
  position: z.number().int().min(0).optional(),
  anchor: z.boolean().optional(),
  /** With anchor: true, replaces today's current anchor instead of answering 409 anchor_exists. */
  replaceAnchor: z.boolean().optional(),
})
export type TaskPatch = z.infer<typeof TaskPatch>

export const TriageAnswer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('must_today'), slot: BlockSlot }),
  z.object({ kind: z.literal('later'), date: CalendarDate }),
  z.object({ kind: z.literal('errand') }),
  z.object({ kind: z.literal('today'), slot: BlockSlot }),
])
// Compile-time guard: the schema and the pure type in src/shared/triage.ts stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const triageInSync: Same<z.infer<typeof TriageAnswer>, TriageAnswerType> = true
void triageInSync

/** Warnings travel next to the task; they never block (docs/specs/E02-kern.md). */
export const TaskWarning = z.enum(['must_many', 'deadline_before_do_date'])
export const TaskResult = z.object({ task: Task, warnings: z.array(TaskWarning) })

export const TodayView = z.object({
  date: CalendarDate,
  energy: z.enum(['low', 'good']).nullable(),
  rolledCount: z.number().int(),
  anchor: Task.nullable(),
  must: z.array(Task),
  slots: z.object({
    inbox: z.array(Task),
    block1: z.array(Task),
    block2: z.array(Task),
    block3: z.array(Task),
    block4: z.array(Task),
  }),
  errandsOpen: z.number().int(),
  doneToday: z.array(Task),
})
export type TodayView = z.infer<typeof TodayView>

export const ListView = z.enum(['inbox', 'tomorrow', 'week', 'errands', 'waiting', 'done', 'skipped'])

export const TaskListView = z.object({
  view: ListView,
  /** One group per calendar day where the view is dated (week, done, skipped), otherwise one group with date null. */
  groups: z.array(z.object({ date: CalendarDate.nullable(), tasks: z.array(Task) })),
})
export type TaskListView = z.infer<typeof TaskListView>
