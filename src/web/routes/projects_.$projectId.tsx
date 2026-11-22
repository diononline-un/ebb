import { createFileRoute } from '@tanstack/react-router'
import { ProjectPage } from '../features/projects/ProjectPage.tsx'

// projects_ keeps the detail page out of the list's layout: /projects/$projectId is its own page.
export const Route = createFileRoute('/projects_/$projectId')({
  component: ProjectPage,
})
