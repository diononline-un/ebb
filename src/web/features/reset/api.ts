import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResetCurrent, ResetPatch, StuckDecision } from '../../../shared/schemas/reset.ts'
import { apiFetch } from '../../lib/api.ts'

// The weekly reset (PRD F12): one week, four steps, everything saved as it comes in. The server owns
// the week, the step and the answers; this module only moves the shapes to and from /api/reset.

const RESET_KEY = ['reset'] as const
const TODAY_KEY = ['today'] as const

/** The week's reset: answers, step, the numbers, the stuck tasks and the seven days ahead. */
export function useReset() {
  return useQuery({ queryKey: RESET_KEY, queryFn: () => apiFetch<ResetCurrent>('/api/reset/current') })
}

/**
 * Today offers its quiet line on the day the reset week ends, and only while that week is open.
 * The week ends on the configured reset day (docs/specs/E06-weekly-reset.md).
 */
export function resetReady(view: ResetCurrent | undefined, today: string): boolean {
  return view !== undefined && view.completedAt === null && view.weekEnd === today
}

export async function saveReset(patch: ResetPatch): Promise<ResetCurrent> {
  return apiFetch<ResetCurrent>('/api/reset/current', { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function decideStuck(taskId: string, decision: StuckDecision): Promise<void> {
  await apiFetch(`/api/reset/stuck/${taskId}`, { method: 'POST', body: JSON.stringify(decision) })
}

export async function completeReset(): Promise<{ completedAt: string }> {
  return apiFetch<{ completedAt: string }>('/api/reset/complete', { method: 'POST' })
}

export function useSaveReset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveReset,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: RESET_KEY })
    },
  })
}

/** Every decision touches a task, so Today has to be read again as well. */
export function useDecideStuck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, decision }: { taskId: string; decision: StuckDecision }) => decideStuck(taskId, decision),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RESET_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      ])
    },
  })
}

export function useCompleteReset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeReset,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RESET_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      ])
    },
  })
}

/**
 * "Sunday, 16 November" for a calendar day. The reset speaks in days, never in times, and the server
 * hands the day over as a plain date, so it is read and written in UTC like everywhere else.
 */
export function formatDay(date: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}
