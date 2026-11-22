import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Habit, HabitCreate, HabitDay, HabitPatch, HabitsToday, HabitWithWeek } from '../../../shared/schemas/habits.ts'
import { apiFetch } from '../../lib/api.ts'

const LIST_KEY = ['habits'] as const
const TODAY_KEY = ['habits', 'today'] as const

/** Every habit with its week stand; active first, archived last. */
export function useHabits() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiFetch<HabitWithWeek[]>('/api/habits') })
}

/** The habits of today, with the done state and the week stand. */
export function useHabitsToday() {
  return useQuery({ queryKey: TODAY_KEY, queryFn: () => apiFetch<HabitsToday>('/api/habits/today') })
}

export async function createHabit(input: HabitCreate): Promise<Habit> {
  return apiFetch<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(input) })
}

export async function patchHabit(id: string, patch: HabitPatch): Promise<Habit> {
  return apiFetch<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function logHabitDay(id: string, date: string): Promise<HabitDay> {
  return apiFetch<HabitDay>(`/api/habits/${id}/log/${date}`, { method: 'PUT' })
}

export async function clearHabitDay(id: string, date: string): Promise<void> {
  await apiFetch(`/api/habits/${id}/log/${date}`, { method: 'DELETE' })
}

/** Every habit write moves the list, today's section and the goals that show a week stand. */
function useHabitWrite<TInput>(write: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: LIST_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      ])
    },
  })
}

export function useCreateHabit() {
  return useHabitWrite(createHabit)
}

export function usePatchHabit() {
  return useHabitWrite(({ id, patch }: { id: string; patch: HabitPatch }) => patchHabit(id, patch))
}

export function useLogHabit() {
  return useHabitWrite(({ id, date }: { id: string; date: string }) => logHabitDay(id, date))
}

export function useClearHabit() {
  return useHabitWrite(({ id, date }: { id: string; date: string }) => clearHabitDay(id, date))
}
