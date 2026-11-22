import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ListView as ListViewSchema,
  type TaskListView,
} from '../../../shared/schemas/task.ts'
import { apiFetch } from '../../lib/api.ts'

export type ListView = z.infer<typeof ListViewSchema>

export const PLAN_VIEWS: ListView[] = ['inbox', 'tomorrow', 'week', 'errands', 'waiting', 'done', 'skipped']

/** One Plan tab. Each view is its own query key, so switching tabs does not refetch the others. */
export function useTaskList(view: ListView) {
  return useQuery({
    queryKey: ['tasks', view],
    queryFn: () => apiFetch<TaskListView>(`/api/tasks?view=${view}`),
  })
}

/** Calendar days are shown in UTC so a label never slips to the day before (E2 review note). */
export function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}
