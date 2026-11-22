import { z } from 'zod'

// API shapes for projects (E5). A project lives in a space; a personal project may hang on a goal.

export const ProjectStatus = z.enum(['active', 'paused', 'done'])
export type ProjectStatus = z.infer<typeof ProjectStatus>

export const Project = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  goalId: z.uuid().nullable(),
  name: z.string(),
  status: ProjectStatus,
  startDate: z.iso.date().nullable(),
  deadline: z.iso.date().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type Project = z.infer<typeof Project>

const name = z.string().trim().min(1).max(80)

export const ProjectCreate = z.object({
  name,
  goalId: z.uuid().nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  deadline: z.iso.date().nullable().optional(),
  spaceId: z.uuid().optional(),
})
export type ProjectCreate = z.infer<typeof ProjectCreate>

export const ProjectPatch = z.object({
  name: name.optional(),
  goalId: z.uuid().nullable().optional(),
  status: ProjectStatus.optional(),
  startDate: z.iso.date().nullable().optional(),
  deadline: z.iso.date().nullable().optional(),
})
export type ProjectPatch = z.infer<typeof ProjectPatch>

/** "deadline_soon": three days or less and not finished; "no_next_step": active, nothing planned. */
export const ProjectWarning = z.enum(['deadline_soon', 'no_next_step'])
export type ProjectWarning = z.infer<typeof ProjectWarning>

/** Progress is done / (all − skipped); a project without tasks has null, not 0 %. */
export const ProjectProgress = z.object({
  project: Project,
  progress: z.number().nullable(),
  openCount: z.number().int(),
  warnings: z.array(ProjectWarning),
})
export type ProjectProgress = z.infer<typeof ProjectProgress>
