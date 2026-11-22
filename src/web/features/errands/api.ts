import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api.ts'

/**
 * The errand weekday from the settings, null when the user has no errand day. The two lists and
 * today come from the tasks and today endpoints, so only this one is new here.
 */
export function useErrandsDow() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<{ errandsDow: number | null }>('/api/settings'),
    select: (settings) => settings.errandsDow,
  })
}
