import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Notify, SettingsPatch } from '../../../shared/schemas/settings.ts'
import { apiFetch } from '../../lib/api.ts'

/** The part of GET /api/settings the reminder page reads. */
export type Settings = {
  morningReminder: string | null
  weeklyResetDow: number
  weeklyResetTime: string
  errandsDow: number | null
  quietStart: string
  quietEnd: string
  notify: Notify
}

// The errands page reads the same key with a select, so both screens share one cache entry.
const SETTINGS_KEY = ['settings'] as const

export function useSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => apiFetch<Settings>('/api/settings') })
}

export function usePatchSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiFetch<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (settings) => {
      // The answer is the stored row: put it in place so a time field keeps what the user typed.
      queryClient.setQueryData(SETTINGS_KEY, settings)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
