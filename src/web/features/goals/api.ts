import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Goal, GoalCreate, GoalPatch } from '../../../shared/schemas/goals.ts'
import { apiFetch } from '../../lib/api.ts'

const GOALS_KEY = ['goals'] as const

export function useGoals() {
  return useQuery({ queryKey: GOALS_KEY, queryFn: () => apiFetch<Goal[]>('/api/goals') })
}

export async function createGoal(input: GoalCreate): Promise<Goal> {
  return apiFetch<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(input) })
}

export async function patchGoal(id: string, patch: GoalPatch): Promise<Goal> {
  return apiFetch<Goal>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function deleteGoal(id: string): Promise<void> {
  await apiFetch(`/api/goals/${id}`, { method: 'DELETE' })
}

function useGoalWrite<TInput, TResult = unknown>(write: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: GOALS_KEY })
    },
  })
}

export function useCreateGoal() {
  return useGoalWrite(createGoal)
}

export function usePatchGoal() {
  return useGoalWrite(({ id, patch }: { id: string; patch: GoalPatch }) => patchGoal(id, patch))
}

export function useDeleteGoal() {
  return useGoalWrite(deleteGoal)
}
