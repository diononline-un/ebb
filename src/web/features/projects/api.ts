import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  Project as ProjectSchema,
  ProjectProgress as ProjectProgressSchema,
  type ProjectCreate,
  type ProjectPatch,
} from '../../../shared/schemas/projects.ts'
import type { Task } from '../../../shared/schemas/task.ts'
import { apiFetch } from '../../lib/api.ts'

export type Project = z.infer<typeof ProjectSchema>
export type ProjectProgress = z.infer<typeof ProjectProgressSchema>
/** One project with the tasks that hang on it (GET /api/projects/:id). */
export type ProjectDetail = ProjectProgress & { tasks: Task[] }

// The list and the detail share the 'projects' prefix, so one write refreshes both.
const PROJECTS_KEY = ['projects'] as const

export function useProjects() {
  return useQuery({ queryKey: PROJECTS_KEY, queryFn: () => apiFetch<ProjectProgress[]>('/api/projects') })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, id] as const,
    queryFn: () => apiFetch<ProjectDetail>(`/api/projects/${id}`),
  })
}

export async function createProject(input: ProjectCreate): Promise<ProjectProgress> {
  return apiFetch<ProjectProgress>('/api/projects', { method: 'POST', body: JSON.stringify(input) })
}

export async function patchProject(id: string, patch: ProjectPatch): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
}

function useProjectWrite<TInput>(write: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
    },
  })
}

export function useCreateProject() {
  return useProjectWrite(createProject)
}

export function usePatchProject() {
  return useProjectWrite(({ id, patch }: { id: string; patch: ProjectPatch }) => patchProject(id, patch))
}

export function useDeleteProject() {
  return useProjectWrite(deleteProject)
}

/**
 * The list sends a ratio and the open count, never the raw numbers. Both follow from what is left:
 * total = open / (1 - ratio), done = total - open. A finished project hides its total, so it gets
 * no numbers at all (0 tasks does the same via progress null).
 */
export function doneOfTotal(entry: ProjectProgress): { done: number; total: number } | null {
  if (entry.progress === null || entry.progress >= 1) return null
  const total = Math.round(entry.openCount / (1 - entry.progress))
  return { done: total - entry.openCount, total }
}
