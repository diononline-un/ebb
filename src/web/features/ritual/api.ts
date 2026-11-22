import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DayEnergy, Energy, RitualDone } from '../../../shared/schemas/day.ts'
import { apiFetch } from '../../lib/api.ts'

const TODAY_KEY = ['today'] as const
const SKIPPED_PREFIX = 'ebb.ritual.skipped.'

/** True once this day's ritual was left; Today then only offers the quiet line. */
export function ritualSkipped(date: string): boolean {
  try {
    return localStorage.getItem(SKIPPED_PREFIX + date) === '1'
  } catch {
    return false
  }
}

export function skipRitual(date: string): void {
  try {
    localStorage.setItem(SKIPPED_PREFIX + date, '1')
  } catch {
    // Private mode without storage: the ritual may open once more, which is harmless.
  }
}

/** The morning ritual only reads GET /api/today; these two calls are all it writes. */
export async function setEnergy(energy: Energy): Promise<DayEnergy> {
  return apiFetch<DayEnergy>('/api/day/energy', { method: 'PUT', body: JSON.stringify({ energy }) })
}

export async function finishRitual(): Promise<RitualDone> {
  return apiFetch<RitualDone>('/api/day/ritual-done', { method: 'POST' })
}

export function useSetEnergy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setEnergy,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: TODAY_KEY })
    },
  })
}

export function useFinishRitual() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: finishRitual,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: TODAY_KEY })
    },
  })
}
