import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import type { Recurrence, RecurrenceCreate } from '../../../shared/schemas/recurrence.ts'
import {
  TaskResult as TaskResultSchema,
  TaskStatus as TaskStatusSchema,
  type Task,
  type TaskCreate,
  type TaskPatch,
  type TodayView,
} from '../../../shared/schemas/task.ts'
import type { TriageAnswer } from '../../../shared/triage.ts'
import { apiFetch } from '../../lib/api.ts'
import { trackEvent } from '../../lib/events.ts'

// Type aliases live here because the .tsx files must stay free of generic brackets: the
// no-hardcoded-text test reads ">" … "<" as JSX text and `Promise<X>` looks exactly like that.
export type TaskResult = z.infer<typeof TaskResultSchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>
/** Patches one task by id (the task page passes this straight to the sheet). */
export type TaskPatcher = (id: string, patch: TaskPatch) => Promise<TaskResult>
/** Patches the task the sheet is showing. */
export type PatchHandler = (patch: TaskPatch) => Promise<TaskResult>
export type DeleteHandler = (id: string) => Promise<void>

/** The task inside the sheet, with the subtasks under it (GET /api/tasks/:id, E5). */
export type TaskDetail = {
  task: Task
  subtasks: Task[]
  /** done / (all subtasks − skipped); null while no subtask exists. */
  progress: { done: number; total: number } | null
}
/** A rule that makes tasks on its own days; it lives in its own list (GET /api/recurrences). */
export type RecurrenceRule = Recurrence['rule']

export type SubtaskInput = { title: string; parentId: string; projectId?: string }

const TODAY_KEY = ['today'] as const
const RECURRENCES_KEY = ['recurrences'] as const

export function useToday() {
  return useQuery({ queryKey: TODAY_KEY, queryFn: () => apiFetch<TodayView>('/api/today') })
}

export async function patchTask(id: string, patch: TaskPatch): Promise<TaskResult> {
  const result = await apiFetch<TaskResult>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  // E10-P6: activation counts an anchor that was set and one that was finished (PRD §10). This is the
  // one place every anchor change goes through, from the ritual as well as from today.
  if (patch.anchor === true) trackEvent('anchor.set')
  if (patch.status === 'done' && result.task.anchor) trackEvent('anchor.done')
  return result
}

export async function createTask(input: TaskCreate): Promise<TaskResult> {
  return apiFetch<TaskResult>('/api/tasks', { method: 'POST', body: JSON.stringify(input) })
}

export async function triageTask(id: string, answer: TriageAnswer): Promise<TaskResult> {
  return apiFetch<TaskResult>(`/api/tasks/${id}/triage`, {
    method: 'POST',
    body: JSON.stringify(answer),
  })
}

export async function deleteTask(id: string): Promise<void> {
  await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })
}

/** Applies a patch to the cached task objects so the checkbox reacts before the server answers. */
function patchInView(view: TodayView, id: string, patch: TaskPatch): TodayView {
  const now = new Date().toISOString()

  const next = (task: Task): Task => {
    if (task.id !== id) return task
    const updated: Task = { ...task }
    if (patch.title !== undefined) updated.title = patch.title
    if (patch.notes !== undefined) updated.notes = patch.notes
    if (patch.nextStep !== undefined) updated.nextStep = patch.nextStep
    if (patch.doDate !== undefined) updated.doDate = patch.doDate
    if (patch.deadline !== undefined) updated.deadline = patch.deadline
    if (patch.must !== undefined) updated.must = patch.must
    if (patch.slot !== undefined) updated.slot = patch.slot
    if (patch.anchor !== undefined) updated.anchor = patch.anchor
    if (patch.status !== undefined) {
      updated.status = patch.status
      updated.completedAt = patch.status === 'done' ? (task.completedAt ?? now) : null
    }
    return updated
  }

  return {
    ...view,
    anchor: view.anchor ? next(view.anchor) : null,
    must: view.must.map(next),
    slots: {
      inbox: view.slots.inbox.map(next),
      block1: view.slots.block1.map(next),
      block2: view.slots.block2.map(next),
      block3: view.slots.block3.map(next),
      block4: view.slots.block4.map(next),
    },
    doneToday: view.doneToday.map(next),
  }
}

/** Patch with an optimistic cache update; the refetch after the answer sorts the task into its place. */
export function usePatchTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => patchTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: TODAY_KEY })
      const previous = queryClient.getQueryData<TodayView>(TODAY_KEY)
      if (previous) queryClient.setQueryData(TODAY_KEY, patchInView(previous, id, patch))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(TODAY_KEY, context.previous)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: TODAY_KEY })
    },
  })
}

/** The open task with its subtasks; disabled while the sheet shows nothing. */
export function useTaskDetail(id: string | null) {
  return useQuery({
    queryKey: ['tasks', 'detail', id ?? ''] as const,
    queryFn: () => apiFetch<TaskDetail>(`/api/tasks/${id}`),
    enabled: id !== null,
  })
}

/** Adds a subtask under the open task. The server keeps subtasks one level deep. */
export function useAddSubtask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SubtaskInput) => createTask(input),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      ])
    },
  })
}

/** Every rule of the user. The sheet lists the ones its task came from. */
export function useRecurrences() {
  return useQuery({ queryKey: RECURRENCES_KEY, queryFn: () => apiFetch<Recurrence[]>('/api/recurrences') })
}

/** A new rule starts today and makes its first task at the next day start (E5-P3). */
export function useCreateRecurrence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RecurrenceCreate) =>
      apiFetch<Recurrence>('/api/recurrences', { method: 'POST', body: JSON.stringify(input) }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RECURRENCES_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      ])
    },
  })
}
