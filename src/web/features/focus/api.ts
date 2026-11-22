import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FocusSession, FocusStart } from '../../../shared/schemas/focus.ts'
import { apiFetch } from '../../lib/api.ts'

const FOCUS_KEY = ['focus'] as const

/** The running session, so a reload picks the timer up where it was. */
export function useCurrentFocus() {
  return useQuery({
    queryKey: ['focus', 'current'],
    queryFn: () => apiFetch<FocusSession | null>('/api/focus/current'),
  })
}

export async function startFocus(input: FocusStart): Promise<FocusSession> {
  return apiFetch<FocusSession>('/api/focus', { method: 'POST', body: JSON.stringify(input) })
}

export async function stopFocus(id: string): Promise<FocusSession> {
  return apiFetch<FocusSession>(`/api/focus/${id}/stop`, { method: 'POST' })
}

export function useStartFocus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: startFocus,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: FOCUS_KEY })
    },
  })
}

export function useStopFocus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: stopFocus,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: FOCUS_KEY })
    },
  })
}

/** The user's usual session length; 25 minutes until the settings arrive. */
export function useTimerDefault(): number {
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<{ timerDefaultMin: number }>('/api/settings'),
  })
  return query.data?.timerDefaultMin ?? 25
}
