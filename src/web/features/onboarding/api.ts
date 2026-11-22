import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SettingsPatch } from '../../../shared/schemas/settings.ts'
import { ApiError, apiFetch } from '../../lib/api.ts'

// The onboarding reads GET /api/me (settings.onboardingStep, onboardingDoneAt) and writes three
// things: its own step, the finish, and the times it asks for in step 8.

export type OnboardingSettings = {
  timezone: string
  morningReminder: string | null
  weeklyResetDow: number
  weeklyResetTime: string
  onboardingStep: number
  onboardingDoneAt: string | null
}

export type Me = {
  user: { id: string; email: string; name: string }
  settings: OnboardingSettings
  /** Whether writing is open right now, and why (E8-P4). */
  access: { access: boolean; reason: 'selfhost' | 'trial' | 'own' | 'seat' | 'none'; trialEndsAt: string | null; selfhost: boolean }
}

const ME_KEY = ['me'] as const

/**
 * `enabled` false keeps the public screens from asking. The query reads without apiFetch's redirect
 * on 401: a transient "no session yet" must not throw anyone out of the app, the root layout simply
 * waits for the next answer.
 */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ME_KEY,
    enabled,
    queryFn: async (): Promise<Me> => {
      const response = await fetch('/api/me', { credentials: 'include', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new ApiError(response.status, 'me_failed')
      return (await response.json()) as Me
    },
  })
}

export async function saveOnboardingStep(step: number): Promise<{ step: number }> {
  return apiFetch<{ step: number }>('/api/onboarding', { method: 'PUT', body: JSON.stringify({ step }) })
}

export async function finishOnboarding(): Promise<{ onboardingDoneAt: string }> {
  return apiFetch<{ onboardingDoneAt: string }>('/api/onboarding/done', { method: 'POST' })
}

export async function patchSettings(patch: SettingsPatch): Promise<void> {
  await apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) })
}

function useMeWrite<TInput>(write: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY })
    },
  })
}

export function useSaveStep() {
  return useMeWrite(saveOnboardingStep)
}

/**
 * Finishing clears the redirect and marks the day's ritual: the root layout reads onboardingDoneAt
 * from ['me'], and Today has to see ritualDoneAt before it decides to open the ritual.
 */
export function useFinishOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: finishOnboarding,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ME_KEY }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
      ])
    },
  })
}
